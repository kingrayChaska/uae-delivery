import { NextIntlClientProvider } from 'next-intl';

// Signed-in pages get every message namespace in the browser (the root
// layout only ships the public ones).
const DashboardLayout = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider>{children}</NextIntlClientProvider>
);

export default DashboardLayout;
