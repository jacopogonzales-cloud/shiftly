import type { PoolConfig } from "pg";

/**
 * node-postgres config. TLS with certificate check for public hosts (e.g. Render's external URL);
 * plain connections for localhost and for private hostnames without a dot (Render's internal URL, "dpg-…-a"),
 * which stay on the private network.
 */
export function pgConfig(connectionString: string | undefined): PoolConfig {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { hostname, searchParams } = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "::1"].includes(hostname) || searchParams.get("sslmode") === "disable";
  const privateNetwork = !hostname.includes(".") && !hostname.includes(":");
  return { connectionString, ssl: local || privateNetwork ? false : { rejectUnauthorized: true } };
}
