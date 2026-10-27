import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi } from './experience-api.js';
import { Panel } from '../../ui/Panel.jsx';
import { formatSemesterLabel } from '../../ui/academic-labels.js';

const TARGET_PRESETS = [
  { id: 'first', label: 'First Class', gpa: 3.7 },
  { id: 'upper', label: 'Second Upper', gpa: 3.3 },
  { id: 'lower', label: 'Second Lower', gpa: 3.0 },
  { id: 'pass', label: 'Pass', gpa: 2.0 },
];

const STANDARD_TIMELINE = [
  { key: '1-1', short: 'Y1 S1', year: 1, sem: 1 },
  { key: '1-2', short: 'Y1 S2', year: 1, sem: 2 },
  { key: '2-1', short: 'Y2 S1', year: 2, sem: 1 },
  { key: '2-2', short: 'Y2 S2', year: 2, sem: 2 },
  { key: '3-1', short: 'Y3 S1', year: 3, sem: 1 },
  { key: '3-2', short: 'Y3 S2', year: 3, sem: 2 },
  { key: '4-1', short: 'Y4 S1', year: 4, sem: 1 },
  { key: '4-2', short: 'Y4 S2', year: 4, sem: 2 },
];

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Highest classification band the student already meets from official CGPA. */
function achievedBand(cgpa) {
  if (cgpa == null) {
    return null;
  }
  return TARGET_PRESETS.find((preset) => cgpa >= preset.gpa) ?? null;
}

function minNextSemesterGpaToHold(cgpa, floor, creditsCounted) {
  if (cgpa == null || floor == null) {
    return null;
  }
  const currentCredits = Math.max(15, creditsCounted || 30);
  const nextSemCredits = 15;
  const needed =
    (floor * (currentCredits + nextSemCredits) - cgpa * currentCredits) / nextSemCredits;
  return Math.min(4.0, Math.max(0, Number(needed.toFixed(2))));
}

