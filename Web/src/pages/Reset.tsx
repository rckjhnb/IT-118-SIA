import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, inputClass } from '../components/ui';

export function Reset() {
  const [params] = useSearchParams();
  const { config } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api('/reset', { method: 'POST', body: Object.fromEntries(fd) });
      push('Password updated', 'You can log in with your new password now.');
      navigate('/login');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Reset password</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Use the 6-digit code we emailed you.</p>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="BU email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={params.get('email') || ''}
            required
            autoComplete="username"
            className={inputClass}
          />
        </Field>
        <Field label="Reset code" htmlFor="code">
          <input
            id="code"
            name="code"
            inputMode="numeric"
            maxLength={6}
            required
            autoComplete="one-time-code"
            className={`${inputClass} text-center tracking-[0.4em]`}
          />
        </Field>
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm_password">
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
      {config.demo && (
        <p className="mt-4 text-center text-xs text-muted">
          Read the code in the{' '}
          <Link to="/outbox" className="text-bu hover:underline">
            dev outbox
          </Link>
          .
        </p>
      )}
    </div>
  );
}
