import Logo from '@/components/brand/logo';
import RegisterForm from '@/components/auth/register-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create an account — ParcelLink',
  description:
    'Create a free ParcelLink account to book same-day and next-day parcel delivery across the UAE, or apply for a merchant account.',
  alternates: { canonical: '/register' },
};

const RegisterPage = () => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <Logo height={40} priority />
      <h1 className="text-2xl font-semibold">Create Account</h1>
      <RegisterForm />
    </main>
  );
};

export default RegisterPage;
