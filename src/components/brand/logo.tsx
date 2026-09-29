import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { BRAND } from '@/lib/brand';
import { localizeHref, toLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';

type LogoProps = {
  // Rendered height in px; the width follows the logo's aspect ratio.
  height?: number;
  href?: string | null;
  priority?: boolean;
  className?: string;
};

const Logo = ({ height = 32, href = '/', priority = false, className = '' }: LogoProps) => {
  const t = useTranslations('nav');
  const locale = toLocale(useLocale());
  const width = Math.round((BRAND.logoWidth / BRAND.logoHeight) * height);
  const image = (
    <Image
      src={BRAND.logoSrc}
      alt={BRAND.name}
      width={width}
      height={height}
      priority={priority}
      className={cn('h-auto max-w-full', className)}
      style={{ width, height: 'auto' }}
    />
  );

  if (!href) return image;
  return (
    <Link href={localizeHref(href, locale)} aria-label={t('home')} className="inline-flex shrink-0 items-center">
      {image}
    </Link>
  );
};

export default Logo;
