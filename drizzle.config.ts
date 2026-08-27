import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: [
    "./src/db/schema/enums.ts",
    "./src/db/schema/schools.ts",
    "./src/db/schema/users.ts",
    "./src/db/schema/academic.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  ...(databaseUrl
    ? {
        dbCredentials: {
          url: databaseUrl,
        },
      }
    : {}),
});