import assert from "node:assert/strict";
import { test } from "node:test";
import { pgConfig } from "./pg-config";

test("TLS with certificate check for public hosts, plain for localhost and private hostnames", () => {
  assert.deepEqual(pgConfig("postgresql://u:p@dpg-abc123-a.frankfurt-postgres.render.com/db").ssl, { rejectUnauthorized: true });
  assert.equal(pgConfig("postgresql://u:p@dpg-abc123-a/db").ssl, false);
  assert.equal(pgConfig("postgresql://u:p@localhost:5432/db").ssl, false);
  assert.equal(pgConfig("postgresql://u:p@db.example.com/db?sslmode=disable").ssl, false);
  assert.throws(() => pgConfig(undefined), /DATABASE_URL/);
});
