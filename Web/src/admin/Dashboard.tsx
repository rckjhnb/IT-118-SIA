import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageSquare, ShieldAlert } from 'lucide-react';
import { ago, fmtShort } from '../lib/format';
import { useAdminData } from './data';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="admin-card rounded-2xl p-4">
      <p className="font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink/45">{label}</p>
    </div>
  );
}

export function Dashboard() {
  const { data, error } = useAdminData();

  if (error) {
    return <p className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>;
  }
  if (!data) return <p className="py-16 text-center text-sm text-ink/45">Loading dashboard…</p>;

  const s = data.stats;

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-ink/45">Moderate posts, watch sign-ins, and keep the campus board healthy.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Stat value={s.posts} label="Posts" />
        <Stat value={s.open_lost} label="Open lost" />
        <Stat value={s.open_found} label="Open found" />
        <Stat value={s.resolved} label="Returned" />
        <Stat value={s.users} label="Students" />
        <Stat value={s.pending} label="Unverified" />
        <Stat value={s.unread_messages} label="Unread messages" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="admin-card rounded-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
            <ShieldAlert className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">New since your last visit</h2>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-ink/60">
              {data.newPosts.length}
            </span>
          </div>
          {data.newPosts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink/40">Nothing new.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {data.newPosts.map((p) => (
                <li key={p.id}>
                  <Link
                    to={'/post/' + p.id}
                    className="flex items-center gap-3 px-5 py-3 no-underline transition-colors hover:bg-white/[0.04]"
                  >
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${
                        p.type === 'lost' ? 'bg-[#b3261e]' : 'bg-[#1f6b4a]'
                      }`}
                    >
                      {p.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink/85">{p.item_name}</span>
                    <span className="flex-shrink-0 text-xs text-ink/35">{ago(p.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card rounded-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
            <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Recent sign-ins</h2>
            <Link to="/admin/activity" className="ml-auto inline-flex items-center gap-1 text-xs text-ink/45 no-underline hover:text-ink">
              All activity
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {data.events.slice(0, 8).map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${ev.action === 'login' ? 'bg-emerald-400' : 'bg-white/25'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink/75">{ev.email}</span>
                <span className="flex-shrink-0 text-xs text-ink/35">
                  {ev.action} · {fmtShort(ev.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
