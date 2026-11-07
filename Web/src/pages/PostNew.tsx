import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, PageHead, inputClass } from '../components/ui';

export function PostNew() {
  const { config } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const r = await api<{ id: number }>('/posts', { method: 'POST', form });
      push('Post published', 'The admin has been notified.');
      navigate('/post/' + r.id);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Post an item" lede="Describe what you lost or found. The admin is notified automatically." />
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-line bg-paper p-5 sm:p-8">
        {error && <Alert>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Post type">
          {(['lost', 'found'] as const).map((t) => (
            <label
              key={t}
              className="cursor-pointer rounded-xl border border-line px-4 py-3 text-center text-sm font-semibold text-body transition has-[:checked]:border-gold has-[:checked]:bg-gold has-[:checked]:text-bu-dark"
            >
              <input type="radio" name="type" value={t} defaultChecked={t === 'lost'} className="sr-only" />
              {t === 'lost' ? 'I lost something' : 'I found something'}
            </label>
          ))}
        </div>

        <Field label="Item name" htmlFor="item_name">
          <input id="item_name" name="item_name" required maxLength={120} placeholder="Black umbrella" className={inputClass} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <select id="category" name="category" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Choose a category
              </option>
              {config.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Campus location" htmlFor="location">
            <select id="location" name="location" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Choose a location
              </option>
              {config.locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="When did it happen?" htmlFor="occurred_at">
          <input id="occurred_at" name="occurred_at" type="datetime-local" defaultValue={now} max={now} required className={inputClass} />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={5}
            required
            maxLength={2000}
            placeholder="Color, brand, marks, what was inside…"
            className={inputClass}
          />
        </Field>

        <Field label="Photo (optional)" htmlFor="photo" hint="JPG, PNG or WEBP, up to 5 MB.">
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} />
        </Field>

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? 'Publishing…' : 'Publish post'}
        </Button>
      </form>
    </div>
  );
}
