import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquarePlus, ShieldQuestion } from 'lucide-react';
import { api, type Conversation } from '../lib/api';
import { ago } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Button, PageHead } from '../components/ui';

export function Messages() {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<{ conversations: Conversation[]; isAdmin: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ conversations: Conversation[]; isAdmin: boolean }>('/conversations')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const messageAdmin = async () => {
    try {
      const r = await api<{ conversationId: number }>('/conversations/admin', { method: 'POST' });
      navigate('/messages/' + r.conversationId);
    } catch (err) {
      push('Could not reach the admin', (err as Error).message);
    }
  };

  const peerName = (c: Conversation) => (c.owner_id === user?.id ? c.other_name || c.other_email : c.owner_name || c.owner_email);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageHead title="Messages" lede="Your conversations about lost and found items." />
        {data && !data.isAdmin && (
          <Button variant="outline" onClick={messageAdmin} className="mb-6">
            <ShieldQuestion className="h-4 w-4" aria-hidden="true" />
            Message an admin
          </Button>
        )}
      </div>

      {error && <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>}
      {!data ? (
        <p className="py-12 text-center text-muted">Loading…</p>
      ) : data.conversations.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 text-center">
          <MessageSquarePlus className="mx-auto mb-3 h-8 w-8 text-muted" aria-hidden="true" />
          <p className="text-body">No conversations yet.</p>
          <p className="mt-1 text-sm text-muted">Open an item and contact the person who posted it.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
          {data.conversations.map((c) => (
            <li key={c.id}>
              <Link to={'/messages/' + c.id} className="flex items-center gap-3 p-4 no-underline hover:bg-sunken sm:p-5">
                <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-accent/30 font-bold text-bu">
                  {peerName(c).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-body">{peerName(c)}</p>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-bu-dark">{c.unread}</span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted">
                    {c.item_name ? `${c.item_name} · ` : ''}
                    {c.last_body || 'No messages yet'}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs text-muted">{c.last_at ? ago(c.last_at) : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
