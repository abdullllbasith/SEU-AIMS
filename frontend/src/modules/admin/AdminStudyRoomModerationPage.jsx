import { useEffect, useState } from 'react';
import { studyRoomApi } from '../study-room/study-room-api.js';

export function AdminStudyRoomModerationPage() {
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [queue, setQueue] = useState([]);
  const [reports, setReports] = useState([]);

  async function reload() {
    const [mode, items, reportItems] = await Promise.all([
      studyRoomApi.moderationSettings(),
      studyRoomApi.moderationQueue(),
      studyRoomApi.reports(),
    ]);
    setSettings(mode.data);
    setQueue(items.data.items);
    setReports(reportItems.data.items);
  }

  useEffect(() => {
    reload().catch((caught) => setError(caught.message || 'Unable to load moderation'));
  }, []);

  if (error) {
    return <p className="form-error">{error}</p>;
  }
  if (!settings) {
    return <p>Loading Study Room moderation…</p>;
  }

  return (
    <section>
      <h1>Study Room moderation</h1>
      <p>This is administrative review of student-shared files. It does not provide access to encrypted chat.</p>
      <p>Current mode: {settings.moderationMode === 'ADMIN_REVIEW' ? 'Admin review required' : 'Non-review (scan still required)'}</p>
      <button
        type="button"
        onClick={() =>
          studyRoomApi
            .updateModerationSettings({
              moderationMode: settings.moderationMode === 'ADMIN_REVIEW' ? 'NON_REVIEW' : 'ADMIN_REVIEW',
            })
            .then(reload)
        }
      >
        Switch moderation mode
      </button>
      <h2>Pending student files</h2>
      {queue.length === 0 ? <p>No files waiting for review.</p> : null}
      <ul>
        {queue.map((item) => (
          <li key={item.id}>
            {item.displayFilename} ({item.moderationState})
            <button type="button" onClick={() => studyRoomApi.approve(item.id).then(reload)}>
              Approve
            </button>
            <button type="button" onClick={() => studyRoomApi.reject(item.id).then(reload)}>
              Reject
            </button>
          </li>
        ))}
      </ul>
      <h2>Reports</h2>
      {reports.length === 0 ? <p>No reports.</p> : null}
      <ul>
        {reports.map((item) => (
          <li key={item.id}>
            {item.category} — {item.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
