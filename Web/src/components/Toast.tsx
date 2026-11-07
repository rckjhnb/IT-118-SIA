import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
}

const ToastContext = createContext<{ push: (title: string, body?: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((title: string, body?: string) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, title, body }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="fade-up flex items-start gap-3 rounded-2xl border border-line bg-paper p-4 shadow-xl"
          >
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-body">{t.title}</p>
              {t.body && <p className="mt-0.5 text-muted">{t.body}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
              className="rounded-lg p-1 text-muted hover:bg-sunken hover:text-heading"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
