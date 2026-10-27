import type { Role } from "@/generated/prisma/enums";

// Enum values stay Italian (data model); the UI speaks English.
export const roleLabel: Record<Role, string> = {
  MONTATORE: "Installer",
  ELETTRICISTA: "Electrician",
  RIGGER: "Rigger",
  AUTISTA: "Driver",
};

/** Token pair per role: design-system.md §02 role encoding. */
export const roleTokens: Record<Role, { fg: string; bg: string }> = {
  MONTATORE: { fg: "var(--role-installer)", bg: "var(--role-installer-bg)" },
  ELETTRICISTA: { fg: "var(--role-electrician)", bg: "var(--role-electrician-bg)" },
  RIGGER: { fg: "var(--role-rigger)", bg: "var(--role-rigger-bg)" },
  AUTISTA: { fg: "var(--role-driver)", bg: "var(--role-driver-bg)" },
};
