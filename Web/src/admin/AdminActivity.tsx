import { useEffect, useRef, useState } from 'react';
import { api, type AuthEvent } from '../lib/api';
import { fmt } from '../lib/format';
import { useToast } from '../components/Toast';

export function AdminActivity() {
  const { push } = useToast();
  const [events, setEvents] = useState<AuthEvent[] | null>(null);
  const [error, setError] = useState('');
  const lastId = useRef(0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await api<{ events: AuthEvent[] }>('/admin/events?after=0');
        if (!alive) return;
        setEvents(r.events);
        lastId.current = r.events.reduce((max, e) => Math.max(max, e.id), 0);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };
    void load();

    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await api<{ events: AuthEvent[] }>('/admin/events?after=' + lastId.current);
        if (!alive || !r.events.length) return;
        lastId.current = Math.max(lastId.current, ...r.events.map((e) => e.id));
        setEvents((list) => [...r.events, ...(list ?? [])]);
        for (const ev of r.events.slice().reverse()) {
          push(
            ev.action === 'login' ? 'User logged in' : 'User logged out',
            ev.email + (ev.role === 'admin' ? ' (admin)' : ''),
          );
        }
      } catch {
        /* next tick retries */
      }
    }, 5000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [push]);

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-heading sm:text-3xl">Activity</h1>
        <p className="mt-1 text-sm text-muted">Every sign-in and sign-out, newest first. Updates live.</p>
      </div>

      {error && (
        <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>
      )}

      {!events ? (
        <p className="py-12 text-center text-sm text-muted">Loading activity…</p>
      ) : (
        <section className="admin-card overflow-hidden rounded-2xl">
          {events.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-5 py-3 font-semibold">When</th>
                    <th className="px-3 py-3 font-semibold">Account</th>
                    <th className="px-3 py-3 font-semibold">Role</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {events.map((ev) => (
                    <tr key={ev.id} className="transition-colors hover:bg-sunken">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{fmt(ev.created_at)}</td>
                      <td className="max-w-[20rem] truncate px-3 py-3 text-body">{ev.email}</td>
                      <td className="px-3 py-3 text-xs text-muted">{ev.role}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            ev.action === 'login'
                              ? 'bg-emerald-400/15 text-emerald-500'
                              : 'bg-sunken text-muted'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${ev.action === 'login' ? 'bg-emerald-400' : 'bg-muted/50'}`}
                            aria-hidden="true"
                          />
                          {ev.action === 'login' ? 'In' : 'Out'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
