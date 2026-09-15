import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lecturerApi, offeringLabel } from './lecturer-api.js';

export function LecturerOfferingWorkspacePage() {
  const { offeringId } = useParams();
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', data: null });
    lecturerApi
      .offering(offeringId)
      .then((body) => {
        if (!cancelled) {
          setState({ loading: false, error: '', data: body.data });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: caught.message || 'This subject offering is not in your current assignments',
            data: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  if (state.loading) {
    return <p>Loading subject offering workspace…</p>;
  }
  if (state.error) {
    return (
      <section>
        <h1>Subject offering</h1>
        <p className="form-error" role="alert">
          {state.error}
        </p>
        <p>If this assignment was revoked, management is no longer available.</p>
        <Link to="/">Back to teaching workspace</Link>
      </section>
    );
  }

  const data = state.data;
  const offering = data.offering;

  return (
    <section>
      <p>
        <Link to="/">Teaching workspace</Link>
      </p>
      <h1>{offeringLabel(offering)}</h1>
      {!data.canManage ? (
        <p role="status">This assignment is read-only. You cannot publish resources or schedule CA here.</p>
      ) : null}

      <h2>Overview</h2>
      <p>
        Status {offering.status}. Batch {offering.batchName || offering.batchId}. Year{' '}
        {offering.academicYearName || offering.academicYearId}. Semester {offering.semesterName || offering.semesterId}.
      </p>

      <h2>Official resources</h2>
      {!data.sections?.resources?.ok ? <p>{data.sections?.resources?.error}</p> : null}
      {data.resources?.items?.length ? (
        <ul>
          {data.resources.items.map((item) => (
            <li key={item.id}>
              {item.title} — {item.publicationState} (v{item.version})
            </li>
          ))}
        </ul>
      ) : (
        <p>No official resources on this offering yet.</p>
      )}
      <p>
        <Link to={data.links.learning}>Open resource manager</Link>
      </p>

      <h2>Assignment deadlines</h2>
      {data.deadlines?.length ? (
        <ul>
          {data.deadlines.map((item) => (
            <li key={item.id}>
              {item.title} — {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>No assignment-deadline calendar events for this offering in the upcoming window.</p>
      )}
      <p>
        Deadlines are calendar events. <Link to="/calendar">Open calendar</Link>
      </p>

      <h2>CA recovery</h2>
      {!data.sections?.ca?.ok ? <p>{data.sections?.ca?.error}</p> : null}
      <p>Approved students for this offering only. Names are not listed as a directory.</p>
      <ul>
        {(data.caRecovery?.eligible || []).map((item) => (
          <li key={`${item.applicationId}-${item.registrationNumber}`}>
            {item.registrationNumber} — {item.workflowStatus}
          </li>
        ))}
      </ul>
      <Link to="/lecturer/ca">Schedule CA</Link>
    </section>
  );
}
