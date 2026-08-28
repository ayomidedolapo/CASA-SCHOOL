const MAX_CAPTURE_BYTES =
  12 * 1024 * 1024;

const supportedTypes =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/webm",
    "video/mp4",
  ]);

export class InvalidBiometricCaptureError extends Error {
  constructor(
    message:
      string =
        "Invalid biometric capture.",
  ) {
    super(message);
    this.name =
      "InvalidBiometricCaptureError";
  }
}

export async function readBiometricCapture(
  request: Request,
): Promise<File> {
  const contentType =
    request.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType
      .toLowerCase()
      .startsWith(
        "multipart/form-data",
      )
  ) {
    throw new InvalidBiometricCaptureError();
  }

  const form =
    await request.formData();

  const capture =
    form.get("capture");

  if (
    !(capture instanceof File)
  ) {
    throw new InvalidBiometricCaptureError(
      "Biometric capture file is required.",
    );
  }

  if (
    capture.size <= 0 ||
    capture.size >
      MAX_CAPTURE_BYTES
  ) {
    throw new InvalidBiometricCaptureError(
      "Biometric capture size is invalid.",
    );
  }

  if (
    !supportedTypes.has(
      capture.type,
    )
  ) {
    throw new InvalidBiometricCaptureError(
      "Biometric capture media type is not supported.",
    );
  }

  return capture;
}