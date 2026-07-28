import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }) {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.OWNER_EMAILS,
  );
  const params = await searchParams;
  const error = typeof params?.error === 'string' ? params.error : null;
  return <LoginForm googleEnabled={googleEnabled} error={error} />;
}
