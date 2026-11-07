import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { fmtShort } from '../lib/format';
import { useAdminData } from './data';

export function AdminPosts() {
  const { data, error, reload } = useAdminData();
  const { push } = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (id: number, kind: 'resolve' | 'remove') => {
    if (kind === 'remove' && !confirm('Remove post #' + id + ' permanently?')) return;
    setBusy(id);
    try {
      await api(`/admin/posts/${id}/${kind}`, { method: 'POST' });
      push(kind === 'remove' ? 'Post removed' : 'Post resolved', 'Post #' + id + (kind === 'remove' ? ' deleted.' : ' marked returned.'));
      await reload();
    } catch (err) {
      push('Action failed', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>;
  }
  if (!data) return <p className="py-16 text-center text-sm text-muted">Loading posts…</p>;

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-heading sm:text-3xl">Posts</h1>
        <p className="mt-1 text-sm text-muted">The 20 most recent reports. Resolve returned items or remove spam.</p>
      </div>

      <section className="admin-card overflow-hidden rounded-2xl">
        {data.recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No posts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Posted by</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recent.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-sunken">
                    <td className="max-w-[18rem] truncate px-5 py-3">
                      <Link to={'/post/' + p.id} className="font-medium text-body no-underline hover:text-bu">
                        {p.item_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${
                          p.type === 'lost' ? 'bg-[#b3261e]' : 'bg-[#1f6b4a]'
                        }`}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-3 text-body">{p.full_name || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs ${p.status === 'resolved' ? 'text-emerald-500' : 'text-muted'}`}>
                        {p.status === 'resolved' ? 'Returned' : 'Open'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{fmtShort(p.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {p.status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => act(p.id, 'resolve')}
                            disabled={busy === p.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-body hover:bg-sunken disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Resolve
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => act(p.id, 'remove')}
                          disabled={busy === p.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#f5c2c0] bg-[#fee4e2] px-2.5 py-1.5 text-xs text-[#912018] hover:bg-[#fdd6d4] disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
