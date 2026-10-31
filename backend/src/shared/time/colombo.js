/**
 * Asia/Colombo helpers. Sri Lanka has used UTC+05:30 all year since 2006 (no DST),
 * so a fixed offset is exact for every date this system schedules.
 */
export const COLOMBO_TIMEZONE = 'Asia/Colombo';
const COLOMBO_OFFSET = '+05:30';

/** Convert a Colombo wall-clock date (YYYY-MM-DD) and time (HH:mm) to a UTC Date. Returns null if invalid. */
export function colomboLocalToUtc(date, time) {
  const d = String(date || '').trim();
  const t = String(time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) {
    return null;
  }
  const parsed = new Date(`${d}T${t}:00${COLOMBO_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  // Reject rolled-over dates such as 2026-02-31.
  if (formatColomboParts(parsed).date !== d) {
    return null;
  }
  return parsed;
}

function formatColomboParts(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
  };
}

/** Human readable Colombo date and time, e.g. "Mon, 10 Nov 2026" and "09:30". */
export function formatColombo(value) {
  const instant = new Date(value);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(instant);
  const { time } = formatColomboParts(instant);
  return { date: day, time, text: `${day}, ${time} (Asia/Colombo)` };
}
