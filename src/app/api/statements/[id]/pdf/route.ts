import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/lib/auth/session';
import { getRequestLocale } from '@/i18n/request';
import { renderStatementPdf } from '@/lib/finance/statement-pdf';
import { isUuid } from '@/lib/security/validate';
import { getStatement } from '@/services/finance/statements';

import type { NextRequest } from 'next/server';

// The PDF of one merchant account statement. The statement is read with the
// caller's own session, so RLS (migration 0044) decides access: a manager
// may download any statement, a merchant only a published statement of
// their own business. Anything else — another merchant's statement, a
// draft, a guessed id, another role — is a 404, so the endpoint doesn't
// reveal which statements exist. Nothing is stored: the PDF is drawn from
// the immutable snapshot on each request, so it always matches the portal.
export const GET = async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await getCurrentProfile();
  const { id } = await params;
  if (!profile || !profile.active || !['manager', 'customer'].includes(profile.role) || !isUuid(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let statement;
  try {
    statement = await getStatement(id);
  } catch (error) {
    console.error('Statement PDF: statement could not be read', error instanceof Error ? error.message : error);
    return new NextResponse('Something went wrong', { status: 500 });
  }
  if (!statement) return new NextResponse('Not found', { status: 404 });

  // In the reader's language (the same choice as the page they came from).
  const pdf = renderStatementPdf(statement, await getRequestLocale());
  const filename = `${statement.statementNumber ?? `DRAFT-${statement.periodStart}`}-${statement.merchantName}`
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
