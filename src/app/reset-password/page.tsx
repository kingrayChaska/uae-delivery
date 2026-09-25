import ResetPasswordForm from '@/components/auth/reset-password-form';

const ResetPasswordPage = () => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Choose a New Password</h1>
      <ResetPasswordForm />
    </main>
  );
};

export default ResetPasswordPage;
