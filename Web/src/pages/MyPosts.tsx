import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Post } from '../lib/api';
import { fmt } from '../lib/format';
import { PageHead } from '../components/ui';

export function MyPosts() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ posts: Post[] }>('/my-posts')
      .then((d) => setPosts(d.posts))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead title="My posts" lede="Everything you have reported, open and returned." />
      {error && <p className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">{error}</p>}
      {!posts ? (
        <p className="py-12 text-center text-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 text-center">
          <p className="text-body">You have not posted anything yet.</p>
          <Link to="/post/new" className="mt-3 inline-block font-semibold text-bu hover:underline">
            Post your first item
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
          {posts.map((p) => (
            <li key={p.id}>
              <Link to={'/post/' + p.id} className="flex flex-wrap items-center gap-3 p-4 no-underline hover:bg-sunken sm:p-5">
                {p.image ? (
                  <img src={'/uploads/' + p.image} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-xl bg-sunken text-xs text-muted">No photo</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-body">{p.item_name}</p>
                  <p className="text-sm text-muted">
                    {p.type === 'lost' ? 'Lost' : 'Found'} · {p.location} · {fmt(p.created_at)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    p.status === 'resolved' ? 'bg-[#d1fadf] text-[#05603a]' : 'bg-sunken text-muted'
                  }`}
                >
                  {p.status === 'resolved' ? 'Returned' : 'Open'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
