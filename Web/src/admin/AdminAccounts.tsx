import { useState } from 'react';
import { Search } from 'lucide-react';
import { fmt } from '../lib/format';
import { darkInputClass } from '../components/ui';
import { useAdminData } from './data';

export function AdminAccounts() {
  const { data, error } = useAdminData();
  const [q, setQ] = useState('');

  if (error) {
    return <p className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>;
  }

  const needle = q.trim().toLowerCase();
  const users = (data?.users ?? []).filter(
    (u) => !needle || u.email.toLowerCase().includes(needle) || (u.full_name || '').toLowerCase().includes(needle),
  );

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Accounts</h1>
        <p className="mt-1 text-sm text-ink/45">Everyone with a FoundIT account, newest first.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/30" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search accounts"
          className={`${darkInputClass} pl-10`}
        />
      </div>

      {!data ? (
        <p className="py-12 text-center text-sm text-ink/45">Loading accounts…</p>
      ) : (
        <section className="admin-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-ink/35">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 font-semibold">Role</th>
                  <th className="px-3 py-3 font-semibold">Course</th>
                  <th className="px-3 py-3 font-semibold">Verified</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="max-w-[14rem] truncate px-5 py-3 font-medium text-ink/85">{u.full_name || '—'}</td>
                    <td className="max-w-[18rem] truncate px-3 py-3 text-ink/55">{u.email}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-white/10 text-ink/60'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-3 text-ink/50">{u.course || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs ${u.verified_at ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {u.verified_at ? 'Yes' : 'Pending'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-ink/35">{fmt(u.created_at)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink/40">
                      No accounts match that search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
