import Link from "next/link";
import { buttonClass, EmptyState } from "@/components/ui";

// notFound() from an operator page, e.g. a job id that doesn't exist: stays inside the shell.
export default function OperatorNotFound() {
  return (
    <div className="mt-6">
      <EmptyState
        title="Not found"
        action={
          <Link href="/jobs" className={buttonClass.secondary}>
            Back to Jobs
          </Link>
        }
      >
        This job or page doesn&apos;t exist, or it was removed.
      </EmptyState>
    </div>
  );
}
