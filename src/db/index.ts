import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getDatabaseUrl } from "@/config/env";

function createDatabase() {
  const sql = neon(getDatabaseUrl());

  return drizzle({
    client: sql,
  });
}

export type CasaSchoolDatabase = ReturnType<
  typeof createDatabase
>;

let database: CasaSchoolDatabase | null = null;

export function getDb(): CasaSchoolDatabase {
  if (!database) {
    database = createDatabase();
  }

  return database;
}