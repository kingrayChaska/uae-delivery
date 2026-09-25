import LoginForm from '@/components/auth/login-form';

const LoginPage = () => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign In</h1>
      <LoginForm />
    </main>
  );
};

export default LoginPage;
