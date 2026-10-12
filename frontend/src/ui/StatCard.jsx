import { Link } from 'react-router-dom';
import { StatIcon } from './stat-icons.jsx';

function toneClass(tone, value) {
  const n = Number(value);
  if (!tone || !Number.isFinite(n) || n <= 0) {
    return '';
  }
  if (tone === 'alert') {
    return ' stat-card--alert';
  }
  if (tone === 'watch') {
    return ' stat-card--watch';
  }
  return '';
}

export function StatCard({ label, value, hint, to, icon, tone }) {
  const className = `stat-card${toneClass(tone, value)}`;
  const body = (
    <>
      <div className="stat-card__head">
        <p className="stat-card__label">{label}</p>
        {icon ? <StatIcon name={icon} /> : null}
      </div>
      <p className="stat-card__value">{value}</p>
      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </>
  );
  if (to) {
    return (
      <Link className={className} to={to}>
        {body}
      </Link>
    );
  }
  return <article className={className}>{body}</article>;
}
