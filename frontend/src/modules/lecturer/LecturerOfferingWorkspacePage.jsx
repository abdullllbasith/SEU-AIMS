import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lecturerApi, offeringLabel } from './lecturer-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatBatchLabel,
  formatSemesterLabel,
  formatYearLabel,
} from '../../ui/academic-labels.js';

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
    return <PageSkeleton title="Subject offering" variant="workspace" />;
  }

  if (state.error) {
    return (
      <section className="record-page">
        <PageHeader
          title="Subject offering"
          purpose="If this assignment was revoked, management is no longer available."
        />
        <p className="form-error" role="alert">
          {state.error}
        </p>
        <p className="panel-footnote">
          <Link to="/">Back to teaching workspace</Link>
        </p>
      </section>
    );
  }

  const data = state.data;
  const offering = data.offering;
  const resources = data.resources?.items || [];
  const eligible = data.caRecovery?.eligible || [];
  const deadlines = data.deadlines || [];

  return (
    <section className="record-page">
      <PageHeader
        title={offeringLabel(offering)}
        purpose="Workspace for this assigned offering."
        meta={`Status ${offering.status}`}
        actions={
          <Link className="text-action" to="/lecturer/offerings">
            All assignments
          </Link>
        }
      />

      {!data.canManage ? (
        <p className="status-banner" role="status">
          This assignment is <strong>read-only</strong>. You cannot publish resources or schedule CA here.
        </p>
      ) : null}

      <div className="workspace-tools">
        <Link className="workspace-tool" to={data.links.learning}>
          <span className="workspace-tool__title">Resource manager</span>
          <span className="workspace-tool__meta">Upload, publish, and archive official files</span>
        </Link>
        <Link className="workspace-tool" to="/lecturer/ca">
          <span className="workspace-tool__title">CA scheduling</span>
          <span className="workspace-tool__meta">Approved students for your offerings</span>
        </Link>
        <Link className="workspace-tool" to="/calendar">
          <span className="workspace-tool__title">Calendar</span>
          <span className="workspace-tool__meta">Assignment deadlines and events</span>
        </Link>
      </div>

      <Panel title="Overview" kicker="Academic foundation">
        <dl className="record-dl record-dl--inline">
          <div>
            <dt>Batch</dt>
            <dd>
              {formatBatchLabel({ code: offering.batchCode, name: offering.batchName }) ||
                offering.batchId ||
                '—'}
            </dd>
          </div>
          <div>
            <dt>Academic year</dt>
            <dd>
              {formatYearLabel({
                name: offering.academicYearName,
                sequence: offering.academicYearSequence,
              }) ||
                offering.academicYearName ||
                '—'}
            </dd>
          </div>
          <div>
            <dt>Semester</dt>
            <dd>
              {formatSemesterLabel(
                { name: offering.semesterName, sequence: offering.semesterSequence },
                { name: offering.academicYearName, sequence: offering.academicYearSequence },
              ) ||
                offering.semesterName ||
                '—'}
            </dd>
          </div>
          <div>
            <dt>Management</dt>
            <dd>
              {data.canManage ? (
                <span className="status-pill status-pill--ok">Active</span>
              ) : (
                <span className="status-pill">Read-only</span>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Official resources" kicker={`${resources.length} item${resources.length === 1 ? '' : 's'}`}>
          {!data.sections?.resources?.ok ? (
            <p className="section-error">{data.sections?.resources?.error}</p>
          ) : null}
          {resources.length === 0 ? (
            <EmptyState to={data.links.learning} action="Open resource manager">
              No official resources on this offering yet.
            </EmptyState>
          ) : (
            <ul className="resource-list">
              {resources.map((item) => (
                <li key={item.id} className="resource-row">
                  <div className="resource-row__main">
                    <p className="resource-row__title">{item.title}</p>
                    <p className="resource-row__meta">Version {item.version}</p>
                  </div>
                  <div className="resource-row__aside">
                    <span
                      className={
                        item.publicationState === 'PUBLISHED'
                          ? 'status-pill status-pill--ok'
                          : 'status-pill'
                      }
                    >
                      {item.publicationState}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="panel-footnote">
            <Link to={data.links.learning}>Open resource manager</Link>
          </p>
        </Panel>

        <Panel title="Assignment deadlines" kicker={`${deadlines.length} upcoming`}>
          {deadlines.length === 0 ? (
            <p className="deadline-empty">
              No assignment-deadline calendar events for this offering in the upcoming window.
            </p>
          ) : (
            <ul className="stack-list">
              {deadlines.map((item) => (
                <li key={item.id}>
                  <Link to="/calendar">
                    <span className="stack-item__title">{item.title}</span>
                    <span className="stack-item__meta">
                      {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="panel-footnote">
            Deadlines are calendar events. <Link to="/calendar">Open calendar</Link>
          </p>
        </Panel>
      </div>

      <Panel title="Students" kicker={`${(data.roster?.items || []).length} on this offering`}>
        <p className="panel-lead">
          Students in this offering&apos;s current period, plus active repeat or arrear enrollments for this offering
          only.
        </p>
        {(data.roster?.items || []).length === 0 ? (
          <p className="deadline-empty">No students are on this offering.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Name</th>
                  <th>Association</th>
                </tr>
              </thead>
              <tbody>
                {data.roster.items.map((row) => (
                  <tr key={row.studentUserId}>
                    <td>{row.registrationNumber}</td>
                    <td>{row.displayName || '—'}</td>
                    <td>{(row.associations || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="CA recovery" kicker={`${eligible.length} eligible`}>
        {!data.sections?.ca?.ok ? (
          <p className="section-error">{data.sections?.ca?.error}</p>
        ) : null}
        <p className="panel-lead">
          Approved students for this offering only. Names are not listed as a directory.
        </p>
        {eligible.length === 0 ? (
          <p className="deadline-empty">No approved CA students for this offering.</p>
        ) : (
          <ul className="stack-list">
            {eligible.map((item) => (
              <li key={`${item.applicationId}-${item.registrationNumber}`}>
                <span className="stack-item__title">{item.registrationNumber}</span>
                <span className="stack-item__meta">
                  {{
                    READY_TO_SCHEDULE: 'Waiting for a notice',
                    SCHEDULED: 'Scheduled',
                    COMPLETED: 'Attended · awaiting results',
                    MISSED: 'Absent · may re-apply',
                  }[item.examStatus] || item.workflowStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="panel-footnote">
          <Link to="/lecturer/ca">Schedule CA, record attendance and confirm completion</Link>
        </p>
      </Panel>
    </section>
  );
}
