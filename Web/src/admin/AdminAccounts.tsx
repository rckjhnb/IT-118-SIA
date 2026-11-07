import { useState } from 'react';
import { Search } from 'lucide-react';
import { fmt } from '../lib/format';
import { inputClass } from '../components/ui';
import { useAdminData } from './data';

export function AdminAccounts() {
  const { data, error } = useAdminData();
  const [q, setQ] = useState('');

  if (error) {
    return <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>;
  }

  const needle = q.trim().toLowerCase();
  const users = (data?.users ?? []).filter(
    (u) => !needle || u.email.toLowerCase().includes(needle) || (u.full_name || '').toLowerCase().includes(needle),
  );

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-heading sm:text-3xl">Accounts</h1>
        <p className="mt-1 text-sm text-muted">Everyone with a FoundIT account, newest first.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search accounts"
          className={`${inputClass} pl-10`}
        />
      </div>

      {!data ? (
        <p className="py-12 text-center text-sm text-muted">Loading accounts…</p>
      ) : (
        <section className="admin-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 font-semibold">Role</th>
                  <th className="px-3 py-3 font-semibold">Course</th>
                  <th className="px-3 py-3 font-semibold">Verified</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-sunken">
                    <td className="max-w-[14rem] truncate px-5 py-3 font-medium text-body">{u.full_name || '—'}</td>
                    <td className="max-w-[18rem] truncate px-3 py-3 text-body">{u.email}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'admin' ? 'bg-accent/20 text-bu' : 'bg-sunken text-body'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-3 text-muted">{u.course || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs ${u.verified_at ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {u.verified_at ? 'Yes' : 'Pending'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{fmt(u.created_at)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">
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
