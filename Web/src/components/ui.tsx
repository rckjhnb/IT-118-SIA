import type { ButtonHTMLAttributes, ReactNode } from 'react';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-[#5b20ff] text-white hover:bg-[#7a46ff] shadow-[0_12px_28px_-14px_rgba(91,32,255,0.55)]',
  gold: 'bg-[#5b20ff] text-white hover:bg-[#7a46ff]',
  outline: 'border border-line bg-paper text-body hover:border-bu/40 hover:text-bu',
  ghost: 'text-muted hover:bg-sunken hover:text-heading',
  danger: 'border border-[#f5c2c0] bg-[#fee4e2] text-[#912018] hover:bg-[#fdd6d4]',
  light: 'bg-white text-bu hover:bg-accent/30',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-[#f5c2c0] bg-[#fee4e2] px-4 py-3 text-sm text-[#912018]">
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-body/80">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm text-heading placeholder:text-muted/70 focus:border-bu focus:outline-none focus:ring-4 focus:ring-bu/15';

export const darkInputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink placeholder:text-ink/35 focus:border-white/30 focus:outline-none [color-scheme:dark]';

export function PageHead({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-heading sm:text-4xl">{title}</h1>
      {lede && <p className="mt-2 max-w-2xl text-muted">{lede}</p>}
    </div>
  );
}

export function BrandMark({ className = 'h-10 w-10' }: { className?: string }) {
  return <img src="/logo-main.png" alt="" aria-hidden="true" className={`flex-shrink-0 object-contain ${className}`} />;
}
