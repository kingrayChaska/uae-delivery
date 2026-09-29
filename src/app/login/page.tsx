import Logo from '@/components/brand/logo';
import LoginForm from '@/components/auth/login-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in — ParcelLink',
  description: 'Sign in to book deliveries, track shipments and view proof of delivery.',
  alternates: { canonical: '/login' },
};

const LoginPage = () => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <Logo height={40} priority />
      <h1 className="text-2xl font-semibold">Sign In</h1>
      <LoginForm />
    </main>
  );
};

export default LoginPage;
