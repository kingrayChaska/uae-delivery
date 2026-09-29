import 'server-only';

// Transactional email. The only email this app sent before was Supabase
// Auth's own (confirm signup, invites, password reset), which can't carry
// arbitrary messages — so this is a deliberately small, provider-agnostic
// sender, the same way lib/payments wraps an unconfigured provider.
//
// Configure with RESEND_API_KEY and EMAIL_FROM (e.g.
// "ParcelLink <notifications@yourdomain.ae>"). Without them, sending is
// skipped and logged, and the in-app notification (created by a database
// trigger, migration 0022) is still delivered. Email failures never block
// the action that triggered them.

export type EmailMessage = {
  to: string;
  subject: string;
  // Plain text is the source of truth; HTML is a simple rendering of it.
  text: string;
  actionUrl?: string;
  actionLabel?: string;
};

export type EmailResult = { sent: true } | { sent: false; reason: string };

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderHtml = ({ subject, text, actionUrl, actionLabel }: EmailMessage) => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button =
    actionUrl && actionLabel
      ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="background:#7b3fa7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(actionLabel)}</a></p>`
      : '';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1d1a24;background:#f8f6fb;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><h1 style="font-size:20px;margin:0 0 20px">${escapeHtml(subject)}</h1>${paragraphs}${button}<p style="margin:32px 0 0;color:#6b6776;font-size:12px">ParcelLink · Parcel delivery across the UAE</p></div></body></html>`;
};

export const sendEmail = async (message: EmailMessage): Promise<EmailResult> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn(`Email not sent ("${message.subject}"): RESEND_API_KEY / EMAIL_FROM are not configured`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.actionUrl ? `${message.text}\n\n${message.actionLabel ?? 'Open'}: ${message.actionUrl}` : message.text,
        html: renderHtml(message),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error('Email provider rejected the message', response.status);
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('Email send failed', error instanceof Error ? error.message : error);
    return { sent: false, reason: 'network' };
  }
};
