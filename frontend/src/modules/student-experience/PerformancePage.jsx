import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi, formatGpaDisplay } from './experience-api.js';
import { GpaTrajectoryPanel } from './GpaTrajectoryPanel.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatSemesterLabel } from '../../ui/academic-labels.js';

export function PerformancePage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    experienceApi
      .performance()
      .then((body) => {
        if (!cancelled) {
          setState({ loading: false, error: '', data: body.data });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: caught.message || 'Unable to load performance',
            data: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return <PageSkeleton title="My performance" variant="detail" stats={4} />;
  }

  if (state.error) {
    return (
      <section className="record-page">
        <PageHeader title="My performance" />
        <p className="form-error" role="alert">
          {state.error}
        </p>
      </section>
    );
  }

  const data = state.data;
  const distribution = Array.isArray(data.distribution) ? data.distribution : [];
  const trend = Array.isArray(data.trend) ? data.trend : [];
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const maxCount = Math.max(1, ...distribution.map((item) => item.count));

  return (
    <section className="record-page">
      <PageHeader
        title="My performance"
        purpose="GPA from official results."
      />

      <div className="stat-row">
        <StatCard
          label="CGPA"
          value={data.gpa?.available ? data.gpa.cgpa : '—'}
          hint={formatGpaDisplay(data.gpa)}
          to="/results/me"
        />
        <StatCard label="Credits counted" value={data.gpa?.available ? data.gpa.credits : '—'} />
        <StatCard label="Completed results" value={data.completedCount ?? 0} />
        <StatCard
          label="Pending E(CA)"
          value={data.pendingEcaCount ?? 0}
          to={data.pendingEcaCount ? '/ca' : undefined}
        />
      </div>

      <GpaTrajectoryPanel gpa={data.gpa} trend={trend} />

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Semester GPA trend">
          {trend.length === 0 ? (
            <p className="deadline-empty">Not enough semester calculations yet.</p>
          ) : (
            <>
            <SemesterTrendChart trend={trend} />
            <div className="table-scroll">
              <table className="data-table">
                <caption>GPA by semester from the official calculation service</caption>
                <thead>
                  <tr>
                    <th>Semester</th>
                    <th>GPA</th>
                    <th>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((item) => (
                    <tr key={`${item.academicYearId}-${item.semesterId}`}>
                      <td>
                        {formatSemesterLabel(
                          { name: item.semesterName, sequence: item.semesterSequence },
                          { name: item.academicYearName, sequence: item.academicYearSequence },
                        ) ||
                          item.semesterName ||
                          '—'}
                      </td>
                      <td>{item.gpa}</td>
                      <td>{item.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Panel>

        <Panel title="Result distribution">
          {distribution.length === 0 ? (
            <p className="deadline-empty">Official results are not available for this semester yet.</p>
          ) : (
            <ul className="bar-chart" aria-label="Result distribution">
              {distribution.map((item) => (
                <li key={item.resultCode}>
                  <span className="bar-chart__label">{item.resultCode}</span>
                  <span className="bar-chart__track">
                    <span
                      className="bar-chart__fill"
                      style={{ width: `${(item.count / maxCount) * 100}%` }}
                    />
                  </span>
                  <span className="bar-chart__count">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Subject results">
        <div className="table-scroll">
          <table className="data-table">
            <caption>Subject-level official results</caption>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Credits</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((item) => (
                <tr key={`${item.subjectCode}-${item.semesterId}`}>
                  <td>
                    <span className="result-subject">{item.subjectCode}</span>{' '}
                    {item.subjectName}
                  </td>
                  <td>{item.credits ?? '—'}</td>
                  <td>
                    <span className={item.isEca ? 'result-mark result-mark--eca' : 'result-mark'}>
                      {item.resultCode}
                      {item.isEca ? ' · incomplete CA' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function SemesterTrendChart({ trend }) {
  const maxGpa = 4.0;
  const items = trend.map((item, index) => {
    const gpa = Number(item.gpa);
    const label =
      formatSemesterLabel(
        { name: item.semesterName, sequence: item.semesterSequence },
        { name: item.academicYearName, sequence: item.academicYearSequence },
      ) ||
      item.semesterName ||
      `S${index + 1}`;
    const short =
      item.academicYearSequence && item.semesterSequence
        ? `Y${item.academicYearSequence} S${item.semesterSequence}`
        : label.length > 12
          ? `${label.slice(0, 10)}…`
          : label;
    return {
      key: `${item.academicYearId}-${item.semesterId}`,
      gpa: Number.isFinite(gpa) ? gpa : null,
      short,
      title: label,
    };
  });

  return (
    <div className="semester-trend-chart" role="img" aria-label="Semester GPA bar chart">
      <div className="semester-trend-chart__bars">
        {items.map((item) => {
          const heightPct =
            item.gpa != null ? Math.max(4, Math.round((item.gpa / maxGpa) * 100)) : 0;
          return (
            <div key={item.key} className="semester-trend-chart__col" title={item.title}>
              <span className="semester-trend-chart__gpa">
                {item.gpa != null ? item.gpa.toFixed(2) : '—'}
              </span>
              <div className="semester-trend-chart__bar-wrap">
                <span
                  className="semester-trend-chart__bar"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="semester-trend-chart__label">{item.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
