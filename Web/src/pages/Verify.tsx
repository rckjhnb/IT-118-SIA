import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, inputClass } from '../components/ui';

export function Verify() {
  const [params] = useSearchParams();
  const email = (params.get('email') || '').toLowerCase();
  const { refresh, config } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!email) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper p-8 text-center">
        <p className="text-body">Start by creating an account.</p>
        <Link to="/signup" className="mt-3 inline-block font-semibold text-bu hover:underline">
          Sign up
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ user: { full_name: string | null; email: string } }>('/verify', {
        method: 'POST',
        body: { email, code: fd.get('code') },
      });
      await refresh();
      push('Email verified', 'Welcome, ' + (r.user.full_name || r.user.email) + '!');
      navigate('/');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    await api('/verify/resend', { method: 'POST', body: { email } }).catch(() => {});
    push('Code sent', 'If that account is waiting for verification, a new code is on the way.');
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Verify your email</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Enter the 6-digit code sent to <strong className="text-body">{email}</strong>. It expires in 15 minutes.
      </p>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Verification code" htmlFor="code">
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={`${inputClass} text-center text-lg tracking-[0.4em]`}
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Verifying…' : 'Verify and log in'}
        </Button>
      </form>
      <button type="button" onClick={resend} className="mt-4 w-full text-center text-sm text-bu hover:underline">
        Send a new code
      </button>
      {config.demo && (
        <p className="mt-3 text-center text-xs text-muted">
          No SMTP yet? Read the code in the{' '}
          <Link to="/outbox" className="text-bu hover:underline">
            dev outbox
          </Link>
          .
        </p>
      )}
    </div>
  );
}
