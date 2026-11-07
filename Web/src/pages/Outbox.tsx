import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { Button, PageHead } from '../components/ui';
import { NotFound } from './NotFound';

interface Mail {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
}

export function Outbox() {
  const { config, user } = useAuth();
  const [messages, setMessages] = useState<Mail[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!config.demo) return;
    api<{ messages: Mail[] }>('/dev/outbox')
      .then((d) => setMessages(d.messages))
      .catch((err) => setError(err.message));
  }, [config.demo]);

  const clear = async () => {
    try {
      await api('/dev/outbox/clear', { method: 'POST' });
      setMessages([]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!config.demo) return <NotFound />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHead
          title="Dev outbox"
          lede="Emails the app tried to send. Development only; this page does not exist in production."
        />
        {user?.role === 'admin' && messages && messages.length > 0 && (
          <Button variant="outline" onClick={clear} className="mb-6">
            Clear outbox
          </Button>
        )}
      </div>
      {error && <p className="mb-4 rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>}
      {!messages ? (
        <p className="py-12 text-center text-muted">Loading…</p>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper px-6 py-16 text-center text-muted">No emails yet.</div>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <article key={m.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-body">{m.subject}</strong>
                <span className="text-xs text-muted">
                  to {m.to_email} · {fmt(m.created_at)}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-body">{m.body}</pre>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
