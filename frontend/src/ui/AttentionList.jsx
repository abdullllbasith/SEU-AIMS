import { Link } from 'react-router-dom';
import { attentionSourceLabel, attentionWhen } from './attention.js';
import { EmptyState } from './EmptyState.jsx';

export function AttentionList({ items, empty, emptyTo, emptyAction }) {
  if (!items?.length) {
    return <EmptyState to={emptyTo} action={emptyAction}>{empty}</EmptyState>;
  }
  return (
    <ul className="attention-list">
      {items.map((item, index) => {
        const source = attentionSourceLabel(item.source);
        const when = attentionWhen(item.at);
        return (
          <li key={`${item.code}-${index}`}>
            <Link className="attention-item" to={item.href}>
              <span>
                <span className="attention-item__title">{item.title}</span>
                {source || when ? (
                  <span className="attention-item__meta">
                    {source}
                    {source && when ? ' · ' : ''}
                    {when}
                  </span>
                ) : null}
              </span>
              <span className="attention-item__go">Open</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
