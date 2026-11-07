import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Alert, Button, Field, inputClass } from '../components/ui';

export function Forgot() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ email: string }>('/forgot', { method: 'POST', body: { email: fd.get('email') } });
      navigate('/reset?email=' + encodeURIComponent(r.email));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Forgot your password?</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Enter your BU email and we will send a reset code.</p>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="BU email" htmlFor="email">
          <input id="email" name="email" type="email" required autoComplete="username" className={inputClass} />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Sending…' : 'Send reset code'}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link to="/login" className="text-bu hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
