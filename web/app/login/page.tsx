import { LoginForm } from './login-form'

// Server component: reads the ?error= surfaced by /auth/callback and passes it to the form.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <LoginForm initialError={error} />
}
