import { z } from "zod";

const dateOnly =
  /^\d{4}-\d{2}-\d{2}$/;

export const studentCreateSchema =
  z.object({
    admissionNumber: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .nullable(),
    branchId: z
      .string()
      .uuid()
      .optional()
      .nullable(),
    firstName: z
      .string()
      .trim()
      .min(1)
      .max(100),
    middleName: z
      .string()
      .trim()
      .max(100)
      .optional()
      .nullable(),
    lastName: z
      .string()
      .trim()
      .min(1)
      .max(100),
    preferredName: z
      .string()
      .trim()
      .max(100)
      .optional()
      .nullable(),
    dateOfBirth: z
      .string()
      .regex(dateOnly),
    sex: z.enum([
      "MALE",
      "FEMALE",
      "UNSPECIFIED",
    ]),
    admissionDate: z
      .string()
      .regex(dateOnly)
      .nullable()
      .optional(),
  });

export const studentUpdateSchema =
  z.object({
    firstName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),
    middleName: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .optional(),
    lastName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),
    preferredName: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .optional(),
    sex: z
      .enum([
        "MALE",
        "FEMALE",
        "UNSPECIFIED",
      ])
      .optional(),
    admissionDate: z
      .string()
      .regex(dateOnly)
      .nullable()
      .optional(),
    homeBranchId: z
      .string()
      .uuid()
      .nullable()
      .optional(),
    status: z
      .enum([
        "ACTIVE",
        "INACTIVE",
        "GRADUATED",
        "WITHDRAWN",
        "ARCHIVED",
      ])
      .optional(),
    exitDate: z
      .string()
      .regex(dateOnly)
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).length > 0,
    {
      message:
        "At least one student field is required.",
    },
  );

export const guardianCreateSchema =
  z.object({
    fullName: z
      .string()
      .trim()
      .min(1)
      .max(200),
    email: z
      .string()
      .trim()
      .email()
      .max(320)
      .optional()
      .nullable(),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .optional()
      .nullable(),
  })
  .refine(
    (value) =>
      Boolean(value.email) ||
      Boolean(value.phone),
    {
      message:
        "Guardian email or phone is required.",
    },
  );

export const guardianLinkSchema =
  z.object({
    guardianId: z
      .string()
      .uuid(),
    relationshipLabel: z
      .string()
      .trim()
      .min(1)
      .max(80),
    isPrimary: z
      .boolean()
      .default(false),
    isEmergencyContact: z
      .boolean()
      .default(false),
    pickupAuthorized: z
      .boolean()
      .default(false),
    receivesNotifications: z
      .boolean()
      .default(false),
  });

export const enrollmentCreateSchema =
  z.object({
    academicSessionId: z
      .string()
      .uuid(),
    classArmId: z
      .string()
      .uuid(),
    startsOn: z
      .string()
      .regex(dateOnly),
  });