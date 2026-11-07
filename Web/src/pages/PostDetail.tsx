import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageSquare, MapPin } from 'lucide-react';
import { api, ApiError, type Post } from '../lib/api';
import { fmt } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui';

interface Detail {
  post: Post;
  conversations: { id: number; name: string; message_count: number }[];
  isOwner: boolean;
  canContact: boolean;
  canResolve: boolean;
}

export function PostDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError('');
    api<Detail>('/posts/' + id)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const contact = async () => {
    if (!user) return navigate('/login?next=/post/' + id);
    setBusy(true);
    try {
      const r = await api<{ conversationId: number }>(`/posts/${id}/contact`, { method: 'POST' });
      navigate('/messages/' + r.conversationId);
    } catch (err) {
      push('Could not start the conversation', (err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    setBusy(true);
    try {
      await api(`/posts/${id}/resolve`, { method: 'POST' });
      push('Marked as resolved', 'This item is now closed.');
      load();
    } catch (err) {
      push('Could not close the post', (err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>;
  if (!data) return <p className="py-16 text-center text-muted">Loading…</p>;

  const { post, conversations, isOwner, canContact, canResolve } = data;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/browse" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-bu no-underline hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to browse
      </Link>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        {post.image && <img src={`/uploads/${post.image}`} alt={post.item_name} className="max-h-[420px] w-full object-cover" />}
        <div className="p-5 sm:p-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                post.type === 'lost' ? 'bg-[#fee4e2] text-[#912018]' : 'bg-[#d1fadf] text-[#05603a]'
              }`}
            >
              {post.type === 'lost' ? 'Lost' : 'Found'}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                post.status === 'resolved' ? 'border-[#a7e8bf] bg-[#d1fadf] text-[#05603a]' : 'border-line text-muted'
              }`}
            >
              {post.status === 'resolved' ? 'Returned' : 'Open'}
            </span>
          </div>

          <h1 className="text-3xl font-bold text-heading sm:text-4xl">{post.item_name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {post.location}
            </span>
            <span>{post.category}</span>
            <span>Reported {fmt(post.created_at)}</span>
          </p>

          <p className="mt-5 whitespace-pre-wrap text-body">{post.description}</p>

          <div className="mt-7 flex flex-wrap gap-3 border-t border-line pt-5">
            {canContact && (
              <Button onClick={contact} disabled={busy}>
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                {post.type === 'found' ? 'I found this' : 'I can help'}
              </Button>
            )}
            {canResolve && post.status !== 'resolved' && (
              <Button variant="outline" onClick={resolve} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Mark as returned
              </Button>
            )}
          </div>
        </div>
      </div>

      {isOwner && conversations.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-paper p-5">
          <h2 className="mb-3 text-lg font-semibold">People who contacted you</h2>
          <ul className="divide-y divide-line">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  to={'/messages/' + c.id}
                  className="flex items-center justify-between gap-3 py-3 text-body no-underline hover:bg-sunken"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm text-muted">{c.message_count} message(s)</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
