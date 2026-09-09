import { z } from "zod";

export const cardTextSourceSchema =
  z.enum([
    "SCHOOL_NAME",
    "STUDENT_NAME",
    "SEX",
    "CLASS",
    "ACADEMIC_SESSION",
  ]);

const normalized =
  z.number()
    .min(0)
    .max(1);

const color =
  z.string()
    .regex(
      /^#[0-9A-Fa-f]{6}$/,
    );

const textItemSchema =
  z.object({
    source:
      cardTextSourceSchema,
    x:
      normalized,
    y:
      normalized,
    fontSize:
      z.number()
        .min(0.008)
        .max(0.25),
    color:
      color.default(
        "#000000",
      ),
    align:
      z.enum([
        "LEFT",
        "CENTER",
        "RIGHT",
      ]).default(
        "LEFT",
      ),
    weight:
      z.enum([
        "400",
        "600",
        "700",
        "800",
        "900",
      ]).default(
        "700",
      ),
    uppercase:
      z.boolean()
        .default(false),
    maxCharacters:
      z.number()
        .int()
        .min(4)
        .max(120)
        .optional(),
    maxWidth:
      z.number()
        .min(0.05)
        .max(1)
        .optional(),
    maxLines:
      z.number()
        .int()
        .min(1)
        .max(3)
        .optional(),
    minFontSize:
      z.number()
        .min(0.006)
        .max(0.25)
        .optional(),
  });

const qrSchema =
  z.object({
    side:
      z.enum([
        "FRONT",
        "BACK",
      ]),
    x:
      normalized,
    y:
      normalized,
    size:
      z.number()
        .min(0.05)
        .max(0.8),
  });

export const cardTemplateLayoutSchema =
  z.object({
    qr:
      qrSchema,
    frontText:
      z.array(
        textItemSchema,
      ).max(30),
    backText:
      z.array(
        textItemSchema,
      ).max(30),
  });

export type CardTemplateLayout =
  z.infer<
    typeof cardTemplateLayoutSchema
  >;

export type CardTextSource =
  z.infer<
    typeof cardTextSourceSchema
  >;

export function parseCardTemplateLayout(
  value:
    unknown,
): CardTemplateLayout {
  return cardTemplateLayoutSchema.parse(
    value,
  );
}
