export function Panel({ title, children, tone, kicker }) {
  return (
    <article className={tone ? `panel panel--${tone}` : 'panel'}>
      {kicker ? <p className="panel__kicker">{kicker}</p> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
    </article>
  );
}
