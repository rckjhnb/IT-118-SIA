import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import { api, ApiError, type Message } from '../lib/api';
import { fmtShort } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';

interface Peer {
  email: string;
  full_name: string | null;
  course: string | null;
  year_level: number | null;
  block: string | null;
}

interface Conv {
  id: number;
  post_id: number | null;
  item_name: string | null;
  owner_id: number;
  other_id: number;
}

export function Thread() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState<{ conv: Conv; messages: Message[]; peer: Peer } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  useEffect(() => {
    setData(null);
    setMessages([]);
    lastId.current = 0;
    api<{ conv: Conv; messages: Message[]; peer: Peer }>('/conversations/' + id)
      .then((d) => {
        setData(d);
        setMessages(d.messages);
        lastId.current = d.messages.reduce((max, m) => Math.max(max, m.id), 0);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await api<{ messages: Message[]; deleted: number[] }>(`/conversations/${id}/feed?after=${lastId.current}`);
        if (r.deleted.length) {
          setMessages((list) =>
            list.map((m) =>
              r.deleted.includes(m.id) && !m.deleted_at ? { ...m, deleted_at: new Date().toISOString(), body: '' } : m,
            ),
          );
        }
        if (r.messages.length) {
          const fresh = r.messages.filter((m) => !r.deleted.includes(m.id) || !m.deleted_at);
          lastId.current = r.messages.reduce((max, m) => Math.max(max, m.id), lastId.current);
          setMessages((list) => {
            const ids = new Set(list.map((m) => m.id));
            return [...list, ...fresh.filter((m) => !ids.has(m.id))];
          });
        }
      } catch {
        /* retry on the next tick */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [data, id]);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api(`/conversations/${id}/messages`, { method: 'POST', body: { body } });
      setText('');
      const r = await api<{ messages: Message[]; deleted: number[] }>(`/conversations/${id}/feed?after=${lastId.current}`);
      if (r.messages.length) {
        lastId.current = r.messages.reduce((max, m) => Math.max(max, m.id), lastId.current);
        setMessages((list) => [...list, ...r.messages.filter((m) => !list.some((x) => x.id === m.id))]);
      }
    } catch (err) {
      push('Message not sent', (err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (message: Message) => {
    if (!confirm('Delete this message? Both of you will see "This message was deleted".')) return;
    try {
      await api(`/conversations/${id}/messages/${message.id}`, { method: 'DELETE' });
      setMessages((list) =>
        list.map((m) => (m.id === message.id ? { ...m, deleted_at: new Date().toISOString(), body: '' } : m)),
      );
      void refresh();
    } catch (err) {
      push('Could not delete the message', (err as ApiError).message);
    }
  };

  if (error) return <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>;
  if (!data) return <p className="py-16 text-center text-muted">Loading…</p>;

  const { conv, peer } = data;
  const me = user?.id;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/messages" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-bu no-underline hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All messages
      </Link>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
        <div className="border-b border-line p-5">
          <h1 className="text-xl font-semibold">{peer.full_name || peer.email}</h1>
          {peer.course && (
            <p className="text-sm text-muted">
              {peer.course} · Year {peer.year_level} · Block {peer.block}
            </p>
          )}
          <p className="text-sm text-muted">
            {conv.item_name ? (
              <>
                About{' '}
                <Link to={'/post/' + conv.post_id} className="text-bu hover:underline">
                  {conv.item_name}
                </Link>
              </>
            ) : (
              'Direct message'
            )}
          </p>
        </div>

        <div ref={boxRef} className="thread-scroll flex h-[min(60dvh,540px)] flex-col gap-3 overflow-y-auto bg-sunken p-4 sm:p-6">
          {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Say hello to start the conversation.</p>}
          {messages.map((m) => {
            const mine = m.sender_id === me;
            const canDelete = !m.deleted_at && (mine || user?.role === 'admin');
            return (
              <div
                key={m.id}
                className={`max-w-[min(86%,34rem)] rounded-2xl px-4 py-2.5 ${
                  mine ? 'self-end bg-[#5b20ff] text-white' : 'self-start border border-line bg-paper text-heading'
                }`}
              >
                <p className={`whitespace-pre-wrap text-[15px] ${m.deleted_at ? (mine ? 'italic text-white/70' : 'italic text-muted') : ''}`}>
                  {m.deleted_at ? 'This message was deleted' : m.body}
                </p>
                <div className={`mt-1 flex items-center gap-2 text-xs ${mine ? 'text-white/75' : 'text-muted'}`}>
                  <span>
                    {mine ? 'You' : m.full_name || 'Student'} · {fmtShort(m.created_at)}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      title="Delete message"
                      aria-label="Delete message"
                      className={`rounded p-0.5 ${mine ? 'hover:text-white' : 'hover:text-[#912018]'}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={send} className="flex flex-col gap-3 border-t border-line bg-paper p-3 sm:flex-row sm:items-end sm:p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Write a message…"
            aria-label="Message"
            className="w-full resize-none rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-heading placeholder:text-muted/70 focus:border-bu focus:outline-none focus:ring-4 focus:ring-bu/15"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-bu px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-light disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
