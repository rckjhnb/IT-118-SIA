import { PageHead } from '../components/ui';

export function About() {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-paper p-6 sm:p-10">
      <img
        src="/logo-full.png"
        alt="FoundIT — Bicol University Lost and Found"
        className="mb-6 h-auto w-[min(70%,260px)] object-contain"
      />
      <PageHead title="About FoundIT" />
      <p className="text-body">
        FoundIT is the Bicol University campus lost and found. Students post items they lost or found, message each
        other, and mark items as returned.
      </p>
      <p className="mt-3 text-muted">
        Only enrolled students with a BU email can post. Every account is checked against the registrar roster, and an
        admin can resolve or remove posts.
      </p>
    </div>
  );
}
