import { useEffect, useState } from 'react';
import { academicApi } from '../admin/academic-api.js';

export function LecturerOfferingsPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    academicApi
      .myOfferings()
      .then((response) => {
        if (!cancelled) {
          setItems(response.data.items);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load assigned offerings');
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
  }, []);

  if (loading) {
    return <p>Loading assigned offerings…</p>;
  }
  if (error) {
    return <p className="form-error">{error}</p>;
  }

  return (
    <section>
      <h1>Assigned offerings</h1>
      {items.length === 0 ? <p>You have no active subject offering assignments.</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Offering</th>
            <th>Subject</th>
            <th>Batch</th>
            <th>Year</th>
            <th>Semester</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.subjectCode || item.subjectId}</td>
              <td>{item.batchId}</td>
              <td>{item.academicYearId}</td>
              <td>{item.semesterId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
