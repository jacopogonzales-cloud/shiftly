import { initials } from "@/lib/format";
import { getCompanyName } from "@/lib/queries";

/** Rail footer: company avatar, name, base and environment. */
export async function CompanyBadge() {
  const name = (await getCompanyName()) ?? "Company unavailable";
  return <CompanyBadgeView name={name} />;
}

export function CompanyBadgeView({ name, loading = false }: { name: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-3 md:justify-center wide:justify-start" title={name}>
      <div className="border-line bg-surface-pressed grid size-[38px] shrink-0 place-items-center rounded-[12px] border text-[11px] font-extrabold">
        {loading ? "" : initials(name)}
      </div>
      <div className="min-w-0 md:sr-only wide:not-sr-only">
        {loading ? <div className="skeleton h-3 w-28" /> : <p className="text-[11px] leading-[15px] font-extrabold">{name}</p>}
        <p className="text-ink-muted text-[10px] leading-5">Milano · Sandbox</p>
      </div>
    </div>
  );
}
