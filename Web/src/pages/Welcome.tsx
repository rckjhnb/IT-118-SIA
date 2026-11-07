import { Link } from 'react-router-dom';
import { ArrowRight, LogIn } from 'lucide-react';
import AnimatedContent from '../components/AnimatedContent';

export function Welcome() {
  return (
    <section className="flex min-h-svh flex-col items-center justify-center px-5 py-14 text-center">
      <AnimatedContent distance={30} duration={0.75} threshold={0.01} className="flex w-full flex-col items-center">
        <img
          src="/logo-full.png"
          alt="FoundIT — Bicol University Lost and Found"
          className="h-auto w-[min(88vw,460px)] object-contain"
        />

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.28em] text-gold">Bicol University Lost &amp; Found</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-heading sm:text-6xl">
          Lost something?
          <br />
          <span className="text-bu">Found something?</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
          Reunite students with their belongings. Post what you found, search what you lost, and message the person who
          has it.
        </p>

        <div className="mt-9 flex w-full max-w-sm flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-7 py-3.5 text-sm font-bold text-white no-underline shadow-[0_14px_34px_-16px_rgba(91,32,255,0.6)] transition hover:bg-gold-light"
          >
            Get Started
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-paper px-7 py-3.5 text-sm font-semibold text-heading no-underline shadow-sm transition hover:bg-sunken"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Log in
          </Link>
        </div>

        <Link to="/browse" className="mt-5 text-sm font-semibold text-muted no-underline hover:text-bu hover:underline">
          Browse items without signing in
        </Link>

        <p className="mt-6 text-xs text-muted/80">Verified Bicol University accounts only.</p>
      </AnimatedContent>
    </section>
  );
}
