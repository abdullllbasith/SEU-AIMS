import { Link } from 'react-router-dom';

export function StatCard({ label, value, hint, to }) {
  const body = (
    <>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </>
  );
  if (to) {
    return (
      <Link className="stat-card" to={to}>
        {body}
      </Link>
    );
  }
  return <article className="stat-card">{body}</article>;
}
