import { Link } from 'react-router-dom';

export function DeadlineList({ title, items, empty = 'None in this window.' }) {
  return (
    <div className="agenda-block">
      <div className="agenda-block__head">
        <h3>{title}</h3>
        <span className={items.length ? 'status-pill status-pill--info' : 'status-pill status-pill--muted'}>
          {items.length ? `${items.length}` : '0'}
        </span>
      </div>
      {items.length === 0 ? <p className="deadline-empty">{empty}</p> : null}
      {items.length ? (
        <ul className="stack-list">
          {items.map((item) => (
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
      ) : null}
    </div>
  );
}
