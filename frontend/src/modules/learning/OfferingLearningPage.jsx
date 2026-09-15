import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { learningApi } from './learning-api.js';

export function OfferingLearningPage() {
  const { offeringId } = useParams();
  const { user } = useAuth();
  const canManage = user?.role === ROLES.LECTURER || user?.role === ROLES.DEPARTMENT_ADMINISTRATOR;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(null);
  const [resources, setResources] = useState([]);
  const [sectionName, setSectionName] = useState('Lecture Materials');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('LECTURE');
  const [sectionId, setSectionId] = useState('');
  const [file, setFile] = useState(null);

  async function reload() {
    const [offering, list] = await Promise.all([
      learningApi.offering(offeringId),
      learningApi.resources(offeringId),
    ]);
    setPage(offering.data);
    setResources(list.data.items);
    const firstSection = offering.data.sections[0];
    if (firstSection && !sectionId) {
      setSectionId(firstSection.id);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
    try {
      await fn();
      await reload();
    } catch (caught) {
      setError(caught.message || 'Request failed');
    }
  }

  if (loading) {
    return <p>Loading subject offering…</p>;
  }
  if (error && !page) {
    return <p className="form-error">{error}</p>;
  }

  const offering = page.offering;
  return (
    <section className="admin-page">
      <p>
        <Link to={user?.role === ROLES.STUDENT ? '/learning' : '/lecturer/learning'}>Back</Link>
      </p>
      <h1>
        {offering.subjectCode} — {offering.subjectName}
      </h1>
      <p>
        Official resources for this subject offering only. This is not the Student Study Room.
      </p>
      {page.lecturers?.length ? (
        <p>Lecturers: {page.lecturers.map((item) => item.displayName).join(', ')}</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      {canManage ? (
        <div>
          <h2>Organize and publish</h2>
          <p>
            Files stay unpublished until security scanning succeeds and you explicitly publish.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(() => learningApi.createSection(offeringId, { name: sectionName }));
            }}
          >
            <label>
              Section name
              <input value={sectionName} onChange={(event) => setSectionName(event.target.value)} required />
            </label>
            <button type="submit">Create section</button>
          </form>
          <form
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
              <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} required>
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
            <button type="submit" disabled={!file || !sectionId}>
              Upload draft
            </button>
          </form>
        </div>
      ) : null}

      <h2>Materials</h2>
      {page.sections.map((section) => (
        <div key={section.id}>
          <h3>{section.name}</h3>
          <ul>
            {resources
              .filter((item) => item.sectionId === section.id)
              .map((item) => (
                <li key={item.id}>
                  {item.title} ({item.category})
                  {item.scanStatus ? ` — ${item.scanStatus}` : null}
                  {item.publicationState ? ` — ${item.publicationState}` : null}{' '}
                  {item.publicationState === 'PUBLISHED' || canManage ? (
                    <a href={learningApi.downloadUrl(item.id)}>Download</a>
                  ) : null}
                  {canManage && item.scanStatus === 'SAFE' && item.publicationState !== 'PUBLISHED' ? (
                    <button type="button" onClick={() => run(() => learningApi.publish(item.id))}>
                      Publish
                    </button>
                  ) : null}
                  {canManage && item.publicationState === 'PUBLISHED' ? (
                    <button type="button" onClick={() => run(() => learningApi.unpublish(item.id))}>
                      Unpublish
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Archive this official resource? Students will no longer see it.')) {
                          run(() => learningApi.archive(item.id));
                        }
                      }}
                    >
                      Archive
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {resources.length === 0 ? <p>No official resources are available in this offering.</p> : null}
    </section>
  );
}
