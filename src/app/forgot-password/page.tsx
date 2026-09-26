import Logo from '@/components/brand/logo';
import ForgotPasswordForm from '@/components/auth/forgot-password-form';

const ForgotPasswordPage = () => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <Logo height={40} priority />
      <h1 className="text-2xl font-semibold">Reset Password</h1>
      <ForgotPasswordForm />
    </main>
  );
};

export default ForgotPasswordPage;
