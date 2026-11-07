import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, type User } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Alert, BrandMark, Button, Field, inputClass } from '../components/ui';

export function Login() {
  const { refresh, config } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ user?: User; needs2fa?: boolean; needsTotpSetup?: boolean; needsVerify?: boolean; email?: string }>(
        '/login',
        { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } },
      );
      if (r.needs2fa || r.needsTotpSetup) {
        navigate(`/admin/login?step=code&setup=${r.needsTotpSetup ? 1 : 0}`);
        return;
      }
      if (r.user) {
        await refresh();
        push('Logged in', (r.user.full_name || r.user.email) + ' signed in.');
        navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      }
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.data.needsVerify) {
        navigate('/verify?email=' + encodeURIComponent(String(e2.data.email || '')));
        return;
      }
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-4xl items-center gap-10 py-6 md:grid-cols-2">
      <div className="hidden md:block">
        <h2 className="text-3xl font-bold text-bu">Why log in?</h2>
        <ul className="mt-5 space-y-3 text-muted">
          <li>Post lost or found items with a photo.</li>
          <li>Message the person who posted an item.</li>
          <li>Mark an item as returned once it is back with its owner.</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark className="h-11 w-11 text-lg" />
          <div>
            <p className="font-display text-xl font-bold text-bu">FoundIT</p>
            <p className="text-xs text-muted">Bicol University Lost &amp; Found</p>
          </div>
        </div>
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Use your Bicol University email.</p>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="BU email" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="firstname.lastname24@bicol-u.edu.ph"
              className={inputClass}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          <Link to="/forgot" className="text-bu hover:underline">
            Forgot your password?
          </Link>{' '}
          ·{' '}
          <Link to="/signup" className="text-bu hover:underline">
            Create an account
          </Link>
        </p>
        {config.demo && (
          <div className="mt-5 border-t border-line pt-4 text-xs text-muted">
            <p className="font-semibold text-body">Demo accounts (development only)</p>
            <p className="mt-1">
              Student: <code>maria.santos24@bicol-u.edu.ph</code> / <code>Password123</code>
            </p>
            <p>
              Admin: <Link to="/admin/login" className="text-bu hover:underline">admin@bicol-u.edu.ph</Link> / <code>Password123</code> + authenticator code
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
