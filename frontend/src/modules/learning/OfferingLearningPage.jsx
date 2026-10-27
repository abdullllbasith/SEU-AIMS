import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { learningApi } from './learning-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatPublicationState, formatResourceCategory, formatScanStatus } from '../../ui/status-labels.js';

const PdfView = lazy(() => import('../study-room/PdfView.jsx').then((module) => ({ default: module.PdfView })));

function statusClass(publicationState, scanStatus) {
  if (publicationState === 'PUBLISHED') {
    return 'status-pill status-pill--ok';
  }
  if (scanStatus === 'PENDING' || scanStatus === 'SCANNING') {
    return 'status-pill status-pill--pending';
  }
  if (scanStatus === 'UNSAFE' || scanStatus === 'FAILED') {
    return 'status-pill status-pill--danger';
  }
  return 'status-pill';
}

function fileExtension(name) {
  const match = String(name || '').match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toUpperCase() : 'FILE';
}

function isPdfResource(resource) {
  const name = `${resource?.displayFilename || ''} ${resource?.title || ''}`.toLowerCase();
  const mime = String(resource?.mimeType || '').toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

function isImageResource(resource) {
  const mime = String(resource?.mimeType || '').toLowerCase();
  return mime.startsWith('image/');
}

function fileLabel(item) {
  return item.displayFilename || item.title || 'File';
}

function canOpenFile(item, canManage) {
  if (item.publicationState === 'PUBLISHED') {
    return true;
  }
  return canManage && item.scanStatus === 'SAFE';
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function OfferingLearningPage() {
  const { offeringId } = useParams();
  const { user } = useAuth();
  const canManage = user?.role === ROLES.LECTURER || user?.role === ROLES.DEPARTMENT_ADMINISTRATOR;
  const backTo = user?.role === ROLES.STUDENT ? '/learning' : '/lecturer/learning';
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [page, setPage] = useState(null);
  const [resources, setResources] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogName, setDialogName] = useState('');
  const [menu, setMenu] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const sections = page?.sections || [];
  const activeSection = sections.find((section) => section.id === activeSectionId) || null;
  const visibleResources = activeSection
    ? resources.filter((item) => item.sectionId === activeSection.id)
    : [];

  async function reload() {
    const [offering, list] = await Promise.all([
      learningApi.offering(offeringId),
      learningApi.resources(offeringId, { pageSize: 50 }),
    ]);
    setPage(offering.data);
    setResources(list.data.items);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(null);
    setActiveSectionId('');
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load offering');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }
    function onPointerDown(event) {
      const target = event.target;
      if (target?.closest?.('.tile-menu') || target?.closest?.('.tile-more')) {
        return;
      }
      setMenu(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menu]);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape' || busy) {
        return;
      }
      if (menu) {
        setMenu(null);
        return;
      }
      if (preview) {
        closePreview();
        return;
      }
      setDialog(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, preview, busy]);

  async function run(key, fn) {
    setError('');
    setPending(key);
    try {
      await fn();
      await reload();
    } catch (caught) {
      setError(caught.message || 'Request failed');
    } finally {
      setPending('');
    }
  }

  function closePreview() {
    setPreview((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }

  function openDialog(purpose, item) {
    setMenu(null);
    setError('');
    setDialogName(purpose === 'create-folder' ? '' : item?.name || item?.title || '');
    setDialog({
      purpose,
      id: item?.id || '',
      label: item?.name || item?.title || '',
    });
  }

  async function saveDialog(event) {
    event.preventDefault();
    const name = dialogName.trim();
    if (!dialog) {
      return;
    }
    if (!name && !dialog.purpose.startsWith('delete-')) {
      return;
    }
    await run(dialog.purpose, async () => {
      if (dialog.purpose === 'create-folder') {
        const created = await learningApi.createSection(offeringId, { name });
        setActiveSectionId(created.data.id);
      } else if (dialog.purpose === 'rename-folder') {
        await learningApi.updateSection(dialog.id, { name });
      } else if (dialog.purpose === 'rename-file') {
        await learningApi.updateResource(dialog.id, { title: name });
      } else if (dialog.purpose === 'delete-folder') {
        await learningApi.deleteSection(dialog.id);
        if (activeSectionId === dialog.id) {
          setActiveSectionId('');
        }
      } else if (dialog.purpose === 'delete-file') {
        await learningApi.archive(dialog.id);
        if (preview?.id === dialog.id) {
          closePreview();
        }
      }
      setDialog(null);
      setDialogName('');
    });
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeSection) {
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, '') || file.name;
    const data = new FormData();
    data.append('title', title);
    data.append('category', 'LECTURE');
    data.append('sectionId', activeSection.id);
    data.append('file', file);
    await run('upload', () => learningApi.createResource(offeringId, data));
  }

  async function openResource(item) {
    if (!canOpenFile(item, canManage) || previewBusy) {
      return;
    }
    if (!isPdfResource(item) && !isImageResource(item)) {
      return;
    }
    setError('');
    setPreviewBusy(true);
    try {
      const response = await fetch(learningApi.downloadUrl(item.id), { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Unable to open this file');
      }
      const blob = await response.blob();
      const mime = blob.type || item.mimeType || '';
      const image = mime.startsWith('image/') || isImageResource(item);
      const data = image ? null : await blob.arrayBuffer();
      setPreview((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url);
        }
        return {
          id: item.id,
          name: fileLabel(item),
          url: image ? URL.createObjectURL(blob) : '',
          data,
          mime,
          downloadUrl: learningApi.downloadUrl(item.id),
        };
      });
    } catch (caught) {
      setError(caught.message || 'Unable to open this file');
    } finally {
      setPreviewBusy(false);
    }
  }

  if (loading) {
    return <PageSkeleton title="Subject offering" variant="record" />;
  }

  if (error && !page) {
    return (
      <section className="record-page">
        <PageHeader title="Subject offering" />
        <p className="form-error" role="alert">
          {error}
        </p>
        <p className="panel-footnote">
          <Link to={backTo}>Back to offerings</Link>
        </p>
      </section>
    );
  }

  const offering = page.offering;
  const lecturerNames = (page.lecturers || []).map((item) => item.displayName).filter(Boolean);
  const dialogTitle =
    dialog?.purpose === 'create-folder'
      ? 'Create folder'
      : dialog?.purpose === 'rename-folder'
        ? 'Rename folder'
        : dialog?.purpose === 'rename-file'
          ? 'Rename file'
          : dialog?.purpose === 'delete-folder'
            ? 'Delete folder'
            : 'Delete file';

  return (
    <section className="record-page learning-offering-page">
      <PageHeader
        title={`${offering.subjectCode} — ${offering.subjectName}`}
        purpose="Official resources for this offering."
        meta={lecturerNames.length ? `Lecturers: ${lecturerNames.join(', ')}` : null}
        actions={
          <Link className="text-action" to={backTo}>
            Back
          </Link>
        }
      />

      {error && !dialog ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Panel
        title={activeSection ? activeSection.name : 'Folders'}
        kicker={
          activeSection
            ? `${visibleResources.length} file${visibleResources.length === 1 ? '' : 's'}`
            : `${sections.length} folder${sections.length === 1 ? '' : 's'}`
        }
      >
        <div className="file-browser__bar">
          <p className="panel-lead panel-lead--tight file-browser__lead">
            {activeSection
              ? canManage
                ? 'Import a file into this folder. Students see it after you publish.'
                : 'Official files shared by your lecturers.'
              : canManage
                ? 'Create a folder for this subject. Students see the same folders.'
                : 'Open a folder to see the official files for this subject.'}
          </p>
          {activeSection ? (
            <div className="file-browser__actions">
              <button type="button" onClick={() => setActiveSectionId('')}>
                Back
              </button>
              {canManage ? (
                <button type="button" className="btn btn--primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  {pending === 'upload' ? 'Importing…' : 'Import'}
                </button>
              ) : null}
            </div>
          ) : canManage ? (
            <button type="button" className="btn btn--primary" onClick={() => openDialog('create-folder')} disabled={busy}>
              Create folder
            </button>
          ) : null}
        </div>
        {canManage && activeSection ? (
          <input
            ref={fileInputRef}
            className="file-browser__file-input"
            type="file"
            aria-label="Import a file"
            onChange={uploadFile}
          />
        ) : null}

        {activeSection ? (
          visibleResources.length === 0 ? (
            <EmptyState>No files in this folder yet.</EmptyState>
          ) : (
            <ul className="file-grid">
              {visibleResources.map((item) => {
                const name = fileLabel(item);
                const openable = canOpenFile(item, canManage) && (isPdfResource(item) || isImageResource(item));
                const menuOpen = menu?.kind === 'file' && menu.id === item.id;
                return (
                  <li key={item.id} className={menuOpen ? 'file-tile tile-wrap is-menu-open' : 'file-tile tile-wrap'}>
                    <button
                      type="button"
                      className="file-tile__open"
                      onClick={() => openResource(item)}
                      disabled={!openable || previewBusy}
                    >
                      <span className="file-tile__sheet" aria-hidden="true">
                        <span className="file-tile__fold" />
                        <span className="file-tile__mark">{fileExtension(name)}</span>
                      </span>
                      <span className="file-tile__name">{item.title || name}</span>
                    </button>
                    {canManage ? (
                      <span className={statusClass(item.publicationState, item.scanStatus)}>
                        {item.publicationState === 'PUBLISHED'
                          ? formatPublicationState(item.publicationState)
                          : formatScanStatus(item.scanStatus) || formatPublicationState(item.publicationState)}
                      </span>
                    ) : (
                      <span className="file-tile__kind">{formatResourceCategory(item.category)}</span>
                    )}
                    <div className="file-tile__actions">
                      {canOpenFile(item, canManage) ? (
                        <a className="tile-icon-btn" href={learningApi.downloadUrl(item.id)} aria-label={`Download ${item.title || name}`}>
                          <DownloadIcon />
                        </a>
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          className="tile-more"
                          aria-label={`Actions for ${item.title || name}`}
                          aria-expanded={menuOpen}
                          aria-haspopup="menu"
                          onClick={() => setMenu(menuOpen ? null : { kind: 'file', id: item.id })}
                        >
                          <MoreIcon />
                        </button>
                      ) : null}
                    </div>
                    {menuOpen ? (
                      <div className="tile-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => openDialog('rename-file', item)}>
                          Rename
                        </button>
                        {item.scanStatus === 'SAFE' && item.publicationState !== 'PUBLISHED' ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenu(null);
                              run(`publish:${item.id}`, () => learningApi.publish(item.id));
                            }}
                          >
                            Publish
                          </button>
                        ) : null}
                        {item.publicationState === 'PUBLISHED' ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenu(null);
                              run(`unpublish:${item.id}`, () => learningApi.unpublish(item.id));
                            }}
                          >
                            Unpublish
                          </button>
                        ) : null}
                        <button type="button" role="menuitem" className="tile-menu__danger" onClick={() => openDialog('delete-file', item)}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )
        ) : sections.length === 0 ? (
          <EmptyState>{canManage ? 'No folders yet. Create one to organize this subject’s files.' : 'No folders have been shared for this subject yet.'}</EmptyState>
        ) : (
          <ul className="file-grid">
            {sections.map((section) => {
              const menuOpen = menu?.kind === 'folder' && menu.id === section.id;
              const count = resources.filter((item) => item.sectionId === section.id).length;
              return (
                <li key={section.id} className={menuOpen ? 'tile-wrap is-menu-open' : 'tile-wrap'}>
                  <button type="button" className="folder-tile" onClick={() => setActiveSectionId(section.id)}>
                    <span className="folder-tile__icon" aria-hidden="true">
                      <svg viewBox="0 0 48 40" width="48" height="40">
                        <path
                          d="M4 8.5A3.5 3.5 0 0 1 7.5 5H18l4 4.5h18.5A3.5 3.5 0 0 1 44 13v18.5A3.5 3.5 0 0 1 40.5 35h-33A3.5 3.5 0 0 1 4 31.5v-23Z"
                          fill="currentColor"
                        />
                        <path
                          d="M4 16.5h40v15A3.5 3.5 0 0 1 40.5 35h-33A3.5 3.5 0 0 1 4 31.5v-15Z"
                          fill="currentColor"
                          opacity="0.72"
                        />
                      </svg>
                    </span>
                    <span className="folder-tile__name">{section.name}</span>
                    <span className="folder-tile__count">
                      {count} file{count === 1 ? '' : 's'}
                    </span>
                  </button>
                  {canManage ? (
                    <button
                      type="button"
                      className="tile-more"
                      aria-label={`Actions for ${section.name}`}
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      onClick={() => setMenu(menuOpen ? null : { kind: 'folder', id: section.id })}
                    >
                      <MoreIcon />
                    </button>
                  ) : null}
                  {menuOpen ? (
                    <div className="tile-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => openDialog('rename-folder', section)}>
                        Rename
                      </button>
                      <button type="button" role="menuitem" className="tile-menu__danger" onClick={() => openDialog('delete-folder', section)}>
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {dialog ? (
        <div
          className="window-dialog"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setDialog(null);
            }
          }}
        >
          <div className="window-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="offering-folder-title">
            <h2 id="offering-folder-title">{dialogTitle}</h2>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            {dialog.purpose.startsWith('delete-') ? (
              <form onSubmit={saveDialog}>
                <p className="panel-lead">
                  {dialog.purpose === 'delete-folder'
                    ? `Delete “${dialog.label}”? Files inside it will be removed for students.`
                    : `Delete “${dialog.label}”? Students will no longer see this file.`}
                </p>
                <div className="window-form__actions">
                  <button type="button" onClick={() => setDialog(null)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--danger" disabled={busy}>
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </form>
            ) : (
              <form className="window-form window-form--dialog" onSubmit={saveDialog}>
                <label>
                  Name
                  <input
                    value={dialogName}
                    onChange={(event) => setDialogName(event.target.value)}
                    maxLength={80}
                    required
                    autoFocus
                  />
                </label>
                <div className="window-form__actions">
                  <button type="button" onClick={() => setDialog(null)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={busy || !dialogName.trim()}>
                    {busy ? 'Saving…' : dialog.purpose === 'create-folder' ? 'Create' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {preview ? (
        <div
          className="window-dialog file-preview"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePreview();
            }
          }}
        >
          <div className="window-dialog__panel file-preview__panel" role="dialog" aria-modal="true" aria-labelledby="official-file-title">
            <div className="file-preview__bar">
              <h2 id="official-file-title">{preview.name}</h2>
              <div className="file-preview__bar-actions">
                <a href={preview.downloadUrl}>Download</a>
                <button type="button" onClick={closePreview}>
                  Close
                </button>
              </div>
            </div>
            {String(preview.mime).startsWith('image/') ? (
              <img className="file-preview__image" src={preview.url} alt="" />
            ) : preview.data ? (
              <Suspense fallback={<p className="panel-lead">Opening PDF…</p>}>
                <PdfView data={preview.data} />
              </Suspense>
            ) : (
              <p className="panel-lead">Opening PDF…</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
