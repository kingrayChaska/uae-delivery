import Logo from '@/components/brand/logo';
import LanguageSwitcher from '@/components/i18n/language-switcher';

import type { ReactNode } from 'react';

// The frame around the sign-in, sign-up and password pages: logo, heading,
// and the language switcher in the top corner (top right in English, top
// left in Arabic).
const AuthShell = ({ title, children }: { title: string; children: ReactNode }) => (
  <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 pt-20 pb-8 sm:p-8 sm:pt-20">
    <div className="absolute end-4 top-4">
      <LanguageSwitcher />
    </div>
    <Logo height={40} priority />
    <h1 className="text-2xl font-semibold">{title}</h1>
    {children}
  </main>
);

export default AuthShell;