export function GpaTrajectoryPanel({ gpa, trend: initialTrend, compact = false }) {
  const cgpaFromProps = num(gpa?.cgpa ?? gpa?.gpa);
  const initialBand = achievedBand(cgpaFromProps);
  const [selectedTarget, setSelectedTarget] = useState(initialBand?.gpa ?? 3.7);
  const [targetTouched, setTargetTouched] = useState(false);
  const [fetchedTrend, setFetchedTrend] = useState(null);

  useEffect(() => {
    if (targetTouched) {
      return;
    }
    const band = achievedBand(num(gpa?.cgpa ?? gpa?.gpa));
    if (band) {
      setSelectedTarget(band.gpa);
    }
  }, [gpa?.cgpa, gpa?.gpa, targetTouched]);

  useEffect(() => {
    if (Array.isArray(initialTrend)) {
      return undefined;
    }
    let cancelled = false;
    Promise.resolve(experienceApi.performance?.())
      .then((res) => {
        if (!cancelled && Array.isArray(res?.data?.trend)) {
          setFetchedTrend(res.data.trend);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialTrend]);

  const rawTrend = Array.isArray(initialTrend)
    ? initialTrend
    : Array.isArray(fetchedTrend)
      ? fetchedTrend
      : Array.isArray(gpa?.semesters)
        ? gpa.semesters
        : [];

  const cgpaValue = num(gpa?.cgpa ?? gpa?.gpa);
  const creditsCounted = num(gpa?.credits) ?? 0;

  const points = useMemo(() => {
    const bySlot = new Map();
    rawTrend.forEach((item, index) => {
      const ySeq = num(item.academicYearSequence);
      const sSeq = num(item.semesterSequence);
      const gVal = num(item.gpa);
      if (gVal == null) {
        return;
      }
      const key = ySeq && sSeq ? `${ySeq}-${sSeq}` : `idx-${index}`;
      const label =
        formatSemesterLabel(
          { name: item.semesterName, sequence: item.semesterSequence },
          { name: item.academicYearName, sequence: item.academicYearSequence },
        ) ||
        item.semesterName ||
        `Sem ${index + 1}`;
      bySlot.set(key, {
        key,
        short: ySeq && sSeq ? `Y${ySeq} S${sSeq}` : `S${index + 1}`,
        label,
        year: ySeq || Math.ceil((index + 1) / 2),
        gpa: gVal,
        credits: num(item.credits) || 0,
      });
    });

    const slots = STANDARD_TIMELINE.map((slot) => {
      const match = bySlot.get(slot.key);
      return {
        ...slot,
        label: match?.label || `Year ${slot.year} · Semester ${slot.sem}`,
        gpa: match ? match.gpa : null,
        credits: match ? match.credits : 0,
      };
    });

    const hasMatchedSlot = slots.some((slot) => slot.gpa != null);
    if (!hasMatchedSlot && bySlot.size > 0) {
      const list = [...bySlot.values()];
      return slots.map((slot, idx) => ({
        ...slot,
        label: list[idx]?.label || slot.label,
        gpa: list[idx]?.gpa ?? null,
        credits: list[idx]?.credits ?? 0,
      }));
    }

    if (!hasMatchedSlot && cgpaValue != null) {
      return slots.map((slot, idx) => ({
        ...slot,
        gpa: idx === 0 ? cgpaValue : null,
        credits: idx === 0 ? creditsCounted : 0,
      }));
    }

    return slots;
  }, [rawTrend, cgpaValue, creditsCounted]);

  const yearSummaries = useMemo(() => {
    return [1, 2, 3, 4].map((yearNum) => {
      const yearSlots = points.filter((p) => p.year === yearNum && p.gpa != null);
      if (!yearSlots.length) {
        return { year: yearNum, avg: null, credits: 0 };
      }
      const totalCredits = yearSlots.reduce((sum, item) => sum + (item.credits || 1), 0);
      const weighted = yearSlots.reduce((sum, item) => sum + item.gpa * (item.credits || 1), 0);
      return {
        year: yearNum,
        avg: Number((weighted / Math.max(1, totalCredits)).toFixed(2)),
        credits: yearSlots.reduce((sum, item) => sum + item.credits, 0),
      };
    });
  }, [points]);

  const achieved = useMemo(() => achievedBand(cgpaValue), [cgpaValue]);
  const targetPreset = TARGET_PRESETS.find((t) => t.gpa === selectedTarget) || TARGET_PRESETS[0];
  const maintainCurrentBand =
    achieved != null && cgpaValue != null && selectedTarget === achieved.gpa && cgpaValue >= achieved.gpa;
  const comparingLowerBar = achieved != null && selectedTarget < achieved.gpa;
  const delta = cgpaValue != null ? Number((cgpaValue - selectedTarget).toFixed(2)) : null;
  const bufferAboveFloor =
    maintainCurrentBand && cgpaValue != null
      ? Number((cgpaValue - achieved.gpa).toFixed(2))
      : null;
  const minSemToHoldBand = useMemo(
    () =>
      maintainCurrentBand
        ? minNextSemesterGpaToHold(cgpaValue, achieved?.gpa, creditsCounted)
        : null,
    [maintainCurrentBand, cgpaValue, achieved?.gpa, creditsCounted],
  );
  const requiredNextSemesterGpa = useMemo(() => {
    if (cgpaValue == null || delta == null || delta >= 0) {
      return null;
    }
    const currentCredits = Math.max(15, creditsCounted || 30);
    const nextSemCredits = 15;
    const needed =
      (selectedTarget * (currentCredits + nextSemCredits) - cgpaValue * currentCredits) /
      nextSemCredits;
    return Math.min(4.0, Math.max(0, Number(needed.toFixed(2))));
  }, [cgpaValue, delta, creditsCounted, selectedTarget]);

  // SVG chart coordinate system
  const width = 680;
  const height = 210;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const minGpa = 1.5;
  const maxGpa = 4.0;

  const toX = (index) => padLeft + (index / Math.max(1, points.length - 1)) * plotW;
  const toY = (val) => {
    const clamped = Math.max(minGpa, Math.min(maxGpa, val));
    return padTop + ((maxGpa - clamped) / (maxGpa - minGpa)) * plotH;
  };

  const actualCoords = points
    .map((pt, idx) => (pt.gpa != null ? { ...pt, idx, x: toX(idx), y: toY(pt.gpa) } : null))
    .filter(Boolean);

  const lastActual = actualCoords[actualCoords.length - 1] || null;
  const lastSlotIndex = points.length - 1;
  const chartReferenceGpa = maintainCurrentBand ? achieved?.gpa : selectedTarget;
  const projectedEnd =
    lastActual && lastActual.idx < lastSlotIndex && !maintainCurrentBand && delta != null && delta < 0
      ? { x: toX(lastSlotIndex), y: toY(selectedTarget), gpa: selectedTarget }
      : maintainCurrentBand && lastActual && cgpaValue != null
        ? { x: toX(lastSlotIndex), y: toY(cgpaValue), gpa: cgpaValue, kind: 'maintain' }
        : null;

  const linePath = actualCoords
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    actualCoords.length >= 2
      ? `${linePath} L ${actualCoords[actualCoords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${actualCoords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const targetY = toY(chartReferenceGpa ?? selectedTarget);
  const cgpaPct = cgpaValue != null ? Math.min(100, Math.max(0, (cgpaValue / 4.0) * 100)) : 0;

  const chartTargetLabel = maintainCurrentBand
    ? `${achieved.label} floor (${achieved.gpa.toFixed(2)})`
    : `Target ${selectedTarget.toFixed(2)}`;

  const targetLabelWidth = maintainCurrentBand ? 116 : 82;
  const targetLabelX = width - padRight - targetLabelWidth;
  const targetLabelY = Math.max(4, targetY - 18);
  const targetLabelTextX = width - padRight - (maintainCurrentBand ? 60 : 43);
  const targetLabelTextY = Math.max(15, targetY - 7);
  const targetLineEndX = targetLabelX - 10;

  return (
    <Panel
      title={maintainCurrentBand ? 'GPA trajectory & class standing' : 'GPA trajectory & target tracker'}
      kicker={gpa?.available ? `Current CGPA ${gpa.cgpa} · ${gpa.classification || 'Official'}` : 'Academic progression'}
    >
      <div className="gpa-tracker__controls">
        <div className="gpa-tracker__targets" role="group" aria-label="GPA focus">
          <span className="gpa-tracker__targets-label">
            {maintainCurrentBand ? 'Your class band:' : 'Target goal:'}
          </span>
          {TARGET_PRESETS.map((preset) => {
            const isAchieved = achieved != null && cgpaValue != null && cgpaValue >= preset.gpa;
            const isBelowAchieved = achieved != null && preset.gpa < achieved.gpa;
            return (
              <button
                key={preset.id}
                type="button"
                className={[
                  'gpa-target-pill',
                  selectedTarget === preset.gpa ? 'is-active' : '',
                  isAchieved && preset.id === achieved?.id ? 'is-achieved' : '',
                  isBelowAchieved ? 'is-optional' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setTargetTouched(true);
                  setSelectedTarget(preset.gpa);
                }}
              >
                {preset.label} ({preset.gpa.toFixed(2)})
                {isAchieved && preset.id === achieved?.id ? ' · current' : ''}
              </button>
            );
          })}
        </div>

        {cgpaValue != null && maintainCurrentBand ? (
          <>
            <div className="gpa-tracker__badge gpa-tracker__badge--ok">
              {achieved.label} secured · +{bufferAboveFloor?.toFixed(2)} buffer above the{' '}
              {achieved.gpa.toFixed(2)} floor
              {gpa?.classification ? ` (${gpa.classification})` : ''}
            </div>
            <div className="gpa-tracker__maintain" role="status">
              <p className="gpa-tracker__maintain-lead">
                You are already in this band. Focus on <strong>maintaining</strong> your cumulative
                GPA — not reaching {achieved.gpa.toFixed(2)} again.
              </p>
              <ul className="gpa-tracker__maintain-list">
                {minSemToHoldBand != null ? (
                  <li>
                    Aim for about <strong>{minSemToHoldBand.toFixed(2)}</strong> or higher next
                    semester average to stay in {achieved.label}.
                  </li>
                ) : null}
                <li>Review weak subjects on the Performance page before registration each semester.</li>
                <li>Resolve incomplete CA early — E(CA) rows are excluded from GPA until cleared.</li>
                <li>Use lower band pills only to compare &ldquo;what-if&rdquo; safety margins.</li>
              </ul>
            </div>
          </>
        ) : null}

        {cgpaValue != null && !maintainCurrentBand ? (
          <div
            className={
              delta >= 0
                ? 'gpa-tracker__badge gpa-tracker__badge--ok'
                : 'gpa-tracker__badge gpa-tracker__badge--watch'
            }
          >
            {comparingLowerBar
              ? `Safety margin · +${delta.toFixed(2)} above ${targetPreset.label} (${selectedTarget.toFixed(2)}) — you already hold ${achieved?.label ?? 'a higher band'}`
              : delta >= 0
                ? `On track · +${delta.toFixed(2)} above ${targetPreset.label} (${selectedTarget.toFixed(2)})`
                : `Need +${Math.abs(delta).toFixed(2)} CGPA (~${requiredNextSemesterGpa?.toFixed(2)} next semester avg) for ${targetPreset.label}`}
          </div>
        ) : null}
      </div>

      <div className="gpa-tracker__chart-wrap">
        <svg
          className="gpa-line-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Semester GPA progression and target trajectory line chart"
        >
          <defs>
            <linearGradient id="gpaAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a73e8" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#1a73e8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[4.0, 3.5, 3.0, 2.5, 2.0].map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  className="gpa-line-chart__grid"
                />
                <text x={padLeft - 8} y={y + 4} className="gpa-line-chart__axis-label">
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Target threshold dashed line (stops before label) */}
          <line
            x1={padLeft}
            y1={targetY}
            x2={targetLineEndX}
            y2={targetY}
            className="gpa-line-chart__target"
          />

          {/* Area under actual GPA curve */}
          {areaPath ? <path d={areaPath} fill="url(#gpaAreaGrad)" /> : null}

          {/* Actual GPA line */}
          {actualCoords.length >= 2 ? (
            <path d={linePath} className="gpa-line-chart__line" />
          ) : null}

          {/* Projected trajectory dashed line to target */}
          {lastActual && projectedEnd ? (
            <line
              x1={lastActual.x}
              y1={lastActual.y}
              x2={
                projectedEnd.y >= targetLabelY - 2 &&
                projectedEnd.y <= targetLabelY + 18 &&
                projectedEnd.x > targetLabelX
                  ? targetLineEndX
                  : projectedEnd.x
              }
              y2={projectedEnd.y}
              className={
                projectedEnd.kind === 'maintain'
                  ? 'gpa-line-chart__projection gpa-line-chart__projection--maintain'
                  : 'gpa-line-chart__projection'
              }
            />
          ) : null}

          {/* X-axis semester labels */}
          {points.map((pt, idx) => {
            const x = toX(idx);
            return (
              <g key={pt.key}>
                <line
                  x1={x}
                  y1={padTop + plotH}
                  x2={x}
                  y2={padTop + plotH + 4}
                  className="gpa-line-chart__tick"
                />
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className={
                    pt.gpa != null
                      ? 'gpa-line-chart__xlabel is-recorded'
                      : 'gpa-line-chart__xlabel'
                  }
                >
                  {pt.short}
                </text>
              </g>
            );
          })}

          {/* Projected target endpoint node */}
          {projectedEnd ? (
            <g>
              <circle
                cx={projectedEnd.x}
                cy={projectedEnd.y}
                r="4.5"
                className="gpa-line-chart__node-projected"
              />
            </g>
          ) : null}

          {/* Recorded semester GPA nodes */}
          {actualCoords.map((pt) => (
            <g key={pt.key}>
              <circle cx={pt.x} cy={pt.y} r="5.5" className="gpa-line-chart__node" />
              <text
                x={pt.x}
                y={Math.max(14, pt.y - 10)}
                textAnchor="middle"
                className="gpa-line-chart__value-label"
              >
                {pt.gpa.toFixed(2)}
              </text>
            </g>
          ))}

          <g className="gpa-line-chart__target-label" aria-hidden="true">
            <rect
              x={targetLabelX - 3}
              y={targetLabelY - 2}
              width={targetLabelWidth + 6}
              height={20}
              rx="10"
              className="gpa-line-chart__target-label-back"
            />
            <rect
              x={targetLabelX}
              y={targetLabelY}
              width={targetLabelWidth}
              height={16}
              rx="8"
              className="gpa-line-chart__target-pill"
            />
            <text
              x={targetLabelTextX}
              y={targetLabelTextY}
              textAnchor="middle"
              className="gpa-line-chart__target-text"
            >
              {chartTargetLabel}
            </text>
          </g>
        </svg>
      </div>

      {/* Year-by-year progress & classification scale */}
      <div className="gpa-tracker__years">
        {yearSummaries.map((item) => {
          const pct = item.avg != null ? Math.min(100, Math.round((item.avg / 4.0) * 100)) : 0;
          return (
            <div key={item.year} className="gpa-year-tile">
              <div className="gpa-year-tile__head">
                <span className="gpa-year-tile__title">Year {item.year}</span>
                <strong className="gpa-year-tile__val">
                  {item.avg != null ? item.avg.toFixed(2) : '—'}
                </strong>
              </div>
              <div className="gpa-year-tile__bar" aria-hidden="true">
                <span className="gpa-year-tile__fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="gpa-year-tile__meta">
                {item.avg != null ? `${item.credits || 0} credits counted` : 'Upcoming year'}
              </span>
            </div>
          );
        })}
      </div>

      {!compact ? (
        <div className="gpa-scale-bar">
          <div className="gpa-scale-bar__labels">
            <span>0.00</span>
            <span>Pass (2.00)</span>
            <span>2nd Lower (3.00)</span>
            <span>2nd Upper (3.30)</span>
            <span>First Class (3.70)</span>
            <span>4.00</span>
          </div>
          <div className="gpa-scale-bar__track">
            <span className="gpa-scale-bar__fill" style={{ width: `${cgpaPct}%` }} />
            <span
              className="gpa-scale-bar__target-pin"
              style={{
                left: `${((maintainCurrentBand ? achieved?.gpa : selectedTarget) / 4.0) * 100}%`,
              }}
              title={
                maintainCurrentBand
                  ? `${achieved?.label} floor ${achieved?.gpa?.toFixed(2)}`
                  : `Target ${selectedTarget.toFixed(2)}`
              }
            />
          </div>
        </div>
      ) : (
        <p className="panel-footnote">
          <Link to="/performance">Open full GPA &amp; semester analytics</Link>
          <span className="panel-footnote__sep">·</span>
          <Link to="/results/me">Official results</Link>
        </p>
      )}
    </Panel>
  );
}
