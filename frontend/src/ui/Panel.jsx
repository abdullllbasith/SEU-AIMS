export function Panel({ title, children, tone, kicker, id, className }) {
  const toneClass = tone ? `panel panel--${tone}` : 'panel';
  const rootClass = className ? `${toneClass} ${className}` : toneClass;
  return (
    <article id={id} className={rootClass}>
      {kicker ? <p className="panel__kicker">{kicker}</p> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
    </article>
  );
}
