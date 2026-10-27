export function OperationNotice({ notice }) {
  if (!notice?.message) {
    return null;
  }
  const success = notice.tone === 'success';
  return (
    <p className={success ? 'operation-notice operation-notice--success' : 'operation-notice operation-notice--failure'} role={success ? 'status' : 'alert'}>
      {notice.message}
    </p>
  );
}
