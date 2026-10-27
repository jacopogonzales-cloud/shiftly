import type { PoolConfig } from "pg";

/** node-postgres config: TLS (with certificate check) for any non-local host, e.g. Render Postgres. */
export function pgConfig(connectionString: string | undefined): PoolConfig {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { hostname, searchParams } = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "::1"].includes(hostname) || searchParams.get("sslmode") === "disable";
  return { connectionString, ssl: local ? false : { rejectUnauthorized: true } };
}
