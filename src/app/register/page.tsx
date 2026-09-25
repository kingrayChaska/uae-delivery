import RegisterForm from '@/components/auth/register-form';

const RegisterPage = () => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create Account</h1>
      <RegisterForm />
    </main>
  );
};

export default RegisterPage;
