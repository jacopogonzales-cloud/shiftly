import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui";
import { NewJobForm } from "./new-job-form";

export const metadata: Metadata = { title: "New job" };

export default function NewJobPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Jobs", href: "/jobs" }, { label: "New job" }]} />
      <header className="mt-3 mb-6">
        <h1 className="t-h1">Tell Shiftly about the job</h1>
        <p className="text-ink-muted mt-1.5 text-[14px]">Write it like you would send it to your crew.</p>
      </header>
      <NewJobForm />
    </>
  );
}
