import { useCallback, useEffect, useRef, useState } from 'react';
import { studyAgentApi } from './study-agent-api.js';
import { checkFiles, effectiveType, isImageType } from './attachment-rules.js';

export const POLL_INTERVAL_MS = 1500;
export const MAX_POLLS = 60;

function makeKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * The tray of files a student is attaching to the next message.
 * Each item moves UPLOADING -> SCANNING -> READY, or ends FAILED / BLOCKED.
 * `getSessionId` resolves the session id, creating the session first when the chat has none yet.
 */
export function useAttachments(getSessionId) {
  const [items, setItems] = useState([]);
  const [problem, setProblem] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const patch = useCallback((keys, change) => {
    setItems((current) =>
      current.map((item) =>
        keys.includes(item.key) ? { ...item, ...(typeof change === 'function' ? change(item) : change) } : item,
      ),
    );
  }, []);

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) {
        return;
      }
      const { accepted, problems } = checkFiles(itemsRef.current.length, files);
      setProblem(problems.join(' '));
      if (!accepted.length) {
        return;
      }
      const fresh = accepted.map((file) => ({
        key: makeKey(),
        name: file.name,
        mimeType: effectiveType(file),
        previewUrl: isImageType(file.type) ? URL.createObjectURL?.(file) || null : null,
        progress: 0,
        status: 'UPLOADING',
        id: null,
        polls: 0,
        error: '',
      }));
      setItems((current) => [...current, ...fresh]);
      const keys = fresh.map((item) => item.key);
      const form = new FormData();
      accepted.forEach((file) => {
        const type = effectiveType(file);
        form.append('files', type === file.type ? file : new Blob([file], { type }), file.name);
      });
      try {
        const sessionId = await getSessionId();
        const res = await studyAgentApi.uploadAttachments(sessionId, form, (fraction) =>
          patch(keys, { progress: fraction }),
        );
        res.data.items.forEach((item, index) =>
          patch([keys[index]], { id: item.id, status: item.status, progress: 1 }),
        );
      } catch (error) {
        patch(keys, { status: 'FAILED', error: error?.message || 'Upload failed' });
      }
    },
    [patch, getSessionId],
  );

  const revoke = useCallback((item) => {
    if (item.previewUrl) {
      URL.revokeObjectURL?.(item.previewUrl);
    }
  }, []);

  const remove = useCallback(
    (key) => {
      const item = itemsRef.current.find((entry) => entry.key === key);
      if (!item) {
        return;
      }
      revoke(item);
      setItems((current) => current.filter((entry) => entry.key !== key));
      if (item.id) {
        studyAgentApi.removeAttachment(item.id).catch(() => {});
      }
    },
    [revoke],
  );

  /** After a successful send the files belong to the message, so they are dropped from the tray only. */
  const clear = useCallback(() => {
    itemsRef.current.forEach(revoke);
    setItems([]);
    setProblem('');
  }, [revoke]);

  useEffect(
    () => () => {
      itemsRef.current.forEach(revoke);
    },
    [revoke],
  );

  const scanningKeys = items
    .filter((item) => item.status === 'SCANNING' && item.id)
    .map((item) => item.key)
    .join(',');

  useEffect(() => {
    if (!scanningKeys) {
      return undefined;
    }
    const timer = setTimeout(async () => {
      for (const item of itemsRef.current.filter((entry) => entry.status === 'SCANNING' && entry.id)) {
        let status = 'SCANNING';
        try {
          status = (await studyAgentApi.attachmentStatus(item.id)).data.status;
        } catch {
          // A failed poll is retried on the next tick.
        }
        patch([item.key], (current) => {
          const polls = current.polls + 1;
          if (status === 'SCANNING' && polls >= MAX_POLLS) {
            return { status: 'BLOCKED', polls, error: 'This file could not be verified in time. Remove it and try again.' };
          }
          return { status, polls };
        });
      }
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [scanningKeys, items, patch]);

  return {
    items,
    problem,
    addFiles,
    remove,
    clear,
    readyIds: items.filter((item) => item.status === 'READY').map((item) => item.id),
    pending: items.some((item) => item.status === 'UPLOADING' || item.status === 'SCANNING'),
    hasUnusable: items.some((item) => item.status === 'FAILED' || item.status === 'BLOCKED'),
  };
}
