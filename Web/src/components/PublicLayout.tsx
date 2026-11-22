import { useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Moon, Plus, Sun, UserCircle } from 'lucide-react';
import { api } from '../lib/api';
import { displayName } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { useToast } from '../components/Toast';
import PillNav from '../components/PillNav';
import AnimatedContent from '../components/AnimatedContent';

function RouterLink({ href, ...rest }: { href?: string } & Omit<ComponentProps<typeof Link>, 'to'>) {
  return <Link to={href ?? '/'} {...rest} />;
}

const AUTH_PAGES = ['/welcome', '/login', '/signup'];

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user, unread, setUser } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { push } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuth = AUTH_PAGES.includes(pathname);
  const isWelcome = pathname === '/welcome';
  const isHome = pathname === '/' || pathname === '/browse';

  const logout = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setMenuOpen(false);
    push('Signed out', 'You have logged out of FoundIT.');
    navigate('/');
  };

  const activeHref = pathname.startsWith('/messages')
    ? '/messages'
    : pathname === '/about'
      ? '/about'
      : pathname === '/login'
        ? '/login'
        : pathname === '/signup'
          ? '/signup'
          : '/browse';

  const items = [
    { label: 'Browse', href: '/browse' },
    ...(user ? [{ label: `Messages${unread ? ` (${unread})` : ''}`, href: '/messages' }] : []),
    { label: 'About', href: '/about' },
  ];

  return (
    <div
      className={`relative flex min-h-screen flex-col overflow-x-clip ${isAuth && !isWelcome ? 'auth-shell' : ''} ${
        isHome ? 'home-shell' : ''
      }`}
    >
      <div className="relative z-10 flex min-h-screen flex-col">
        {!isAuth && (
        <header className="mx-auto w-[calc(100%-2.5rem)] max-w-[1640px] pb-1 pt-6 sm:w-[86%] sm:pt-7">
          <div className="flex w-full items-center gap-2 rounded-[22px] border border-line/70 bg-paper/70 p-2 shadow-[0_18px_40px_-26px_rgba(31,42,61,0.55)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2836]/90 dark:shadow-[0_22px_44px_-20px_rgba(0,0,0,0.8)]">
            <PillNav
              logo="/logo-main.png"
              logoAlt="FoundIT home"
              logoHref="/"
              items={items}
              activeHref={activeHref}
              linkComponent={RouterLink}
              theme={theme === 'dark' ? 'dark' : 'light'}
              layout="split"
              size="lg"
              surface="none"
              itemStyle="plain"
              indicator="dot"
              hoverEffect="none"
              collapse="auto"
              intro
              ariaLabel="Main navigation"
              className="min-w-0 flex-1"
              style={{ '--pn-mark': '32px', '--pn-gap': '24px', '--pn-x': '14px', '--pn-font': '15px' } as CSSProperties}
            />

            <div className="hidden flex-none items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-body transition hover:bg-sunken"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              </button>
              {user ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-body transition hover:bg-sunken"
                      aria-expanded={menuOpen}
                    >
                      <UserCircle className="h-4 w-4" aria-hidden="true" />
                      {displayName(user).split(' ')[0]}
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 z-50 mt-2 min-w-56 rounded-xl border border-line bg-paper p-2 shadow-xl">
                        <p className="truncate px-3 py-2 text-xs font-semibold text-muted">{user.email}</p>
                        <Link
                          to="/my-posts"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body hover:bg-sunken"
                        >
                          My posts
                        </Link>
                        {user.role === 'admin' && (
                          <Link
                            to="/admin"
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body hover:bg-sunken"
                          >
                            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                            Admin dashboard
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={logout}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-body hover:bg-sunken"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" />
                          Log out
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm font-bold no-underline transition ${
                      theme === 'dark' ? 'bg-heading text-[#141b26] hover:bg-paper' : 'bg-bu text-cream hover:bg-[#3f4f6a]'
                    }`}
                  >
                    Log in
                  </Link>
                  <Link to="/signup" className="rounded-full px-3 py-2 text-sm font-medium text-body no-underline transition hover:bg-sunken hover:text-heading">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-3 py-2 text-sm shadow-sm lg:hidden">
            {user ? (
              <>
                <Link to="/post/new" className="inline-flex items-center gap-1.5 font-semibold text-bu no-underline">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Post an item
                </Link>
                <div className="flex items-center gap-3 text-muted">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="grid h-8 w-8 place-items-center rounded-full border border-line text-body"
                  >
                    {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <Link to="/my-posts" className="text-body no-underline hover:text-bu">
                    My posts
                  </Link>
                  {user.role === 'admin' && (
                    <Link to="/admin" className="text-body no-underline hover:text-bu">
                      Admin
                    </Link>
                  )}
                  <button type="button" onClick={logout} className="text-bu hover:underline">
                    Log out
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-muted">New to FoundIT?</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="grid h-8 w-8 place-items-center rounded-full border border-line text-body"
                  >
                    {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <Link to="/login" className="text-bu no-underline hover:underline">
                    Log in
                  </Link>
                  <Link to="/signup" className="font-semibold text-bu no-underline hover:underline">
                    Sign up
                  </Link>
                </div>
              </>
            )}
          </div>
        </header>
        )}

        <main
          className={
            isWelcome
              ? 'mx-auto w-[calc(100%-2.5rem)] max-w-[1640px] flex-1 sm:w-[86%]'
              : 'mx-auto w-[calc(100%-2.5rem)] max-w-[1640px] flex-1 py-8 sm:w-[86%] sm:py-10'
          }
        >
          {children}
        </main>

        {!isAuth && (
        <footer>
          <AnimatedContent distance={24} duration={0.6} threshold={0.02} className="mx-auto flex w-[calc(100%-2.5rem)] max-w-[1640px] flex-col items-center justify-between gap-3 py-5 text-sm text-muted sm:w-[86%] sm:flex-row">
            <span className="inline-flex items-center gap-2">
              <img src="/logo-main.png" alt="" className="h-6 w-6" />
              FoundIT · Bicol University Lost &amp; Found
            </span>
            <div className="flex items-center gap-4">
              {user && (
                <>
                  <Link to="/post/new" className="text-bu hover:underline lg:hidden">
                    Post an item
                  </Link>
                </>
              )}
              <Link to="/about" className="text-bu hover:underline">
                About
              </Link>
            </div>
          </AnimatedContent>
        </footer>
        )}
      </div>
    </div>
  );
}
