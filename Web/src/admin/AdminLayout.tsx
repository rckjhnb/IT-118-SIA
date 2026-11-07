import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { api, type AuthEvent } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';

const items = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/posts', label: 'Posts', icon: FileText, end: false },
  { to: '/admin/accounts', label: 'Accounts', icon: Users, end: false },
  { to: '/admin/activity', label: 'Activity', icon: Activity, end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    isActive
      ? 'bg-white/12 font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
      : 'text-ink/55 hover:bg-white/[0.06] hover:text-ink'
  }`;

export function AdminLayout() {
  const { user, loading, refresh, setUser } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const lastEvent = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/admin/login', { replace: true });
    else if (user.role !== 'admin') navigate('/', { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    let alive = true;

    const seed = async () => {
      try {
        const r = await api<{ events: AuthEvent[] }>('/admin/events?after=0');
        if (alive) lastEvent.current = r.events.reduce((max, e) => Math.max(max, e.id), 0);
      } catch {
        if (alive) lastEvent.current = 0;
      }
    };
    void seed();

    const timer = setInterval(async () => {
      if (document.hidden || lastEvent.current === null) return;
      try {
        const r = await api<{ events: AuthEvent[] }>('/admin/events?after=' + lastEvent.current);
        if (!alive || !r.events.length) return;
        lastEvent.current = r.events.reduce((max, e) => Math.max(max, e.id), lastEvent.current ?? 0);
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
  }, [user, push]);

  const logout = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate('/admin/login');
  };

  if (loading || !user || user.role !== 'admin') {
    return (
      <div className="admin-shell grid min-h-dvh place-items-center">
        <p className="text-sm text-ink/50">Checking your session…</p>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className={`flex items-center gap-3 px-2 py-3 ${collapsed ? 'justify-center' : ''}`}>
        <img src="/logo-main.png" alt="" aria-hidden="true" className="h-12 w-12 flex-shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold leading-tight text-ink">FoundIT</p>
            <p className="truncate text-[11px] text-ink/40">Admin console</p>
          </div>
        )}
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1" aria-label="Admin">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setDrawer(false)} title={label}>
            <Icon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 pt-2">
        {!collapsed && (
          <p className="truncate px-3 pb-2 text-[11px] text-ink/40">{user.email}</p>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink/55 transition-colors hover:bg-white/[0.06] hover:text-ink"
          title="Log out"
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" aria-hidden="true" />
          {!collapsed && <span>Log out</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="mt-1 hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink/35 transition-colors hover:bg-white/[0.06] hover:text-ink/70 lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <>
              <ChevronsLeft className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-shell min-h-dvh">
      <div className="flex min-h-dvh">
        <aside className={`admin-chrome hidden flex-shrink-0 border-r border-white/10 transition-[width] lg:block ${collapsed ? 'w-[72px]' : 'w-64'}`}>
          {sidebar}
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <aside className="admin-chrome fade-up absolute inset-y-0 left-0 w-64 border-r border-white/10">
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="absolute right-3 top-4 rounded-lg p-2 text-ink/50 hover:bg-white/10 hover:text-ink"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="admin-chrome flex items-center gap-3 border-b border-white/10 px-4 py-3 lg:px-8">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="rounded-lg p-2 text-ink/60 hover:bg-white/10 hover:text-ink lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="text-sm text-ink/45">
              Welcome back, <span className="font-semibold text-ink/80">{user.full_name || 'Administrator'}</span>
            </p>
            <Link to="/" className="ml-auto text-xs text-ink/45 no-underline hover:text-ink">
              View public site
            </Link>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
