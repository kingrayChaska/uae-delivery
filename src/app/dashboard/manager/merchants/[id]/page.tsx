import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import MerchantStatusBadge from '@/components/merchant/merchant-status-badge';
import MerchantReviewPanel from '@/components/merchant/merchant-review-panel';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { isUuid } from '@/lib/security/validate';
import { getMerchantApplication } from '@/services/merchant/applications';

import type { ReactNode } from 'react';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }).format(new Date(value));

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="break-words text-sm font-medium">{children}</dd>
  </div>
);

const MerchantApplicationPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const application = await getMerchantApplication(id);
  if (!application) notFound();

  const website = application.website
    ? application.website.startsWith('http')
      ? application.website
      : `https://${application.website}`
    : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link href="/dashboard/manager/merchants" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Merchant applications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{application.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            Applied by {application.applicantName} ({application.applicantEmail}) · submitted {formatDate(application.submittedAt)}
          </p>
        </div>
        <MerchantStatusBadge status={application.status} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="font-semibold">Decision</h2>
          {application.reviewedAt ? (
            <p className="text-sm text-muted-foreground">
              Last reviewed {formatDate(application.reviewedAt)}
              {application.reviewerName ? ` by ${application.reviewerName}` : ''}
              {application.reviewNote ? ` — “${application.reviewNote}”` : ''}
            </p>
          ) : null}
          <MerchantReviewPanel applicationId={application.id} status={application.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <h2 className="font-semibold">Company</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Registration number">{application.registrationNumber}</Detail>
              <Detail label="Trade licence number">{application.licenseNumber}</Detail>
              <Detail label="Address">{application.companyAddress}</Detail>
              <Detail label="City / country">
                {application.city}, {application.country}
              </Detail>
              <Detail label="Phone">{application.companyPhone}</Detail>
              <Detail label="Business email">{application.businessEmail}</Detail>
              <Detail label="Website">
                {website ? (
                  <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {application.website}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
            </dl>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Trade licence document</p>
              {application.tradeLicenseUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={application.tradeLicenseUrl} target="_blank" rel="noopener noreferrer">
                    <FileText aria-hidden />
                    Open document
                  </a>
                </Button>
              ) : (
                <p className="text-sm">Not uploaded</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <h2 className="font-semibold">Contact person</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Name">{application.contactName}</Detail>
                <Detail label="Position">{application.contactPosition}</Detail>
                <Detail label="Phone">{application.contactPhone}</Detail>
                <Detail label="Email">{application.contactEmail}</Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <h2 className="font-semibold">Shipping profile</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Category">{application.businessCategory}</Detail>
                <Detail label="Shipments per month">{application.monthlyShipmentVolume}</Detail>
                <Detail label="Pickup / warehouse">{application.pickupAddress}</Detail>
                <Detail label="Needs cash on delivery">{application.needsCod ? 'Yes' : 'No'}</Detail>
              </dl>
              {application.notes ? <Detail label="Notes">{application.notes}</Detail> : null}
            </CardContent>
          </Card>
          {application.businessAccountId ? (
            <Button asChild variant="outline" className="self-start">
              <Link href={`/dashboard/manager/business-accounts/${application.businessAccountId}`}>
                View merchant shipments & billing
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default MerchantApplicationPage;
