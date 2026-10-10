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
//
// We don't know which language a recipient reads, so messages can carry an
// Arabic version too: it follows the English one in the same email, laid
// out right to left.

export type EmailContent = {
  subject: string;
  // Plain text is the source of truth; HTML is a simple rendering of it.
  text: string;
  actionLabel?: string;
  footer?: string;
};

export type EmailMessage = EmailContent & {
  to: string | string[];
  actionUrl?: string;
  arabic?: EmailContent;
  // A ready-made HTML body, for messages that need more than paragraphs
  // and a button (e.g. the operator booking email's details table).
  html?: string;
  // Resend keeps this for 24 hours: a retry with the same key is answered
  // with the original email instead of sending a second one.
  idempotencyKey?: string;
};

// `sent` means the provider accepted the message, not that it was delivered.
// `retryable` says whether trying again later could succeed (network,
// timeouts, rate limits, 5xx); `providerError` is the provider's error
// name, never its message (which can quote addresses).
export type EmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string; retryable: boolean; providerError?: string };

const isRetryableStatus = (status: number) => status === 408 || status === 409 || status === 429 || status >= 500;

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DEFAULT_FOOTER = 'ParcelLink · Parcel delivery across the UAE';

const renderBlock = ({ subject, text, actionLabel, footer }: EmailContent, actionUrl: string | undefined) => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button =
    actionUrl && actionLabel
      ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="background:#7b3fa7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(actionLabel)}</a></p>`
      : '';
  return `<h1 style="font-size:20px;margin:0 0 20px">${escapeHtml(subject)}</h1>${paragraphs}${button}<p style="margin:32px 0 0;color:#6b6776;font-size:12px">${escapeHtml(footer ?? DEFAULT_FOOTER)}</p>`;
};

const renderHtml = (message: EmailMessage) => {
  const english = renderBlock(message, message.actionUrl);
  const arabic = message.arabic
    ? `<div dir="rtl" lang="ar" style="margin-top:32px;padding-top:32px;border-top:1px solid #e5e2ea;text-align:right;font-family:Tahoma,Arial,sans-serif">${renderBlock(message.arabic, message.actionUrl)}</div>`
    : '';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1d1a24;background:#f8f6fb;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><div lang="en" dir="ltr">${english}</div>${arabic}</div></body></html>`;
};

const renderText = (content: EmailContent, actionUrl: string | undefined) =>
  actionUrl ? `${content.text}\n\n${content.actionLabel ?? 'Open'}: ${actionUrl}` : content.text;

export const sendEmail = async (message: EmailMessage): Promise<EmailResult> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn(`Email not sent ("${message.subject}"): RESEND_API_KEY / EMAIL_FROM are not configured`);
    return { sent: false, reason: 'not_configured', retryable: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.arabic ? `${message.subject} | ${message.arabic.subject}` : message.subject,
        text: message.arabic
          ? `${renderText(message, message.actionUrl)}\n\n———\n\n${renderText(message.arabic, message.actionUrl)}`
          : renderText(message, message.actionUrl),
        html: message.html ?? renderHtml(message),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = (await response.json().catch(() => null)) as { id?: unknown; name?: unknown } | null;
    if (!response.ok) {
      const providerError = typeof body?.name === 'string' ? body.name.slice(0, 80) : undefined;
      console.error('Email provider rejected the message', response.status, providerError ?? '');
      return { sent: false, reason: `http_${response.status}`, retryable: isRetryableStatus(response.status), providerError };
    }
    return { sent: true, id: typeof body?.id === 'string' ? body.id : null };
  } catch (error) {
    console.error('Email send failed', error instanceof Error ? error.message : error);
    return { sent: false, reason: 'network', retryable: true };
  }
};
