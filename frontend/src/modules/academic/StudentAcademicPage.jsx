import { useEffect, useState } from 'react';
import { academicApi } from '../admin/academic-api.js';

export function StudentAcademicPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [offerings, setOfferings] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [contextRes, offeringRes] = await Promise.all([
          academicApi.myContext(),
          academicApi.myOfferings(),
        ]);
        if (!cancelled) {
          setPayload(contextRes.data);
          setOfferings(offeringRes.data.items);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught.message || 'Unable to load academic context');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p>Loading your academic context…</p>;
  }

  if (error) {
    return <p className="form-error">{error}</p>;
  }

  const context = payload?.context;
  return (
    <section>
      <h1>My academic context</h1>
      {!context ? <p>No academic membership is recorded yet.</p> : null}
      {context ? (
        <dl>
          <dt>Registration number</dt>
          <dd>{context.registrationNumber}</dd>
          <dt>Status</dt>
          <dd>{context.status}</dd>
        </dl>
      ) : null}
      <h2>Current offerings</h2>
      {offerings.length === 0 ? <p>No active offerings for your current semester.</p> : null}
      <ul>
        {offerings.map((item) => (
          <li key={item.id}>
            {item.subjectCode || item.subjectId} ({item.id})
          </li>
        ))}
      </ul>
      <h2>History</h2>
      {(payload?.history || []).length === 0 ? <p>No recorded academic history yet.</p> : null}
      <ul>
        {(payload?.history || []).map((item) => (
          <li key={item.id}>
            Year {item.academicYearId} / semester {item.semesterId}
          </li>
        ))}
      </ul>
    </section>
  );
}
