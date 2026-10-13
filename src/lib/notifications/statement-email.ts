import type { EmailContent } from '@/lib/notifications/email';

// The "your account statement is ready" email (migration 0045). Pure
// rendering. It deliberately carries no figures and no line items — only
// the statement number, the period and a link to the signed-in page — so a
// forwarded or intercepted email reveals nothing financial. English with an
// Arabic version, like the app's other customer emails.

export type StatementEmailData = {
  statementId: string;
  statementNumber: string;
  merchantName: string;
  periodStart: string;
  periodEnd: string;
};

const date = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));

export const statementEmailUrl = (origin: string, statementId: string) =>
  `${origin.replace(/\/+$/, '')}/dashboard/customer/statements/${encodeURIComponent(statementId)}`;

export const renderStatementEmail = (data: StatementEmailData): EmailContent & { arabic: EmailContent } => {
  const enPeriod = `${date(data.periodStart, 'en-GB')} – ${date(data.periodEnd, 'en-GB')}`;
  const arPeriod = `${date(data.periodStart, 'ar-AE-u-nu-latn')} – ${date(data.periodEnd, 'ar-AE-u-nu-latn')}`;
  return {
    subject: `Your ParcelLink account statement ${data.statementNumber} is ready`,
    text: [
      `Hello ${data.merchantName},`,
      `ParcelLink has issued account statement ${data.statementNumber} for ${enPeriod}.`,
      'Sign in to your ParcelLink dashboard to view and download it under Account Reports. For your security, this email doesn’t include any amounts.',
    ].join('\n\n'),
    actionLabel: 'View statement',
    arabic: {
      subject: `كشف حسابك ${data.statementNumber} من ParcelLink جاهز`,
      text: [
        `مرحباً ${data.merchantName}،`,
        `أصدرت ParcelLink كشف الحساب ${data.statementNumber} للفترة ${arPeriod}.`,
        'سجّل الدخول إلى لوحة ParcelLink لعرضه وتنزيله من «تقارير الحساب». حرصاً على أمانك، لا يتضمن هذا البريد أي مبالغ.',
      ].join('\n\n'),
      actionLabel: 'عرض الكشف',
    },
  };
};
