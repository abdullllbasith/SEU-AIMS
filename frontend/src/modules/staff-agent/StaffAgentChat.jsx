import { useEffect, useRef, useState } from "react";
import { AgentThinking } from "../study-agent/AgentThinking.jsx";
import { AgentIcon } from "../study-agent/agent-icons.jsx";
import { MessageContent } from "../study-agent/MessageContent.jsx";
import {
  MAX_MESSAGE_CHARS,
  failedSources,
  linkCitations,
  toHistory,
} from "./staff-chat.js";

const THINKING_STEPS = [
  "Reading your question",
  "Looking up your data",
  "Checking the details",
  "Writing the answer",
];

function AgentReply({ message }) {
  const { text, listed } = linkCitations(message.text, message.sources);
  const failed = failedSources(message.sources);
  return (
    <>
      <MessageContent text={text} sourceCount={listed.length} />
      {listed.length ? (
        <ul
          className="study-agent__sources"
          aria-label="Data used for this answer"
        >
          {listed.map((source, index) => (
            <li key={source.tool}>
              <span className="study-agent__source-kind study-agent__source-kind--official">
                {index + 1}
              </span>
              <span className="study-agent__source-title">{source.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {failed.length ? (
        <p className="study-agent__note" role="status">
          Could not load: {failed.map((source) => source.label).join(", ")}.
          This answer may be incomplete.
        </p>
      ) : null}
    </>
  );
}

/**
 * Chat for a read-only staff assistant. `api.send({ content, history })` returns
 * `{ data: { reply, sources } }`. The conversation lives in this component only.
 */
export function StaffAgentChat({
  api,
  title,
  subtitle,
  intro,
  suggestions = [],
  placeholder,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const thread = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    if (thread.current) {
      thread.current.scrollTop = thread.current.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    const node = input.current;
    if (node) {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
    }
  }, [draft]);

  async function submit(text) {
    const content = text.trim();
    if (!content || sending) {
      return;
    }
    const history = toHistory(messages);
    setError("");
    setDraft("");
    setSending(true);
    setMessages((current) => [
      ...current,
      { id: `u${current.length}`, role: "user", text: content },
    ]);
    try {
      const body = await api.send({ content, history });
      setMessages((current) => [
        ...current,
        {
          id: `a${current.length}`,
          role: "agent",
          text: body.data.reply,
          sources: body.data.sources || [],
        },
      ]);
    } catch (caught) {
      // Put the question back so the user can retry without retyping it.
      setMessages((current) => current.slice(0, -1));
      setDraft(content);
      setError(
        caught?.message || "The assistant could not answer. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent?.isComposing
    ) {
      event.preventDefault();
      submit(draft);
    }
  }

  return (
    <div className="study-agent">
      <div className="study-agent__chat">
        <div className="study-agent__chat-head">
          <div className="study-agent__chat-heading">
            <h2 className="study-agent__chat-title">New chat</h2>
            <p className="study-agent__chat-subject">{subtitle} � Read-only</p>
          </div>
          <div className="study-agent__chat-actions">
            <button
              type="button"
              className="study-agent__action"
              disabled={!messages.length || sending}
              onClick={() => {
                setMessages([]);
                setError("");
              }}
            >
              <AgentIcon name="plus" />
              <span>New chat</span>
            </button>
          </div>
        </div>

        <div className="study-agent__thread" ref={thread} aria-live="polite">
          {!messages.length && !sending ? (
            <div className="study-agent__welcome">
              <span className="study-agent__welcome-icon" aria-hidden="true">
                <AgentIcon name="spark" />
              </span>
              <h3>{title}</h3>
              <p>{intro}</p>
              {suggestions.length ? (
                <div
                  className="study-agent__starters"
                  role="group"
                  aria-label="Suggested questions"
                >
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="study-agent__starter"
                      onClick={() => submit(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className={`study-agent__message study-agent__message--${message.role === "agent" ? "agent" : "student"}`}
            >
              <p className="study-agent__message-who">
                {message.role === "agent" ? "Assistant" : "You"}
              </p>
              {message.role === "agent" ? (
                <AgentReply message={message} />
              ) : (
                <p className="study-agent__plain">{message.text}</p>
              )}
            </article>
          ))}
          {sending ? <AgentThinking steps={THINKING_STEPS} /> : null}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <form
          className="study-agent__composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <label className="visually-hidden" htmlFor="staff-agent-input">
            Message to the assistant
          </label>
          <div className="study-agent__input-box">
            <textarea
              id="staff-agent-input"
            ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              maxLength={MAX_MESSAGE_CHARS}
              disabled={sending}
            />
            <div className="study-agent__input-actions">
              <span className="study-agent__hint">
                Shift+Enter for a new line
              </span>
              <button
                type="submit"
                className="btn btn--primary study-agent__send"
                aria-label="Send message"
                title="Send message"
                disabled={sending || !draft.trim()}
              >
                <AgentIcon name="send" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
