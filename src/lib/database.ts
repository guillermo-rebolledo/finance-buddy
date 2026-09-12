import "server-only";
import { Pool } from "pg";
import { getConfig } from "./config";

let pool: Pool;
// One pool serves every data module, opened on the first query a request makes.
export function database() {
  const config = getConfig();
  if (!config) throw new Error("Workspace unavailable");
  return (pool ??= new Pool({
    connectionString: config.databaseURL,
    max: 5,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  }));
}
