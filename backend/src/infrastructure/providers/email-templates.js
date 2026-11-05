/**
 * HTML + plain-text email rendering for SEU-AIMS. Table-based, inline-styled layout for mail clients.
 * The logo is attached inline (CID) so it renders without a public asset URL.
 */
import { fileURLToPath } from 'node:url';

const LOGO_PATH = fileURLToPath(new URL('./email-assets/seu-aims-logo.png', import.meta.url));
export const LOGO_CID = 'seu-logo';

// Palette from frontend/src/styles/global.css (brand-900, brand-700, brand-50, danger, success, amber).
const COLORS = {
  navy: '#041e49',
  brand: '#0b57d0',
  brandSoft: '#edf2fc',
  bg: '#f1f5fb',
  surface: '#ffffff',
  text: '#1f1f1f',
  muted: '#5f6368',
  border: '#dce3ee',
};

const TONES = {
  brand: { ink: '#0b57d0', soft: '#edf2fc' },
  success: { ink: '#137333', soft: '#e6f4ea' },
  danger: { ink: '#c5221f', soft: '#fff7f7' },
  attention: { ink: '#92400e', soft: '#fef7e0' },
};

const CATEGORY_LABEL = {
  ca: 'CA recovery',
  results: 'Results',
  notice: 'Notice',
  calendar: 'Calendar',
  security: 'Account security',
};

// type -> [category, tone]
const TYPE_STYLE = {
  CA_APPLICATION_SUBMITTED: ['ca', 'brand'],
  CA_APPLICATION_APPROVED: ['ca', 'success'],
  CA_APPLICATION_REJECTED: ['ca', 'danger'],
  CA_APPLICATION_REOPENED: ['ca', 'attention'],
  CA_WINDOW_OPEN: ['ca', 'brand'],
  CA_EXAM_SCHEDULED: ['ca', 'brand'],
  CA_EXAM_RESCHEDULED: ['ca', 'attention'],
  CA_EXAM_CANCELLED: ['ca', 'danger'],
  CA_EXAM_COMPLETED: ['ca', 'success'],
  CA_EXAM_MISSED: ['ca', 'danger'],
  CA_REMINDER: ['ca', 'attention'],
  CA_LECTURER_APPROVED_STUDENT: ['ca', 'attention'],
  RESULTS_UPDATED: ['results', 'success'],
  NOTICE_PUBLISHED: ['notice', 'brand'],
  CALENDAR_REMINDER: ['calendar', 'brand'],
};

const DEFAULT_STYLE = ['notice', 'brand'];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphsHtml(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.text};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

function buttonHtml(action, tone) {
  if (!action) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
  <tr><td style="border-radius:999px;background:${tone.ink};">
    <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(action.label)}</a>
  </td></tr>
</table>`;
}

/** Shared shell: navy header with logo, category chip, heading, body, optional button, footer. */
function layout({ category, tone, heading, bodyText, action, preheader }) {
  const t = TONES[tone] || TONES.brand;
  const categoryLabel = CATEGORY_LABEL[category] || CATEGORY_LABEL.notice;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLORS.surface};border-radius:20px;overflow:hidden;border:1px solid ${COLORS.border};">
      <tr><td style="background:${COLORS.navy};padding:22px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:14px;">
            <img src="cid:${LOGO_CID}" alt="SEU-AIMS logo" width="96" height="64" style="display:block;width:96px;height:auto;border:0;">
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">SEU-AIMS</div>
            <div style="font-size:12px;color:#a8c7fa;margin-top:2px;">South Eastern University of Sri Lanka</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:30px 28px 10px;">
        <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${t.soft};color:${t.ink};font-size:12px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(categoryLabel)}</span>
        <h1 style="margin:14px 0 14px;font-size:22px;line-height:1.3;color:${COLORS.text};font-weight:700;">${escapeHtml(heading)}</h1>
        ${paragraphsHtml(bodyText)}
        ${buttonHtml(action, t)}
      </td></tr>
      <tr><td style="padding:18px 28px 26px;border-top:1px solid ${COLORS.border};">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">This is an automated message from SEU-AIMS. Please do not reply to this email.</p>
        <p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">Times are shown in Asia/Colombo.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const textParts = [heading, '', String(bodyText ?? '').trim()];
  if (action) textParts.push('', `${action.label}: ${action.url}`);
  textParts.push('', '— SEU-AIMS, South Eastern University of Sri Lanka');
  return { html, text: textParts.join('\n') };
}

function logoAttachment() {
  return [{ filename: 'seu-aims-logo.png', path: LOGO_PATH, cid: LOGO_CID }];
}

/**
 * Render a notification email from a stored notification (type, title, body).
 * @returns {{ subject: string, text: string, html: string, attachments: object[] }}
 */
export function renderNotificationEmail({ type, title, body }) {
  const [category, tone] = TYPE_STYLE[type] || DEFAULT_STYLE;
  const heading = title || type || 'SEU-AIMS notification';
  const { html, text } = layout({
    category,
    tone,
    heading,
    bodyText: body || heading,
    preheader: String(body || heading).slice(0, 120),
  });
  return { subject: heading, text, html, attachments: logoAttachment() };
}

/**
 * Password reset email with a button to the frontend reset page.
 * @param {{ resetUrl: string, ttlMinutes: number }} options
 */
export function renderPasswordResetEmail({ resetUrl, ttlMinutes }) {
  const heading = 'Reset your password';
  const bodyText = [
    'We received a request to reset the password for your SEU-AIMS account.',
    `Use the button below to choose a new password. The link expires in ${ttlMinutes} minutes and can be used once.`,
    "If you did not request this, you can ignore this email. Your password will not change.",
  ].join('\n\n');
  const { html, text } = layout({
    category: 'security',
    tone: 'brand',
    heading,
    bodyText,
    action: { label: 'Reset password', url: resetUrl },
    preheader: 'Reset your SEU-AIMS password',
  });
  return { subject: 'Reset your SEU-AIMS password', text, html, attachments: logoAttachment() };
}
