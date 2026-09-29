import Link from 'next/link';
import { CircleAlert, Headset, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { serviceAreaNotice } from '@/lib/service-areas/config';
import { cn } from '@/lib/utils';
import { useMessage } from '@/i18n/hooks';

import type { LocationEnd, ServiceArea } from '@/lib/service-areas/config';

type ServiceAreaNoticeProps = {
  area: ServiceArea;
  end: LocationEnd;
  contactHref: string;
  className?: string;
};

// Shown instead of letting the booking continue when a pickup or delivery
// location is outside the emirates ParcelLink delivers to normally.
const ServiceAreaNoticeCard = ({ area, end, contactHref, className }: ServiceAreaNoticeProps) => {
  const t = useTranslations('serviceAreas.notice');
  const translate = useMessage();
  const notice = serviceAreaNotice(area, end);
  if (!notice) return null;
  const onRequest = area.status === 'request_only';
  const Icon = onRequest ? CircleAlert : MapPinOff;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none',
        onRequest ? 'border-warning/60 bg-warning/10' : 'border-destructive/40 bg-destructive/5',
        className,
      )}
    >
      <p className={cn('flex items-start gap-2 font-semibold', onRequest ? 'text-foreground' : 'text-destructive')}>
        <Icon className={cn('mt-0.5 size-5 shrink-0', onRequest && 'text-warning-foreground dark:text-warning')} aria-hidden />
        {translate(notice.title)}
      </p>
      {notice.body.map((paragraph) => (
        <p key={paragraph} className="text-sm">
          {translate(paragraph)}
        </p>
      ))}
      <div>
        <Button asChild variant={onRequest ? 'default' : 'outline'} size="sm">
          <Link href={contactHref}>
            <Headset aria-hidden />
            {t('contact')}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default ServiceAreaNoticeCard;
