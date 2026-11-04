import { PageHeader } from '../../ui/PageHeader.jsx';
import { StaffAgentChat } from './StaffAgentChat.jsx';
import { adminAgentApi, lecturerAgentApi } from './staff-agent-api.js';

const LECTURER_SUGGESTIONS = [
  'What needs my attention today?',
  'What deadlines and events are coming up?',
  'Which offerings am I assigned to?',
  'Which students are approved for CA recovery?',
];

const ADMIN_SUGGESTIONS = [
  'Give me an operations briefing.',
  'Are there any failed jobs or result imports?',
  'Which offerings have no lecturer or resources?',
  'Show the CA recovery status.',
  'Any security or data-quality issues?',
];

export function LecturerAssistantPage() {
  return (
    <section className="record-page">
      <PageHeader
        title="Lecturer Assistant"
        purpose="Ask about your offerings, rosters, deadlines and CA recovery. It only reads your own assignments."
      />
      <StaffAgentChat
        api={lecturerAgentApi}
        subtitle="TEACHING"
        title="Ask about your teaching"
        intro="Try a question below, or ask in your own words, for example “Who is in ICT1233?”. The assistant looks things up for you; it cannot change anything."
        suggestions={LECTURER_SUGGESTIONS}
        placeholder="Ask about your teaching…"
      />
    </section>
  );
}

export function AdminAssistantPage() {
  return (
    <section className="record-page">
      <PageHeader
        title="Admin Assistant"
        purpose="Ask about operations, people, offerings, imports, CA recovery and security for your department."
      />
      <StaffAgentChat
        api={adminAgentApi}
        subtitle="OPERATIONS"
        title="Ask about the department"
        intro="Try a question below, or ask in your own words, for example “Find student 001”. The assistant reads data and points you to the right page; it cannot change anything."
        suggestions={ADMIN_SUGGESTIONS}
        placeholder="Ask about the department…"
      />
    </section>
  );
}
