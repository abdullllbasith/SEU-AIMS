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

export function StatCard({ label, value, hint, to, onClick, icon, tone }) {
  const className = `stat-card${toneClass(tone, value)}${onClick || to ? ' stat-card--interactive' : ''}`;
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
  if (onClick) {
    return (
      <article
        className={className}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick(event);
          }
        }}
      >
        {body}
      </article>
    );
  }
  return <article className={className}>{body}</article>;
}
