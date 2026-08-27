import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL is required.")
  .refine(
    (value) =>
      value.startsWith("postgresql://") ||
      value.startsWith("postgres://"),
    "DATABASE_URL must be a PostgreSQL connection string.",
  );

export function getDatabaseUrl(): string {
  const result = databaseUrlSchema.safeParse(
    process.env.DATABASE_URL,
  );

  if (!result.success) {
    throw new Error(
      "CASA School database configuration is unavailable. Set DATABASE_URL in the runtime environment.",
    );
  }

  return result.data;
}