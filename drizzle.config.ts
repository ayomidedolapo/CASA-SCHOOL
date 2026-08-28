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
    "./src/db/schema/auth.ts",
    "./src/db/schema/auth-security.ts",
    "./src/db/schema/student-enums.ts",
    "./src/db/schema/students.ts",
    "./src/db/schema/guardians.ts",
    "./src/db/schema/enrollments.ts",
    "./src/db/schema/student-identity.ts",
    "./src/db/schema/attendance-enums.ts",
    "./src/db/schema/attendance.ts",
    "./src/db/schema/messaging-enums.ts",
    "./src/db/schema/school-messaging.ts",
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