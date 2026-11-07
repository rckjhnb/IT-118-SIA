import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Alert, BrandMark, Button, Field, inputClass } from '../components/ui';

export function Signup() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ email: string }>('/signup', { method: 'POST', body: Object.fromEntries(fd) });
      navigate('/verify?email=' + encodeURIComponent(r.email));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark className="h-11 w-11 text-lg" />
          <div>
            <p className="font-display text-xl font-bold text-bu">FoundIT</p>
            <p className="text-xs text-muted">Bicol University Lost &amp; Found</p>
          </div>
        </div>
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Only enrolled BU students can sign up.</p>
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
          <Field label="Student ID" htmlFor="student_id">
            <input id="student_id" name="student_id" required placeholder="2024-00101" className={inputClass} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm_password">
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
            {busy ? 'Sending code…' : 'Send verification code'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-bu hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
