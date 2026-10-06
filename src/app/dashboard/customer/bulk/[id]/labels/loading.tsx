import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Shown while the server builds every label (QR codes included).
const Loading = () => {
  const t = useTranslations('bulk.labels');
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6" aria-busy="true">
      <LoaderCircle className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
      <p role="status" className="font-medium">
        {t('preparing')}
      </p>
    </main>
  );
};

export default Loading;
