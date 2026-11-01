import { useEffect, useState } from 'react';

/** Shown one after another while the agent works; the last one stays until the answer arrives. */
export const THINKING_STEPS = [
  'Reading your question',
  'Checking your subjects and records',
  'Looking through course material',
  'Connecting the ideas',
  'Working out the answer',
  'Structuring the reply',
];

const STEP_MS = 1800;

export function AgentThinking({ steps = THINKING_STEPS, stepMs = STEP_MS }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= steps.length - 1) {
      return undefined;
    }
    const timer = setTimeout(() => setIndex((current) => current + 1), stepMs);
    return () => clearTimeout(timer);
  }, [index, steps.length, stepMs]);

  return (
    <p className="study-agent__thinking" role="status">
      <span className="study-agent__thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span key={index} className="study-agent__thinking-word">
        {steps[index]}…
      </span>
    </p>
  );
}
