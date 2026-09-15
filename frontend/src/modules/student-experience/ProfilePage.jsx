import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi } from './experience-api.js';

export function ProfilePage() {
  const [state, setState] = useState({ loading: true, error: '', data: null, saved: '' });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const body = await experienceApi.profile();
      setState({ loading: false, error: '', data: body.data, saved: '' });
    } catch (caught) {
      setState({ loading: false, error: caught.message || 'Unable to load profile', data: null, saved: '' });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const body = await experienceApi.updateProfile({
        displayName: String(form.get('displayName') || ''),
        phone: String(form.get('phone') || ''),
        expectedRevision: state.data.profileRevision,
      });
      setState({ loading: false, error: '', data: body.data, saved: 'Saved.' });
    } catch (caught) {
      setState((current) => ({ ...current, error: caught.message || 'Unable to save', saved: '' }));
    }
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const body = await experienceApi.uploadPhoto(file);
      setState({ loading: false, error: '', data: body.data, saved: 'Photo updated.' });
    } catch (caught) {
      setState((current) => ({ ...current, error: caught.message || 'Photo upload failed' }));
    }
  }

  if (state.loading) {
    return <p>Loading profile…</p>;
  }
  if (!state.data) {
    return <p className="form-error">{state.error}</p>;
  }

  const identity = state.data.academicIdentity;

  return (
    <section>
      <h1>My profile</h1>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? <p>{state.saved}</p> : null}
      {state.data.hasProfileImage ? (
        <p>
          <img className="profile-photo" src="/api/me/profile/photo" alt="" width={96} height={96} />
        </p>
      ) : null}
      <dl>
        <dt>Email</dt>
        <dd>{state.data.email}</dd>
        <dt>Registration number</dt>
        <dd>{identity?.registrationNumber || 'Not a student record'}</dd>
        <dt>Department</dt>
        <dd>{state.data.department?.name || '—'}</dd>
        <dt>Batch</dt>
        <dd>{identity?.batch?.name || '—'}</dd>
        <dt>Academic year</dt>
        <dd>{identity?.academicYear?.name || '—'}</dd>
        <dt>Semester</dt>
        <dd>{identity?.semester?.name || '—'}</dd>
      </dl>
      <form onSubmit={onSubmit}>
        <label>
          Display name
          <input name="displayName" defaultValue={state.data.displayName} maxLength={80} required />
        </label>
        <label>
          Phone / WhatsApp
          <input name="phone" defaultValue={state.data.phone} autoComplete="tel" />
        </label>
        <button type="submit">Save contact details</button>
      </form>
      <label>
        Profile photo
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhoto} />
      </label>
      <p>
        Notification preferences stay in the <Link to="/notifications">notifications</Link> area. Registration
        number and role cannot be edited here.
      </p>
    </section>
  );
}
