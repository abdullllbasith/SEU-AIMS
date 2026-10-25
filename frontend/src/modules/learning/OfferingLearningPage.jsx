import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { learningApi } from './learning-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatPublicationState,
  formatResourceCategory,
  formatScanStatus,
} from '../../ui/status-labels.js';

function statusClass(publicationState, scanStatus) {
  if (publicationState === 'PUBLISHED') {
    return 'status-pill status-pill--ok';
  }
  if (scanStatus === 'PENDING' || scanStatus === 'SCANNING') {
    return 'status-pill status-pill--pending';
  }
  if (scanStatus === 'UNSAFE' || scanStatus === 'FAILED') {
    return 'status-pill status-pill--danger';
  }
  return 'status-pill';
}

export function OfferingLearningPage() {
  const { offeringId } = useParams();
  const { user } = useAuth();
  const canManage = user?.role === ROLES.LECTURER || user?.role === ROLES.DEPARTMENT_ADMINISTRATOR;
  const backTo = user?.role === ROLES.STUDENT ? '/learning' : '/lecturer/learning';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [page, setPage] = useState(null);
  const [resources, setResources] = useState([]);
  const [sectionName, setSectionName] = useState('Lecture Materials');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('LECTURE');
  const [sectionId, setSectionId] = useState('');
  const [file, setFile] = useState(null);
  const [history, setHistory] = useState(null);

  async function reload() {
    const [offering, list] = await Promise.all([
      learningApi.offering(offeringId),
      learningApi.resources(offeringId),
    ]);
    setPage(offering.data);
    setResources(list.data.items);
    const firstSection = offering.data.sections?.[0];
    setSectionId((current) => {
      if (current && offering.data.sections?.some((section) => section.id === current)) {
        return current;
      }
      return firstSection?.id || '';
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(null);
    setSectionId('');
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load offering');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  async function run(key, fn) {
    setError('');
    setPending(key);
    try {
      await fn();
      await reload();
    } catch (caught) {
      setError(caught.message || 'Request failed');
    } finally {
      setPending('');
    }
  }

  if (loading) {
    return <PageSkeleton title="Subject offering" variant="record" />;
  }

  if (error && !page) {
    return (
      <section className="record-page">
        <PageHeader title="Subject offering" />
        <p className="form-error" role="alert">
          {error}
        </p>
        <p className="panel-footnote">
          <Link to={backTo}>Back to offerings</Link>
        </p>
      </section>
    );
  }

  const offering = page.offering;
  const lecturerNames = (page.lecturers || []).map((item) => item.displayName).filter(Boolean);

  return (
    <section className="record-page learning-offering-page">
      <PageHeader
        title={`${offering.subjectCode} — ${offering.subjectName}`}
        purpose="Official resources for this subject offering only. This is not the Student Study Room."
        meta={lecturerNames.length ? `Lecturers: ${lecturerNames.join(', ')}` : null}
        actions={
          <Link className="text-action" to={backTo}>
            Back
          </Link>
        }
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <div className="learning-offering__staff">
          <p className="panel-lead panel-lead--tight learning-offering__staff-lead">
            Files stay unpublished until security scanning succeeds and you explicitly publish.
          </p>
          <div className="learning-offering__staff-grid">
            <Panel title="Sections" kicker="Organize">
              <form
                className="learning-offering-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  run('section', () => learningApi.createSection(offeringId, { name: sectionName }));
                }}
              >
                <label>
                  Section name
                  <input
                    value={sectionName}
                    onChange={(event) => setSectionName(event.target.value)}
                    required
                    maxLength={80}
                    placeholder="e.g. Lecture Materials"
                  />
                </label>
                <div className="learning-offering-form__actions">
                  <ActionButton
                    type="submit"
                    busy={pending === 'section'}
                    busyLabel="Creating…"
                    disabled={busy}
                  >
                    Create section
                  </ActionButton>
                </div>
              </form>
            </Panel>

            <Panel title="Upload resource" kicker="Draft file">
              <form
                className="learning-offering-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData();
                  data.append('title', title);
                  data.append('category', category);
                  data.append('sectionId', sectionId);
                  data.append('file', file);
                  run('upload', async () => {
                    await learningApi.createResource(offeringId, data);
                    setTitle('');
                    setFile(null);
                  });
                }}
              >
                <label>
                  Title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    placeholder="Display name for students"
                  />
                </label>
                <div className="learning-offering-form__row">
                  <label>
                    Section
                    <select
                      value={sectionId}
                      onChange={(event) => setSectionId(event.target.value)}
                      required
                    >
                      {page.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Category
                    <select value={category} onChange={(event) => setCategory(event.target.value)}>
                      <option value="LECTURE">Lecture</option>
                      <option value="TUTORIAL">Tutorial</option>
                      <option value="PRACTICAL">Practical</option>
                      <option value="REFERENCE">Reference</option>
                      <option value="PAST_PAPER">Past paper</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                </div>
                <label className="learning-offering-form__file">
                  File
                  <input type="file" onChange={(event) => setFile(event.target.files[0])} required />
                </label>
                <div className="learning-offering-form__actions">
                  <ActionButton
                    type="submit"
                    className="btn--upload"
                    busy={pending === 'upload'}
                    busyLabel="Uploading…"
                    disabled={busy || !file || !sectionId}
                  >
                    Upload draft
                  </ActionButton>
                </div>
              </form>
            </Panel>
          </div>
        </div>
      ) : null}

      <Panel title="Materials" kicker={`${resources.length} resource${resources.length === 1 ? '' : 's'}`}>
        {resources.length === 0 ? (
          <EmptyState to={backTo} action="Back to offerings">
            No official resources are available in this offering.
          </EmptyState>
        ) : null}

        {page.sections.map((section) => {
          const sectionResources = resources.filter((item) => item.sectionId === section.id);
          if (!sectionResources.length && !canManage) {
            return null;
          }
          return (
            <div key={section.id} className="material-section">
              <div className="material-section__head">
                <h3>{section.name}</h3>
                <span className="material-section__count">
                  {sectionResources.length} file{sectionResources.length === 1 ? '' : 's'}
                </span>
              </div>
              {sectionResources.length === 0 ? (
                <p className="deadline-empty">No resources in this section yet.</p>
              ) : (
                <ul className="resource-list">
                  {sectionResources.map((item) => (
                    <li key={item.id} className="resource-row">
                      <div className="resource-row__main">
                        <p className="resource-row__title">{item.title}</p>
                        <p className="resource-row__meta">
                          {formatResourceCategory(item.category)}
                          {item.scanStatus ? ` · ${formatScanStatus(item.scanStatus)}` : ''}
                        </p>
                      </div>
                      <div className="resource-row__aside">
                        {item.publicationState ? (
                          <span className={statusClass(item.publicationState, item.scanStatus)}>
                            {formatPublicationState(item.publicationState)}
                          </span>
                        ) : null}
                        {item.publicationState === 'PUBLISHED' || canManage ? (
                          <a className="text-action" href={learningApi.downloadUrl(item.id)}>
                            Download
                          </a>
                        ) : null}
                        {canManage &&
                        item.scanStatus === 'SAFE' &&
                        item.publicationState !== 'PUBLISHED' ? (
                          <ActionButton
                            busy={pending === `publish:${item.id}`}
                            busyLabel="Publishing…"
                            disabled={busy}
                            onClick={() => run(`publish:${item.id}`, () => learningApi.publish(item.id))}
                          >
                            Publish
                          </ActionButton>
                        ) : null}
                        {canManage && item.publicationState === 'PUBLISHED' ? (
                          <ActionButton
                            busy={pending === `unpublish:${item.id}`}
                            busyLabel="Unpublishing…"
                            disabled={busy}
                            onClick={() => run(`unpublish:${item.id}`, () => learningApi.unpublish(item.id))}
                          >
                            Unpublish
                          </ActionButton>
                        ) : null}
                        {canManage ? (
                          <>
                            <ActionButton
                              busy={pending === `versions:${item.id}`}
                              busyLabel="Loading…"
                              disabled={busy}
                              onClick={() => {
                                setPending(`versions:${item.id}`);
                                learningApi
                                  .versions(item.id)
                                  .then((response) =>
                                    setHistory({ title: item.title, ...response.data }),
                                  )
                                  .catch((caught) => setError(caught.message))
                                  .finally(() => setPending(''));
                              }}
                            >
                              Versions
                            </ActionButton>
                            <ActionButton
                              busy={pending === `archive:${item.id}`}
                              busyLabel="Archiving…"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Archive this official resource? Students will no longer see it.',
                                  )
                                ) {
                                  run(`archive:${item.id}`, () => learningApi.archive(item.id));
                                }
                              }}
                            >
                              Archive
                            </ActionButton>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {history ? (
          <p className="panel-footnote">
            {history.title}: current version {history.currentVersion}. Earlier files kept:{' '}
            {history.items.length}.
          </p>
        ) : null}
      </Panel>
    </section>
  );
}
