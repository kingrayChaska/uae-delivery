import Image from 'next/image';
import Link from 'next/link';

import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

type LogoProps = {
  // Rendered height in px; the width follows the logo's aspect ratio.
  height?: number;
  href?: string | null;
  priority?: boolean;
  className?: string;
};

const Logo = ({ height = 32, href = '/', priority = false, className = '' }: LogoProps) => {
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
    <Link href={href} aria-label={`${BRAND.name} home`} className="inline-flex shrink-0 items-center">
      {image}
    </Link>
  );
};

export default Logo;
