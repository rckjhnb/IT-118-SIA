import { Link } from 'react-router-dom';
import { ArrowRight, LogIn } from 'lucide-react';
import AnimatedContent from '../components/AnimatedContent';

export function Welcome() {
  return (
    <section className="flex min-h-svh items-center py-14">
      <AnimatedContent
        distance={30}
        duration={0.75}
        threshold={0.01}
        className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-10"
      >
        <div className="text-left">
          <h1 className="text-4xl font-bold leading-tight text-heading sm:text-6xl">
            Lost something?
            <br />
            <span className="text-bu">Found something?</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
            Reunite students with their belongings. Post what you found, search what you lost, and message the person who
            has it.
          </p>

          <div className="mt-9 flex w-full max-w-sm flex-col items-stretch gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-7 py-3.5 text-sm font-bold text-bu-dark no-underline shadow-[0_14px_34px_-16px_rgba(244,114,30,0.7)] transition hover:bg-gold-light"
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

          <Link to="/browse" className="mt-5 inline-block text-sm font-semibold text-muted no-underline hover:text-bu hover:underline">
            Browse items without signing in
          </Link>

          <p className="mt-8 text-xs text-muted">Bicol University accounts only.</p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <img
            src="/logo-full.png"
            alt="FoundIT — Bicol University Lost and Found"
            className="h-auto w-full object-contain"
          />
        </div>
      </AnimatedContent>
    </section>
  );
}
