import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { learningApi } from './learning-api.js';
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
  const [busy, setBusy] = useState(false);
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

  async function run(fn) {
    setError('');
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (caught) {
      setError(caught.message || 'Request failed');
    } finally {
      setBusy(false);
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
    <section className="record-page admin-page">
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
        <Panel title="Organize and publish" kicker="Staff only">
          <p className="panel-lead">
            Files stay unpublished until security scanning succeeds and you explicitly publish.
          </p>
          <div className="form-grid form-grid--wide">
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => learningApi.createSection(offeringId, { name: sectionName }));
              }}
            >
              <label>
                Section name
                <input
                  value={sectionName}
                  onChange={(event) => setSectionName(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? 'Working…' : 'Create section'}
              </button>
            </form>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData();
                data.append('title', title);
                data.append('category', category);
                data.append('sectionId', sectionId);
                data.append('file', file);
                run(async () => {
                  await learningApi.createResource(offeringId, data);
                  setTitle('');
                  setFile(null);
                });
              }}
            >
              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} required />
              </label>
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
              <label>
                File
                <input type="file" onChange={(event) => setFile(event.target.files[0])} required />
              </label>
              <button type="submit" disabled={busy || !file || !sectionId}>
                {busy ? 'Uploading…' : 'Upload draft'}
              </button>
            </form>
          </div>
        </Panel>
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
              <h3>{section.name}</h3>
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
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => learningApi.publish(item.id))}
                          >
                            Publish
                          </button>
                        ) : null}
                        {canManage && item.publicationState === 'PUBLISHED' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => learningApi.unpublish(item.id))}
                          >
                            Unpublish
                          </button>
                        ) : null}
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                learningApi
                                  .versions(item.id)
                                  .then((response) =>
                                    setHistory({ title: item.title, ...response.data }),
                                  )
                                  .catch((caught) => setError(caught.message))
                              }
                            >
                              Versions
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Archive this official resource? Students will no longer see it.',
                                  )
                                ) {
                                  run(() => learningApi.archive(item.id));
                                }
                              }}
                            >
                              Archive
                            </button>
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
