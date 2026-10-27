export function ActionButton({
  busy = false,
  busyLabel = 'Loading…',
  className = '',
  children,
  disabled = false,
  type = 'button',
  ...props
}) {
  const classes = [className, busy ? 'is-loading' : ''].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes || undefined}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
