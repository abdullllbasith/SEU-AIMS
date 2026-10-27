export function PageHeader({ title, purpose, meta, actions }) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        <h1>{title}</h1>
        {purpose ? <p className="page-header__purpose">{purpose}</p> : null}
        {meta ? <p className="page-header__meta">{meta}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
