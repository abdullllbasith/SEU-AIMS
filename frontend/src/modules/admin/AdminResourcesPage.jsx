import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from '../learning/learning-api.js';

export function AdminResourcesPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  async function reload() {
    const response = await learningApi.adminResources({ publicationState: 'ALL' });
    setItems(response.data.items);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load resources');
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
    return <p>Loading official resources…</p>;
  }

  return (
    <section className="admin-page">
      <h1>Official resource oversight</h1>
      <p>
        <Link to="/admin/academic">Academic structure</Link>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {items.length === 0 ? <p>No official resources in this department.</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>State</th>
            <th>Scan</th>
            <th>Offering</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.publicationState}</td>
              <td>{item.scanStatus}</td>
              <td>
                <Link to={`/learning/offerings/${item.subjectOfferingId}`}>Open offering</Link>
              </td>
              <td>
                {item.publicationState === 'PUBLISHED' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Unpublish this resource from students?')) {
                        learningApi
                          .unpublish(item.id)
                          .then(reload)
                          .catch((caught) => setError(caught.message));
                      }
                    }}
                  >
                    Unpublish
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
