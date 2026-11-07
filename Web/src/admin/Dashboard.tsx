import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageSquare, ShieldAlert } from 'lucide-react';
import { ago, fmtShort } from '../lib/format';
import { useAdminData } from './data';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="admin-card rounded-2xl p-4">
      <p className="font-display text-3xl font-semibold text-heading">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

export function Dashboard() {
  const { data, error } = useAdminData();

  if (error) {
    return <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>;
  }
  if (!data) return <p className="py-16 text-center text-sm text-muted">Loading dashboard…</p>;

  const s = data.stats;

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-heading sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Moderate posts, watch sign-ins, and keep the campus board healthy.</p>
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
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <ShieldAlert className="h-4 w-4 text-bu" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-heading">New since your last visit</h2>
            <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-body">
              {data.newPosts.length}
            </span>
          </div>
          {data.newPosts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Nothing new.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.newPosts.map((p) => (
                <li key={p.id}>
                  <Link
                    to={'/post/' + p.id}
                    className="flex items-center gap-3 px-5 py-3 no-underline transition-colors hover:bg-sunken"
                  >
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${
                        p.type === 'lost' ? 'bg-[#b3261e]' : 'bg-[#1f6b4a]'
                      }`}
                    >
                      {p.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-body">{p.item_name}</span>
                    <span className="flex-shrink-0 text-xs text-muted">{ago(p.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card rounded-2xl">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <MessageSquare className="h-4 w-4 text-bu" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-heading">Recent sign-ins</h2>
            <Link to="/admin/activity" className="ml-auto inline-flex items-center gap-1 text-xs text-muted no-underline hover:text-heading">
              All activity
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {data.events.slice(0, 8).map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${ev.action === 'login' ? 'bg-emerald-400' : 'bg-muted/50'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-body">{ev.email}</span>
                <span className="flex-shrink-0 text-xs text-muted">
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
