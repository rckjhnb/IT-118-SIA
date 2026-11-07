import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Plus, Search } from 'lucide-react';
import { api, type Post } from '../lib/api';
import { ago } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { inputClass } from '../components/ui';
import AnimatedContent from '../components/AnimatedContent';
import GlideSelect from '../components/GlideSelect';

const selectClass = 'w-full [&>button]:w-full';
const selectLook = {
  surfaceColor: '#ffffff',
  highlightColor: '#f5f2fc',
  accentColor: '#5b20ff',
  textColor: '#1f1f28',
  size: 'lg' as const,
  menuWidth: 190,
};
const selectLookDark = {
  surfaceColor: '#191527',
  highlightColor: '#241e3a',
  accentColor: '#a78bfa',
  textColor: '#f5f2ff',
  size: 'lg' as const,
  menuWidth: 190,
};

function TypeBadge({ type }: { type: Post['type'] }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
        type === 'lost' ? 'bg-[#fee4e2] text-[#912018]' : 'bg-[#d1fadf] text-[#05603a]'
      }`}
    >
      {type === 'lost' ? 'Lost' : 'Found'}
    </span>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <Link
      to={`/post/${post.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper no-underline transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative aspect-[4/3] bg-sunken">
        {post.image ? (
          <img src={`/uploads/${post.image}`} alt={post.item_name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">No photo</div>
        )}
        <div className="absolute left-3 top-3">
          <TypeBadge type={post.type} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="truncate text-lg font-semibold text-body">{post.item_name}</h2>
        <p className="line-clamp-2 text-sm text-muted">{post.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {post.location}
          </span>
          <span className="flex-shrink-0">{ago(post.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}

export function Home() {
  const { user, config } = useAuth();
  const { theme } = useTheme();
  const look = theme === 'dark' ? selectLookDark : selectLook;
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const q = params.get('q') ?? '';
  const type = params.get('type') ?? 'all';
  const category = params.get('category') ?? '';
  const location = params.get('location') ?? '';
  const status = params.get('status') ?? 'open';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (type && type !== 'all') query.set('type', type);
    if (category) query.set('category', category);
    if (location) query.set('location', location);
    if (status) query.set('status', status);
    api<{ posts: Post[] }>('/posts?' + query)
      .then((d) => {
        if (alive) setPosts(d.posts);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [q, type, category, location, status]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <div>
      <AnimatedContent distance={36} duration={0.7} threshold={0.05}>
        <section className="mb-8 overflow-hidden rounded-3xl bg-orchid-deep px-5 py-8 text-white shadow-[0_18px_44px_-22px_rgba(91,32,255,0.65)] sm:px-10 sm:py-12">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-5xl">Lost something on campus? Found something?</h1>
          <p className="mt-3 max-w-xl text-white/80">
            Browse items reported around Bicol University, or post your own so the owner can find it.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={user ? '/post/new' : '/login?next=/post/new'}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#5b20ff] no-underline shadow-sm transition hover:bg-accent/40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Post an item
            </Link>
            <a
              href="#browse"
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-5 py-3 text-sm font-semibold text-white no-underline hover:bg-white/15"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </a>
          </div>
        </section>
      </AnimatedContent>

      <AnimatedContent distance={28} duration={0.65} threshold={0.05}>
        <section id="browse" className="mb-6 rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get('q') || '');
              update('q', value);
            }}
          >
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                name="q"
                defaultValue={q}
                key={q}
                placeholder="Search items"
                className={`${inputClass} pl-10`}
                aria-label="Search items"
              />
            </div>
            <GlideSelect
              {...look}
              className={selectClass}
              ariaLabel="Type"
              value={type}
              onChange={(v) => update('type', v === 'all' ? '' : v)}
              options={[
                { value: 'all', label: 'Lost & found' },
                { value: 'lost', label: 'Lost' },
                { value: 'found', label: 'Found' },
              ]}
            />
            <GlideSelect
              {...look}
              className={selectClass}
              ariaLabel="Category"
              placeholder="All categories"
              value={category}
              onChange={(v) => update('category', v)}
              options={[{ value: '', label: 'All categories' }, ...config.categories.map((c) => ({ value: c, label: c }))]}
            />
            <GlideSelect
              {...look}
              className={selectClass}
              ariaLabel="Location"
              placeholder="All locations"
              value={location}
              onChange={(v) => update('location', v)}
              options={[{ value: '', label: 'All locations' }, ...config.locations.map((l) => ({ value: l, label: l }))]}
            />
            <GlideSelect
              {...look}
              className={selectClass}
              ariaLabel="Status"
              value={status}
              onChange={(v) => update('status', v)}
              options={[
                { value: 'open', label: 'Open only' },
                { value: 'all', label: 'All statuses' },
              ]}
            />
          </form>
        </section>
      </AnimatedContent>

      {error && <p className="mb-4 rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>}
      {loading ? (
        <p className="py-16 text-center text-muted">Loading items…</p>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper px-6 py-16 text-center">
          <p className="text-lg font-semibold text-body">No items match those filters.</p>
          <p className="mt-1 text-muted">Try clearing the search or choosing another category.</p>
        </div>
      ) : (
        <AnimatedContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" distance={44} duration={0.7} stagger={0.07} threshold={0.05}>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </AnimatedContent>
      )}
    </div>
  );
}
