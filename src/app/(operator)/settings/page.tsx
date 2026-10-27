import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Card, CardHeader, EmptyState, PageHeader, Pill, RoleTag, Skeleton } from "@/components/ui";
import { formatEUR, formatMinutes } from "@/lib/format";
import { getRoleRates, getSettings, paypalCredentialsConfigured } from "@/lib/queries";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "company", label: "Company" },
  { id: "rates", label: "Rates" },
  { id: "rules", label: "Rules" },
  { id: "paypal", label: "PayPal" },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Workspace / Settings" title="Settings" subtitle="How your team plans work and pays people." />
      <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] wide:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-1.5 overflow-x-auto lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-ink-secondary hover:bg-surface-hover hover:text-ink flex h-11 items-center rounded-[10px] px-4 text-[13px] font-bold whitespace-nowrap transition-colors duration-[var(--duration-fast)]"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <CompanyAndRules />
          </Suspense>
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <PaypalPanel />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function CompanyAndRules() {
  const [settings, rates] = await Promise.all([getSettings(), getRoleRates()]);

  if (!settings) {
    return (
      <EmptyState title="No company set up">
        Run the seed to create the company profile and pay rules: <span className="t-number text-ink">npm run db:seed</span>
      </EmptyState>
    );
  }

  return (
    <>
      <Panel id="company" title="Company" subtitle="Who appears on invitations and payouts.">
        <Row label="Company name">{settings.companyName}</Row>
        <Row label="Base">Milano, Italy</Row>
        <Row label="Currency" hint="Fixed for existing payout batches">
          <span className="t-number">EUR</span>
        </Row>
        <Row label="Time zone">
          <span className="t-number">Europe/Rome</span>
        </Row>
      </Panel>

      <Panel id="rates" title="Rates" subtitle="Individual rates are set per person in Crew. These are the current ranges.">
        {rates.length === 0 ? (
          <p className="text-ink-muted px-6 py-5 text-[14px]">No crew yet, so no rates.</p>
        ) : (
          rates.map((r) => (
            <Row key={r.role} label={<RoleTag role={r.role} />} hint={`${r.count} ${r.count === 1 ? "person" : "people"}`}>
              <span className="t-number">
                {r.min === r.max ? formatEUR(r.min) : `${formatEUR(r.min)} – ${formatEUR(r.max)}`}
                <span className="text-ink-muted">/h</span>
              </span>
            </Row>
          ))
        )}
      </Panel>

      <Panel id="rules" title="Rules" subtitle="Applied when the agent plans and when pay is calculated.">
        <Row label="Overtime" hint="per working day">
          After <span className="t-number">{formatMinutes(settings.overtimeAfterMinutes)}</span> paid
        </Row>
        <Row label="Overtime multiplier">
          <span className="t-number">{settings.overtimeMultiplier.toFixed(2)}×</span>
        </Row>
        <Row label="Minimum rest" hint="between working days">
          <span className="t-number">{settings.minRestHours}h</span>
        </Row>
        <Row label="Role match">Required · blocks conflicting assignments</Row>
        <p className="text-ink-muted border-line border-t px-6 py-4 text-[12px] leading-[18px]">
          These are planning rules for this workspace, not a legal or payroll compliance check. Requirements vary by contract and region.
        </p>
      </Panel>
    </>
  );
}

async function PaypalPanel() {
  const configured = await paypalCredentialsConfigured();
  return (
    <Panel id="paypal" title="PayPal" subtitle="Payouts go through the PayPal Sandbox only." aside={configured ? <Pill severity="success">Sandbox credentials set</Pill> : <Pill severity="error">Credentials missing</Pill>}>
      <Row label="Environment">
        <Pill severity="neutral">Sandbox</Pill>
      </Row>
      <Row label="API host">
        <span className="t-number">api-m.sandbox.paypal.com</span>
      </Row>
      <Row label="Payout approval">Operator confirms every batch</Row>
      <p className="text-ink-muted border-line border-t px-6 py-4 text-[12px] leading-[18px]">
        Sandbox uses simulated transactions. No real money moves. Credentials stay on the server and are never sent to the browser.
      </p>
    </Panel>
  );
}

function Panel({ id, title, subtitle, aside, children }: { id: string; title: string; subtitle: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader title={title} subtitle={subtitle} aside={aside} />
      <dl>{children}</dl>
    </Card>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="border-line flex min-h-[58px] items-center justify-between gap-6 border-b px-6 py-3 last:border-b-0">
      <dt className="text-ink-secondary text-[14px] font-semibold">
        {label}
        {hint && <span className="text-ink-muted ml-2 text-[12px] font-medium">{hint}</span>}
      </dt>
      <dd className="text-right text-[14px]">{children}</dd>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <Card aria-busy="true">
      <div className="border-line space-y-2 border-b px-6 py-[18px]">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-line flex h-[58px] items-center justify-between border-b px-6 last:border-b-0">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      ))}
    </Card>
  );
}
