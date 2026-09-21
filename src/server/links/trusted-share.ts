export interface TrustedSchoolLinkMessageInput {
  schoolName: string;
  purpose: string;
  url: string;
  recipientName?: string | null;
  studentName?: string | null;
  expiresLabel?: string | null;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildTrustedSchoolLinkMessage(
  input: TrustedSchoolLinkMessageInput,
): string {
  const schoolName = clean(input.schoolName);
  const purpose = clean(input.purpose);
  const recipientName = input.recipientName
    ? clean(input.recipientName)
    : null;
  const studentName = input.studentName
    ? clean(input.studentName)
    : null;
  const expiresLabel = input.expiresLabel
    ? clean(input.expiresLabel)
    : null;

  const context = [
    recipientName
      ? `This private link is intended for ${recipientName}.`
      : null,
    studentName
      ? `Student: ${studentName}.`
      : null,
    expiresLabel
      ? `Link validity: ${expiresLabel}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    schoolName,
    "",
    purpose,
    context,
    `If you were not expecting this message, please contact ${schoolName} before opening the link.`,
    "",
    input.url,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .trim();
}
