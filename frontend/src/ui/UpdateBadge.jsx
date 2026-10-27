export function UpdateBadge({ count, label }) {
  const value = Number(count) || 0;
  if (value < 1) {
    return null;
  }
  const text = value > 99 ? '99+' : String(value);
  return (
    <span className="update-badge" aria-label={`${text} ${label}`}>
      {text}
    </span>
  );
}
