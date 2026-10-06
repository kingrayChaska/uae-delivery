import { NextIntlClientProvider } from 'next-intl';

import Toaster from '@/components/ui/toaster';

// Signed-in pages get every message namespace in the browser (the root
// layout only ships the public ones), and toast notifications that persist
// across page changes.
const DashboardLayout = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider>
    <Toaster>{children}</Toaster>
  </NextIntlClientProvider>
);

export default DashboardLayout;
