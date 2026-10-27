"use client";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="border-line bg-bg-1 rounded-card mx-auto mt-16 max-w-lg border px-6 py-10 text-center">
      <p className="label text-err">Error</p>
      <h1 className="text-heading mt-3">This page could not load its data.</h1>
      <p className="text-text-2 mt-2 text-[14px]">
        Usually the database is unreachable or not migrated. Check <span className="num text-text">DATABASE_URL</span>, then retry.
      </p>
      {digest && <p className="num text-text-3 mt-4 text-[13px]">ref {digest}</p>}
      <button
        type="button"
        onClick={retry}
        className="bg-accent text-accent-ink mt-6 rounded-md px-4 py-2 text-[14px] font-semibold hover:brightness-110"
      >
        Retry
      </button>
    </div>
  );
}
