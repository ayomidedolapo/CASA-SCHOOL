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
    "./src/db/schema/attendance-operations-enums.ts",
    "./src/db/schema/attendance-operations.ts",
    "./src/db/schema/card-production-enums.ts",
    "./src/db/schema/card-production.ts",
    "./src/db/schema/messaging-enums.ts",
    "./src/db/schema/school-messaging.ts",
    "./src/db/schema/biometric-enums.ts",
    "./src/db/schema/student-biometrics.ts",
    "./src/db/schema/passkey-enums.ts",
    "./src/db/schema/passkeys.ts",
    "./src/db/schema/biometric-profile-events.ts",
    "./src/db/schema/biometric-provider-sessions.ts",
    "./src/db/schema/academic.ts",
  
    "./src/db/schema/school-operations.ts",
    "./src/db/schema/teacher-assignments.ts",
    "./src/db/schema/attendance-readiness-enums.ts",
    "./src/db/schema/attendance-readiness.ts",
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