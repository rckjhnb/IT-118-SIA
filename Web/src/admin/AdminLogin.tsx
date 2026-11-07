import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { api, ApiError, type User } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import CodeSlots from '../components/CodeSlots';
import { inputClass } from '../components/ui';

type Step = 'password' | 'code';

export function AdminLogin() {
  const { refresh, config } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const continueToCode = params.get('step') === 'code';
  const [step, setStep] = useState<Step>(continueToCode ? 'code' : 'password');
  const [setup, setSetup] = useState(continueToCode && params.get('setup') === '1');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'error'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setupStarted = useRef(false);

  // Arriving from the student login with a pending admin session: go straight
  // to the code, and create the TOTP secret first if this admin has none yet.
  useEffect(() => {
    if (!continueToCode || !setup || setupStarted.current) return;
    setupStarted.current = true;
    api<{ qr: string; secret: string }>('/2fa/setup', { method: 'POST' })
      .then((s) => {
        setQr(s.qr);
        setSecret(s.secret);
      })
      .catch((err) => {
        setError((err as ApiError).message);
        setStep('password');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (user?: User) => {
    await refresh();
    push('Admin signed in', (user?.full_name || user?.email || 'Administrator') + ' is now online.');
    navigate('/admin');
  };

  const password = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ user?: User; needs2fa?: boolean; needsTotpSetup?: boolean }>('/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      if (r.user) {
        if (r.user.role !== 'admin') {
          setError('That account is a student account. Use the student login.');
          return;
        }
        await finish(r.user);
        return;
      }
      if (r.needsTotpSetup) {
        const s = await api<{ qr: string; secret: string }>('/2fa/setup', { method: 'POST' });
        setQr(s.qr);
        setSecret(s.secret);
        setSetup(true);
      }
      setStep('code');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setError('');
    setBusy(true);
    try {
      const r = await api<{ user: User }>(setup ? '/2fa/enable' : '/2fa/verify', {
        method: 'POST',
        body: { code: value },
      });
      await finish(r.user);
    } catch (err) {
      setCodeStatus('error');
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Link
        to="/"
        className="relative z-10 mb-8 inline-flex items-center gap-2 text-sm text-body no-underline hover:text-heading"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to FoundIT
      </Link>

      <div className="fade-up relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-main.png" alt="" aria-hidden="true" className="h-12 w-12 flex-shrink-0 object-contain" />
          <div>
            <p className="font-display text-xl font-semibold text-heading">FoundIT Admin</p>
            <p className="text-xs text-muted">Bicol University Lost &amp; Found</p>
          </div>
        </div>

        <div className="admin-card admin-panel rounded-3xl p-6 sm:p-8">
          {step === 'password' ? (
            <>
              <div className="mb-5 flex items-center gap-2 text-body">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider">Step 1 of 2</span>
              </div>
              <h1 className="text-2xl font-semibold text-heading">Sign in</h1>
              <p className="mb-6 mt-1 text-sm text-muted">Administrator password, then your authenticator code.</p>
              <form onSubmit={password} className="space-y-4">
                {error && (
                  <p role="alert" className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">
                    {error}
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="admin-email" className="text-[13px] font-medium text-body">
                    Admin email
                  </label>
                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="admin@bicol-u.edu.ph"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="admin-password" className="text-[13px] font-medium text-body">
                    Password
                  </label>
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#5b20ff] px-4 py-3 text-sm font-bold text-white shadow-[0_0_40px_rgba(167,139,250,0.35)] transition hover:bg-[#7a46ff] disabled:opacity-60"
                >
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-2 text-body">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider">Step 2 of 2</span>
              </div>
              <h1 className="text-2xl font-semibold text-heading">{setup ? 'Set up two-factor' : 'Authenticator code'}</h1>
              <p className="mb-6 mt-1 text-sm text-muted">
                {setup
                  ? 'Scan this with Google Authenticator, then enter the 6-digit code it shows.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>

              {setup && (
                <div className="mb-6 text-center">
                  {qr && (
                    <img
                      src={qr}
                      alt="QR code to add FoundIT to Google Authenticator"
                      width={200}
                      height={200}
                      className="mx-auto rounded-2xl bg-white p-2"
                    />
                  )}
                  <p className="mt-3 text-xs text-muted">Cannot scan? Enter this key manually:</p>
                  <code className="mt-1 inline-block break-all rounded-lg bg-sunken px-3 py-1.5 text-xs text-body">
                    {secret}
                  </code>
                </div>
              )}

              {error && (
                <p role="alert" className="mb-4 rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">
                  {error}
                </p>
              )}

              <CodeSlots
                value={code}
                onChange={(next) => {
                  setCode(next);
                  if (next) setCodeStatus('idle');
                }}
                onComplete={verify}
                status={codeStatus}
                disabled={busy}
                autoFocus
                slotSize={40}
                gap={6}
                ariaLabel="6-digit authenticator code"
                className="w-full"
              />

              <button
                type="button"
                onClick={() => verify(code)}
                disabled={busy || code.length !== 6}
                className="mt-6 w-full rounded-xl bg-[#5b20ff] px-4 py-3 text-sm font-bold text-white shadow-[0_0_40px_rgba(167,139,250,0.35)] transition hover:bg-[#7a46ff] disabled:opacity-40"
              >
                {busy ? 'Verifying…' : setup ? 'Enable 2FA and log in' : 'Verify and log in'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('password');
                  setCode('');
                  setCodeStatus('idle');
                  setError('');
                }}
                className="mt-4 w-full text-center text-sm text-muted hover:text-heading"
              >
                Use a different account
              </button>
            </>
          )}

          {config.demo && step === 'password' && (
            <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
              Demo admin: <code className="text-body">admin@bicol-u.edu.ph</code> / <code className="text-body">Password123</code>
              , then the authenticator code.
            </p>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Codes change every 30 seconds. Lost your device? An admin with database access must reset 2FA.
        </p>
      </div>
    </div>
  );
}
