import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import { ToastProvider } from './components/Toast';
import { PublicLayout } from './components/PublicLayout';
import { Home } from './pages/Home';
import { Welcome } from './pages/Welcome';
import { PostDetail } from './pages/PostDetail';
import { PostNew } from './pages/PostNew';
import { MyPosts } from './pages/MyPosts';
import { Messages } from './pages/Messages';
import { Thread } from './pages/Thread';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Verify } from './pages/Verify';
import { Forgot } from './pages/Forgot';
import { Reset } from './pages/Reset';
import { About } from './pages/About';
import { Outbox } from './pages/Outbox';
import { NotFound } from './pages/NotFound';
import { AdminLogin } from './admin/AdminLogin';
import { AdminLayout } from './admin/AdminLayout';
import { Dashboard } from './admin/Dashboard';
import { AdminPosts } from './admin/AdminPosts';
import { AdminAccounts } from './admin/AdminAccounts';
import { AdminActivity } from './admin/AdminActivity';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="py-16 text-center text-muted">Loading…</p>;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(location.pathname)} replace />;
  return <>{children}</>;
}

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <p className="py-16 text-center text-muted">Loading…</p>;
  return user ? <Home /> : <Navigate to="/welcome" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
        <ToastProvider>
          <ScrollToTop />
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="posts" element={<AdminPosts />} />
              <Route path="accounts" element={<AdminAccounts />} />
              <Route path="activity" element={<AdminActivity />} />
            </Route>

            <Route
              path="*"
              element={
                <PublicLayout>
                  <Routes>
                    <Route path="/welcome" element={<Welcome />} />
                    <Route path="/" element={<Landing />} />
                    <Route path="/browse" element={<Home />} />
                    <Route path="/post/:id" element={<PostDetail />} />
                    <Route
                      path="/post/new"
                      element={
                        <RequireAuth>
                          <PostNew />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/my-posts"
                      element={
                        <RequireAuth>
                          <MyPosts />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/messages"
                      element={
                        <RequireAuth>
                          <Messages />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/messages/:id"
                      element={
                        <RequireAuth>
                          <Thread />
                        </RequireAuth>
                      }
                    />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/verify" element={<Verify />} />
                    <Route path="/forgot" element={<Forgot />} />
                    <Route path="/reset" element={<Reset />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/outbox" element={<Outbox />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </PublicLayout>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
