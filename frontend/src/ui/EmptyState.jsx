import { Link } from 'react-router-dom';

export function EmptyState({ children, to, action }) {
  return (
    <div className="empty-state">
      <p style={{ margin: 0, fontWeight: 500, color: 'var(--slate-600)', fontSize: '0.86rem' }}>{children}</p>
      {to && action ? (
        <div style={{ marginTop: '0.65rem' }}>
          <Link to={to} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-600)' }}>
            {action} &rarr;
          </Link>
        </div>
      ) : null}
    </div>
  );
}
