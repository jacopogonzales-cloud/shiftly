import { getSettings } from "@/lib/queries";

export async function CompanyName() {
  const settings = await getSettings();
  return <p className="mt-1 truncate text-[14px] font-medium">{settings?.companyName ?? "No company set"}</p>;
}
