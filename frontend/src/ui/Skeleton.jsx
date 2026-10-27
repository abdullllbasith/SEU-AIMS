export function Skeleton({ className = '', width, height, radius, style }) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLine({ width = '100%', className = '' }) {
  return <Skeleton className={`skeleton-line ${className}`.trim()} width={width} height="0.75rem" />;
}

function SkeletonPanel({ lines = 3 }) {
  return (
    <div className="skeleton-panel" aria-hidden="true">
      <Skeleton className="skeleton-panel__title" width="38%" height="1rem" />
      <div className="skeleton-panel__body">
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonLine key={index} width={index === lines - 1 ? '64%' : '100%'} />
        ))}
      </div>
    </div>
  );
}

/**
 * Shared page loading shells.
 * variant: "dashboard" | "record" | "list" | "detail" | "workspace"
 */
export function PageSkeleton({
  title,
  variant = 'record',
  stats = 4,
  panels = 2,
  rows = 5,
}) {
  return (
    <section
      className={variant === 'dashboard' ? 'home-dashboard' : 'record-page'}
      aria-busy="true"
      aria-live="polite"
      aria-label={title ? `Loading ${title}` : 'Loading page'}
    >
      <header className="page-header page-header--skeleton">
        <div className="page-header__copy">
          {title ? <h1>{title}</h1> : <Skeleton width="14rem" height="1.55rem" />}
          <SkeletonLine width="22rem" className="skeleton-line--purpose" />
        </div>
        <Skeleton width="5.5rem" height="2.1rem" radius="0.4rem" />
      </header>

      {variant === 'dashboard' || variant === 'detail' ? (
        <div className="stat-row stat-row--skeleton" aria-hidden="true">
          {Array.from({ length: stats }, (_, index) => (
            <div key={index} className="stat-card skeleton-block skeleton-stat" />
          ))}
        </div>
      ) : null}

      {variant === 'dashboard' ? (
        <div className="skeleton-stack" aria-hidden="true">
          <div className="skeleton-panel skeleton-panel--wide">
            <Skeleton className="skeleton-panel__title" width="28%" height="1rem" />
            <div className="ops-domains skeleton-ops">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="skeleton-ops__card">
                  <SkeletonLine width="55%" />
                  <SkeletonLine width="40%" />
                  <div className="skeleton-ops__metrics">
                    <Skeleton height="4rem" />
                    <Skeleton height="4rem" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="skeleton-panel skeleton-panel--wide">
            <Skeleton className="skeleton-panel__title" width="24%" height="1rem" />
            <div className="shortcut-grid skeleton-shortcuts">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} height="5rem" radius="0.65rem" />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {variant === 'record' || variant === 'detail' ? (
        <div className="skeleton-grid" aria-hidden="true">
          {Array.from({ length: panels }, (_, index) => (
            <SkeletonPanel key={index} lines={4} />
          ))}
        </div>
      ) : null}

      {variant === 'list' ? (
        <div className="skeleton-panel skeleton-panel--wide" aria-hidden="true">
          <Skeleton className="skeleton-panel__title" width="30%" height="1rem" />
          <div className="skeleton-list">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="skeleton-list__row">
                <Skeleton width="2rem" height="2rem" radius="999px" />
                <div className="skeleton-list__copy">
                  <SkeletonLine width="46%" />
                  <SkeletonLine width="72%" />
                </div>
                <Skeleton width="4.5rem" height="1.8rem" radius="0.4rem" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {variant === 'workspace' ? (
        <div className="skeleton-workspace" aria-hidden="true">
          <div className="skeleton-panel">
            <Skeleton className="skeleton-panel__title" width="42%" height="1rem" />
            <div className="skeleton-list">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="skeleton-list__row">
                  <div className="skeleton-list__copy">
                    <SkeletonLine width="58%" />
                    <SkeletonLine width="40%" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="skeleton-panel skeleton-panel--tall">
            <Skeleton className="skeleton-panel__title" width="34%" height="1rem" />
            <div className="skeleton-thread">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton
                  key={index}
                  height="3.2rem"
                  width={index % 2 === 0 ? '78%' : '64%'}
                  radius="0.5rem"
                  style={{ marginLeft: index % 2 === 0 ? 0 : 'auto' }}
                />
              ))}
            </div>
            <Skeleton height="5rem" radius="0.5rem" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
