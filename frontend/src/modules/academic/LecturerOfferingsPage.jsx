import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi, offeringLabel } from '../lecturer/lecturer-api.js';

export function LecturerOfferingsPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    lecturerApi
      .offerings()
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
      <p>Names come from Academic Foundation. Inactive assignments are listed as read-only.</p>
      {items.length === 0 ? <p>You have no subject offering assignments.</p> : null}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Batch</th>
              <th>Year</th>
              <th>Semester</th>
              <th>Management</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={item.workspacePath}>{offeringLabel(item)}</Link>
                </td>
                <td>{item.batchName || item.batchCode || item.batchId}</td>
                <td>{item.academicYearName || item.academicYearId}</td>
                <td>{item.semesterName || item.semesterId}</td>
                <td>{item.canManage ? 'Active' : 'Read-only'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
