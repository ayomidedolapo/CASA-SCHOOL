import { z } from "zod";

export const studentCardDeactivateSchema =
  z.object({
    status: z.enum([
      "LOST",
      "REVOKED",
      "EXPIRED",
    ]),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .optional()
      .nullable(),
  });

export const studentCardReplaceSchema =
  z.object({
    reason: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .optional()
      .nullable(),
  });