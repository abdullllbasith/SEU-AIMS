import { useEffect, useRef } from 'react';
import { ACCEPT_ATTRIBUTE, MAX_FILES } from './attachment-rules.js';
import { AgentIcon } from './agent-icons.jsx';

const MAX_CHARS = 4000;
const MAX_HEIGHT_PX = 200;

const STATUS_LABEL = {
  UPLOADING: 'Uploading',
  SCANNING: 'Checking file',
  READY: 'Ready',
  FAILED: 'Upload failed',
  BLOCKED: 'Cannot be used',
};

const QUICK_ACTIONS = [
  { intent: 'simpler', label: 'Simpler', content: 'Explain that more simply.' },
  { intent: 'example', label: 'Example', content: 'Give me an example.' },
  { intent: 'compare', label: 'Compare', content: 'Compare the key concepts.' },
  { intent: 'tamil', label: 'In Tamil', content: 'Explain that in Tamil.' },
];

function AttachmentTray({ attachments }) {
  if (!attachments.items.length) {
    return null;
  }
  return (
    <ul className="study-agent__tray" aria-label="Attached files">
      {attachments.items.map((item) => (
        <li key={item.key} className={`study-agent__chip study-agent__chip--${item.status.toLowerCase()}`}>
          {item.previewUrl ? (
            <img className="study-agent__thumb" src={item.previewUrl} alt="" />
          ) : (
            <span className="study-agent__thumb study-agent__thumb--file" aria-hidden="true">
              <AgentIcon name="file" />
            </span>
          )}
          <span className="study-agent__chip-body">
            <span className="study-agent__chip-name">{item.name}</span>
            <span className="study-agent__chip-status">
              {STATUS_LABEL[item.status]}
              {item.status === 'UPLOADING' ? ` ${Math.round(item.progress * 100)}%` : ''}
              {item.error ? `: ${item.error}` : ''}
            </span>
            {item.status === 'UPLOADING' ? (
              <progress className="study-agent__progress" max="1" value={item.progress} aria-label={`Uploading ${item.name}`} />
            ) : null}
          </span>
          <button
            type="button"
            className="study-agent__chip-remove"
            aria-label={`Remove ${item.name}`}
            onClick={() => attachments.remove(item.key)}
          >
            <AgentIcon name="close" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AgentComposer({
  hasMessages,
  sending,
  disabled,
  draft,
  onDraft,
  attachments,
  research,
  onResearch,
  onSend,
  onQuick,
  dropping,
  inputRef,
}) {
  const fileInput = useRef(null);
  const ownInputRef = useRef(null);
  const textarea = inputRef || ownInputRef;
  const canSend =
    !disabled &&
    !sending &&
    !attachments.pending &&
    !attachments.hasUnusable &&
    (draft.trim().length > 0 || attachments.readyIds.length > 0);

  useEffect(() => {
    const node = textarea.current;
    if (node) {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
    }
  }, [draft, textarea]);

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  }

  /**
   * Pasted files (screenshots, PDFs) are attached. Pasted text that would not fit in the box becomes a text
   * attachment instead of being cut off silently.
   */
  function onPaste(event) {
    const data = event.clipboardData;
    const pastedText = data?.getData?.('text/plain') || '';
    const files = [...(data?.files || [])];
    if (files.length && !pastedText) {
      event.preventDefault();
      attachments.addFiles(files);
      return;
    }
    const node = event.target;
    const selected = (node.selectionEnd ?? 0) - (node.selectionStart ?? 0);
    if (pastedText && draft.length - selected + pastedText.length > MAX_CHARS) {
      event.preventDefault();
      attachments.addFiles([new File([pastedText], 'pasted-text.txt', { type: 'text/plain' })]);
    }
  }

  const full = attachments.items.length >= MAX_FILES;

  return (
    <div className={dropping ? 'study-agent__composer-wrap is-dropping' : 'study-agent__composer-wrap'}>
      {hasMessages ? (
        <div className="study-agent__quick" role="group" aria-label="Ways to continue">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.intent}
              type="button"
              className="study-agent__quick-button"
              disabled={disabled || sending}
              onClick={() => onQuick(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {attachments.problem ? (
        <p className="form-error" role="alert">
          {attachments.problem}
        </p>
      ) : null}
      {attachments.hasUnusable ? (
        <p className="study-agent__hint" role="status">
          Remove the files that could not be used before sending.
        </p>
      ) : null}

      <form
        className="study-agent__composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) {
            onSend();
          }
        }}
      >
        <AttachmentTray attachments={attachments} />
        <label className="visually-hidden" htmlFor="study-agent-input">
          Message to Study Agent
        </label>
        <textarea
          id="study-agent-input"
          ref={textarea}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Ask anything, or paste a question, photo or document"
          rows={1}
          maxLength={MAX_CHARS}
          disabled={disabled}
        />
        <div className="study-agent__composer-bar">
          <input
            ref={fileInput}
            type="file"
            className="visually-hidden"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            aria-label="Attach images, PDFs or text files"
            data-testid="study-agent-file-input"
            tabIndex={-1}
            onChange={(event) => {
              attachments.addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="study-agent__tool"
            aria-label="Attach files"
            title="Attach images, PDFs or text files"
            disabled={disabled || full}
            onClick={() => fileInput.current?.click()}
          >
            <AgentIcon name="attach" />
          </button>
          <button
            type="button"
            className="study-agent__tool study-agent__tool--label"
            aria-pressed={research}
            title="Let the agent search the web for this message"
            disabled={disabled || sending}
            onClick={() => onResearch(!research)}
          >
            <AgentIcon name="globe" />
            <span>Research online</span>
          </button>
          <span className="study-agent__composer-hint">Enter to send · Shift+Enter for a new line</span>
          <button
            type="submit"
            className="btn btn--primary study-agent__send"
            aria-label="Send message"
            title="Send message"
            disabled={!canSend}
          >
            <AgentIcon name="send" />
          </button>
        </div>
      </form>
    </div>
  );
}
