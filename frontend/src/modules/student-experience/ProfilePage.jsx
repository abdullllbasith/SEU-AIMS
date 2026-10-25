import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi } from './experience-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatBatchLabel,
  formatSemesterLabel,
  formatYearLabel,
} from '../../ui/academic-labels.js';

export function ProfilePage() {
  const [state, setState] = useState({ loading: true, error: '', data: null, saved: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const body = await experienceApi.profile();
      setState({ loading: false, error: '', data: body.data, saved: '' });
    } catch (caught) {
      setState({
        loading: false,
        error: caught.message || 'Unable to load profile',
        data: null,
        saved: '',
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    if (saving) {
      return;
    }
    const form = new FormData(event.target);
    setSaving(true);
    try {
      const body = await experienceApi.updateProfile({
        displayName: String(form.get('displayName') || ''),
        phone: String(form.get('phone') || ''),
        expectedRevision: state.data.profileRevision,
      });
      setState({ loading: false, error: '', data: body.data, saved: 'Contact details saved.' });
    } catch (caught) {
      setState((current) => ({
        ...current,
        error: caught.message || 'Unable to save',
        saved: '',
      }));
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0];
    if (uploading) {
      return;
    }
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const body = await experienceApi.uploadPhoto(file);
      setState({ loading: false, error: '', data: body.data, saved: 'Photo updated.' });
    } catch (caught) {
      setState((current) => ({
        ...current,
        error: caught.message || 'Photo upload failed',
      }));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  if (state.loading) {
    return <PageSkeleton title="My profile" variant="record" />;
  }

  if (!state.data) {
    return (
      <section className="record-page">
        <PageHeader title="My profile" />
        <p className="form-error" role="alert">
          {state.error}
        </p>
        <button type="button" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const identity = state.data.academicIdentity;

  return (
    <section className="record-page">
      <PageHeader
        title="My profile"
        purpose="Contact details you can edit. Registration number and role are academic identity and cannot be changed here."
      />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="auth-card__status" role="status">
          {state.saved}
        </p>
      ) : null}

      <article className="panel profile-banner">
        <div className="profile-banner__main">
          {state.data.hasProfileImage ? (
            <img
              className="profile-photo"
              src="/api/me/profile/photo"
              alt=""
              width={88}
              height={88}
            />
          ) : (
            <div className="profile-photo profile-photo--placeholder" aria-hidden="true">
              {(state.data.displayName || state.data.email || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="profile-banner__copy">
            <h2 className="profile-banner__name">{state.data.displayName || state.data.email}</h2>
            <p className="profile-banner__email">{state.data.email}</p>
            <div className="profile-banner__badges">
              {state.data.department?.name ? (
                <span className="status-pill status-pill--info">{state.data.department.name}</span>
              ) : null}
              {identity?.registrationNumber ? (
                <span className="status-pill">{identity.registrationNumber}</span>
              ) : null}
            </div>
          </div>
        </div>
        <label className="profile-upload-btn">
          <span>{uploading ? 'Uploading…' : 'Change photo'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPhoto}
            disabled={uploading}
          />
        </label>
      </article>

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Academic identity" kicker="Read-only">
          <div className="profile-identity">
            <dl className="record-dl record-dl--inline">
              <div>
                <dt>Email</dt>
                <dd>{state.data.email}</dd>
              </div>
              <div>
                <dt>Registration number</dt>
                <dd>{identity?.registrationNumber || 'Not a student record'}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{state.data.department?.name || '—'}</dd>
              </div>
              <div>
                <dt>Batch</dt>
                <dd>{formatBatchLabel(identity?.batch) || '—'}</dd>
              </div>
              <div>
                <dt>Academic year</dt>
                <dd>{formatYearLabel(identity?.academicYear) || '—'}</dd>
              </div>
              <div>
                <dt>Semester</dt>
                <dd>
                  {formatSemesterLabel(identity?.semester, identity?.academicYear) || '—'}
                </dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel title="Contact details" kicker="Editable">
          <form className="settings-form" onSubmit={onSubmit}>
            <label>
              Display name
              <input
                name="displayName"
                defaultValue={state.data.displayName}
                maxLength={80}
                required
              />
            </label>
            <label>
              Phone / WhatsApp
              <input name="phone" defaultValue={state.data.phone} autoComplete="tel" />
            </label>
            <div className="panel-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save contact details'}
              </button>
            </div>
          </form>
        </Panel>
      </div>

      <p className="panel-footnote">
        Notification preferences stay in the <Link to="/notifications">notifications</Link> area.
      </p>
    </section>
  );
}
