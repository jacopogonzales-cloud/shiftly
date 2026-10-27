import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { getSettings } from "@/lib/queries";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings">
        <span className="label">Read-only</span>
      </PageHeader>
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="skeleton h-[220px] rounded-card" />
            <div className="skeleton h-[220px] rounded-card" />
          </div>
        }
      >
        <SettingsPanels />
      </Suspense>
    </>
  );
}

async function SettingsPanels() {
  const settings = await getSettings();

  if (!settings) {
    return (
      <EmptyState
        title="No company set up"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 20V8l8-4 8 4v12M9 20v-5h6v5" />
          </svg>
        }
      >
        Run the seed to create the company profile and pay rules: <span className="num text-text">npm run db:seed</span>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Company">
        <Row label="Name">{settings.companyName}</Row>
        <Row label="Time zone">
          <span className="num">Europe/Rome</span>
        </Row>
        <Row label="Currency">
          <span className="num">EUR</span>
        </Row>
      </Panel>

      <Panel title="Pay and rest rules">
        <Row label="Overtime after" hint="per shift">
          <span className="num">{formatMinutes(settings.overtimeAfterMinutes)}</span>
        </Row>
        <Row label="Overtime rate">
          <span className="num">×{settings.overtimeMultiplier.toFixed(2)}</span>
        </Row>
        <Row label="Minimum rest" hint="between two shifts">
          <span className="num">{settings.minRestHours}h</span>
        </Row>
      </Panel>

      <Panel title="PayPal">
        <Row label="Environment">
          <span className="num text-info">Sandbox</span>
        </Row>
        <Row label="API host">
          <span className="num text-[13px]">api-m.sandbox.paypal.com</span>
        </Row>
        <Row label="Payout approval">Operator confirms every batch</Row>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="border-line text-heading border-b px-5 py-4">{title}</h2>
      <dl className="divide-line divide-y">{children}</dl>
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-3.5">
      <dt className="text-text-2 text-[14px]">
        {label}
        {hint && <span className="text-text-3 ml-2 text-[13px]">{hint}</span>}
      </dt>
      <dd className="text-right text-[14px]">{children}</dd>
    </div>
  );
}
