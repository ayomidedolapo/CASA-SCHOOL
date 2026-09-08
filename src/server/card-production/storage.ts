import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export class CardStorageUnavailableError extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    );
    this.name =
      "CardStorageUnavailableError";
  }
}

interface CardStorageConfig {
  bucket: string;
  region: string;
  endpoint:
    string | undefined;
  forcePathStyle:
    boolean;
}

let cached:
  | {
      config:
        CardStorageConfig;
      client:
        S3Client;
    }
  | undefined;

function readConfig():
  CardStorageConfig {
  const bucket =
    process.env
      .CASA_CARD_STORAGE_BUCKET
      ?.trim();
  const region =
    process.env
      .CASA_CARD_STORAGE_REGION
      ?.trim();

  if (
    !bucket ||
    !region
  ) {
    throw new CardStorageUnavailableError(
      "CASA_CARD_STORAGE_BUCKET and CASA_CARD_STORAGE_REGION are required.",
    );
  }

  const endpoint =
    process.env
      .CASA_CARD_STORAGE_ENDPOINT
      ?.trim() ||
    undefined;

  const forcePathStyle =
    process.env
      .CASA_CARD_STORAGE_FORCE_PATH_STYLE ===
    "true";

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle,
  };
}

function getStorage() {
  const config =
    readConfig();

  if (
    cached &&
    cached.config.bucket ===
      config.bucket &&
    cached.config.region ===
      config.region &&
    cached.config.endpoint ===
      config.endpoint &&
    cached.config.forcePathStyle ===
      config.forcePathStyle
  ) {
    return cached;
  }

  const client =
    new S3Client({
      region:
        config.region,
      endpoint:
        config.endpoint,
      forcePathStyle:
        config.forcePathStyle,
    });

  cached = {
    config,
    client,
  };

  return cached;
}

export function assertCardStorageConfigured():
  void {
  readConfig();
}

export async function cardObjectExists(
  key:
    string,
): Promise<boolean> {
  const {
    client,
    config,
  } =
    getStorage();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket:
          config.bucket,
        Key:
          key,
      }),
    );

    return true;
  } catch (
    error
  ) {
    const status =
      typeof error ===
        "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof (
        error as {
          $metadata?: {
            httpStatusCode?:
              number;
          };
        }
      ).$metadata
        ?.httpStatusCode ===
        "number"
        ? (
            error as {
              $metadata: {
                httpStatusCode:
                  number;
              };
            }
          ).$metadata
            .httpStatusCode
        : null;

    if (
      status ===
        404
    ) {
      return false;
    }

    throw error;
  }
}

export async function putPrivateCardObject(
  input: {
    key: string;
    body: Buffer;
    contentType: string;
  },
): Promise<void> {
  const {
    client,
    config,
  } =
    getStorage();

  await client.send(
    new PutObjectCommand({
      Bucket:
        config.bucket,
      Key:
        input.key,
      Body:
        input.body,
      ContentType:
        input.contentType,
      CacheControl:
        "private, no-store",
      ServerSideEncryption:
        "AES256",
    }),
  );
}

export async function getPrivateCardObject(
  key:
    string,
): Promise<Buffer | null> {
  const {
    client,
    config,
  } =
    getStorage();

  try {
    const response =
      await client.send(
        new GetObjectCommand({
          Bucket:
            config.bucket,
          Key:
            key,
        }),
      );

    if (
      !response.Body
    ) {
      return null;
    }

    return Buffer.from(
      await response.Body
        .transformToByteArray(),
    );
  } catch (
    error
  ) {
    const status =
      typeof error ===
        "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof (
        error as {
          $metadata?: {
            httpStatusCode?:
              number;
          };
        }
      ).$metadata
        ?.httpStatusCode ===
        "number"
        ? (
            error as {
              $metadata: {
                httpStatusCode:
                  number;
              };
            }
          ).$metadata
            .httpStatusCode
        : null;

    if (
      status ===
        404
    ) {
      return null;
    }

    throw error;
  }
}

export async function deletePrivateCardObjectsBestEffort(
  keys:
    string[],
): Promise<void> {
  if (
    keys.length ===
    0
  ) {
    return;
  }

  try {
    const {
      client,
      config,
    } =
      getStorage();

    await client.send(
      new DeleteObjectsCommand({
        Bucket:
          config.bucket,
        Delete: {
          Objects:
            keys.map(
              (key) => ({
                Key:
                  key,
              }),
            ),
          Quiet: true,
        },
      }),
    );
  } catch {
    // Orphan cleanup must never overwrite the primary issuance error.
  }
}