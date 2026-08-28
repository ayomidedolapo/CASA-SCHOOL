import { z } from "zod";

export const terminalProvisionSchema =
  z.object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120),
  });

export const terminalLifecycleSchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal("SUSPEND"),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .optional()
          .nullable(),
      }),
      z.object({
        action:
          z.literal("REACTIVATE"),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .optional()
          .nullable(),
      }),
      z.object({
        action:
          z.literal("REVOKE"),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(240),
      }),
      z.object({
        action:
          z.literal(
            "ROTATE_CREDENTIAL",
          ),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .optional()
          .nullable(),
      }),
    ],
  );

export const terminalScanSchema =
  z.object({
    requestId: z
      .string()
      .regex(
        /^[A-Za-z0-9_-]{8,64}$/,
      ),
    operation: z.enum([
      "CHECK_IN",
      "CHECK_OUT",
    ]),
    qrPayload: z
      .string()
      .min(10)
      .max(200),
  });