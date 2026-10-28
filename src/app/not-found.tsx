import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonClass } from "@/components/ui";

// Unknown URLs, outside the operator shell (they may come from a public link).
export default function NotFound() {
  return (
    <div className="bg-canvas grid min-h-dvh place-items-center px-5 py-8">
      <main className="w-full max-w-[440px] text-center">
        <div className="flex justify-center">
          <Wordmark height={34} />
        </div>
        <section className="border-line bg-surface mt-8 rounded-[var(--radius-xl)] border p-6">
          <h1 className="text-[20px] leading-7 font-extrabold tracking-[-0.4px]">This page doesn&apos;t exist.</h1>
          <p className="text-ink-muted mt-2 text-[14px]">Check the address, or go back to your jobs.</p>
          <Link href="/jobs" className={`${buttonClass.secondary} mt-5`}>
            Go to Jobs
          </Link>
        </section>
      </main>
    </div>
  );
}
