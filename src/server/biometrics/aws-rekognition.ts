import {
  CreateCollectionCommand,
  CreateFaceLivenessSessionCommand,
  DeleteFacesCommand,
  GetFaceLivenessSessionResultsCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
  type QualityFilter,
} from "@aws-sdk/client-rekognition";
import {
  AssumeRoleCommand,
  STSClient,
} from "@aws-sdk/client-sts";

import {
  getVercelOidcAwsCredentials,
} from "../aws/vercel-oidc-credentials";

export const AWS_REKOGNITION_PROVIDER =
  "aws-rekognition";

const AWS_LIVENESS_SESSION_TTL_MS =
  165_000;

const allowedQualityFilters =
  new Set<QualityFilter>([
    "NONE",
    "AUTO",
    "LOW",
    "MEDIUM",
    "HIGH",
  ]);

export class AwsBiometricUnavailableError extends Error {
  constructor(
    message =
      "AWS biometric service is unavailable.",
  ) {
    super(message);
    this.name =
      "AwsBiometricUnavailableError";
  }
}

interface AwsBiometricConfig {
  region: string;
  streamRoleArn: string;
  qualityFilter:
    QualityFilter;
}

export function percentToBasisPoints(
  value: number,
): number {
  if (
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      10000,
      Math.round(
        value * 100,
      ),
    ),
  );
}

function awsCollectionPrefix(): string {
  const configured =
    process.env
      .CASA_AWS_REKOGNITION_COLLECTION_PREFIX
      ?.trim();

  const prefix =
    configured ||
    (
      process.env.VERCEL === "1"
        ? undefined
        : "casa-school"
    );

  if (!prefix) {
    throw new Error(
      "CASA_AWS_REKOGNITION_COLLECTION_PREFIX is required on Vercel.",
    );
  }

  if (
    !/^[a-zA-Z0-9_.-]+$/.test(
      prefix,
    )
  ) {
    throw new Error(
      "AWS_BIOMETRIC_INVALID_COLLECTION_PREFIX",
    );
  }

  return prefix;
}

export function awsCollectionIdForSchool(
  schoolId: string,
): string {
  const compact =
    schoolId
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        "",
      );

  if (
    compact.length !== 32
  ) {
    throw new Error(
      "INVALID_SCHOOL_ID_FOR_AWS_COLLECTION",
    );
  }

  const collectionId =
    `${awsCollectionPrefix()}-${compact}`;

  if (
    collectionId.length > 255
  ) {
    throw new Error(
      "AWS_BIOMETRIC_COLLECTION_ID_TOO_LONG",
    );
  }

  return collectionId;
}

function getAwsBiometricConfig():
  AwsBiometricConfig {
  const region =
    process.env
      .CASA_AWS_REKOGNITION_REGION
      ?.trim();

  const streamRoleArn =
    process.env
      .CASA_AWS_LIVENESS_STREAM_ROLE_ARN
      ?.trim();

  const qualityRaw =
    (
      process.env
        .CASA_AWS_REKOGNITION_QUALITY_FILTER
        ?.trim()
        .toUpperCase() ||
      "AUTO"
    ) as QualityFilter;

  if (
    !region ||
    !streamRoleArn
  ) {
    throw new Error(
      "AWS_BIOMETRIC_NOT_CONFIGURED",
    );
  }

  if (
    !allowedQualityFilters.has(
      qualityRaw,
    )
  ) {
    throw new Error(
      "AWS_BIOMETRIC_INVALID_QUALITY_FILTER",
    );
  }

  return {
    region,
    streamRoleArn,
    qualityFilter:
      qualityRaw,
  };
}

function getClients() {
  const config =
    getAwsBiometricConfig();

  return {
    config,
    rekognition:
      new RekognitionClient({
        region:
          config.region,
        credentials:
          getVercelOidcAwsCredentials(
            config.region,
          ),
      }),
    sts:
      new STSClient({
        region:
          config.region,
        credentials:
          getVercelOidcAwsCredentials(
            config.region,
          ),
      }),
  };
}

async function ensureCollection(
  schoolId: string,
): Promise<string> {
  const {
    rekognition,
  } =
    getClients();

  const collectionId =
    awsCollectionIdForSchool(
      schoolId,
    );

  try {
    await rekognition.send(
      new CreateCollectionCommand({
        CollectionId:
          collectionId,
      }),
    );
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        error.name ===
          "ResourceAlreadyExistsException"
      )
    ) {
      throw new AwsBiometricUnavailableError(
        "Unable to create or confirm the school face collection.",
      );
    }
  }

  return collectionId;
}

export async function createAwsFaceLivenessSession():
  Promise<{
    providerSessionId: string;
    expiresAt: Date;
    region: string;
  }> {
  const {
    config,
    rekognition,
  } =
    getClients();

  let response;

  try {
    response =
      await rekognition.send(
        new CreateFaceLivenessSessionCommand({
          Settings: {
            AuditImagesLimit:
              0,
            ChallengePreferences: [
              {
                Type:
                  "FaceMovementChallenge",
              },
            ],
          },
        }),
      );
  } catch {
    throw new AwsBiometricUnavailableError(
      "Unable to create an AWS Face Liveness session.",
    );
  }

  if (!response.SessionId) {
    throw new AwsBiometricUnavailableError(
      "AWS Face Liveness did not return a session identifier.",
    );
  }

  return {
    providerSessionId:
      response.SessionId,
    expiresAt:
      new Date(
        Date.now() +
          AWS_LIVENESS_SESSION_TTL_MS,
      ),
    region:
      config.region,
  };
}

export async function issueAwsLivenessStreamingCredentials(
  providerSessionId:
    string,
): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  region: string;
}> {
  const {
    config,
    sts,
  } =
    getClients();

  const sessionName =
    `casa-live-${providerSessionId.replace(/-/g, "").slice(0, 20)}`;

  let response;

  try {
    response =
      await sts.send(
        new AssumeRoleCommand({
          RoleArn:
            config.streamRoleArn,
          RoleSessionName:
            sessionName,
          DurationSeconds:
            900,
          Policy:
            JSON.stringify({
              Version:
                "2012-10-17",
              Statement: [
                {
                  Effect:
                    "Allow",
                  Action: [
                    "rekognition:StartFaceLivenessSession",
                  ],
                  Resource:
                    "*",
                },
              ],
            }),
        }),
      );
  } catch {
    throw new AwsBiometricUnavailableError(
      "Unable to issue temporary Face Liveness streaming credentials.",
    );
  }

  const credentials =
    response.Credentials;

  if (
    !credentials
      ?.AccessKeyId ||
    !credentials
      .SecretAccessKey ||
    !credentials
      .SessionToken ||
    !credentials
      .Expiration
  ) {
    throw new AwsBiometricUnavailableError(
      "AWS STS did not return complete temporary credentials.",
    );
  }

  return {
    accessKeyId:
      credentials.AccessKeyId,
    secretAccessKey:
      credentials.SecretAccessKey,
    sessionToken:
      credentials.SessionToken,
    expiration:
      credentials.Expiration,
    region:
      config.region,
  };
}

export async function getAwsFaceLivenessResult(
  providerSessionId:
    string,
): Promise<{
  status:
    | "CREATED"
    | "IN_PROGRESS"
    | "SUCCEEDED"
    | "FAILED"
    | "EXPIRED";
  confidenceBps:
    number;
  referenceImage:
    Uint8Array | null;
}> {
  const {
    rekognition,
  } =
    getClients();

  let response;

  try {
    response =
      await rekognition.send(
        new GetFaceLivenessSessionResultsCommand({
          SessionId:
            providerSessionId,
        }),
      );
  } catch {
    throw new AwsBiometricUnavailableError(
      "Unable to obtain AWS Face Liveness results.",
    );
  }

  const status =
    response.Status;

  if (
    status !== "CREATED" &&
    status !== "IN_PROGRESS" &&
    status !== "SUCCEEDED" &&
    status !== "FAILED" &&
    status !== "EXPIRED"
  ) {
    throw new AwsBiometricUnavailableError(
      "AWS Face Liveness returned an unknown session state.",
    );
  }

  return {
    status,
    confidenceBps:
      percentToBasisPoints(
        response.Confidence ??
          0,
      ),
    referenceImage:
      response.ReferenceImage
        ?.Bytes
        ? new Uint8Array(
            response.ReferenceImage
              .Bytes,
          )
        : null,
  };
}

export async function indexAwsStudentFace(
  input: {
    schoolId: string;
    studentId: string;
    referenceImage:
      Uint8Array;
  },
): Promise<{
  collectionId: string;
  faceId: string;
}> {
  const {
    config,
    rekognition,
  } =
    getClients();

  const collectionId =
    await ensureCollection(
      input.schoolId,
    );

  let response;

  try {
    response =
      await rekognition.send(
        new IndexFacesCommand({
          CollectionId:
            collectionId,
          Image: {
            Bytes:
              input.referenceImage,
          },
          ExternalImageId:
            `student-${input.studentId}`,
          MaxFaces: 1,
          QualityFilter:
            config.qualityFilter,
          DetectionAttributes: [
            "DEFAULT",
          ],
        }),
      );
  } catch {
    throw new AwsBiometricUnavailableError(
      "Unable to index the student's face.",
    );
  }

  const faceId =
    response.FaceRecords?.[0]
      ?.Face
      ?.FaceId;

  if (!faceId) {
    throw new Error(
      "AWS_FACE_NOT_INDEXED",
    );
  }

  const multipleFaces =
    response.UnindexedFaces
      ?.some(
        (entry) =>
          entry.Reasons
            ?.includes(
              "EXCEEDS_MAX_FACES",
            ),
      ) ?? false;

  if (multipleFaces) {
    try {
      await rekognition.send(
        new DeleteFacesCommand({
          CollectionId:
            collectionId,
          FaceIds: [
            faceId,
          ],
        }),
      );
    } catch {
      // The profile will never be activated, so a later
      // collection hygiene pass can remove this orphan.
    }

    throw new Error(
      "AWS_MULTIPLE_FACES_DETECTED",
    );
  }

  return {
    collectionId,
    faceId,
  };
}

export async function searchAwsExpectedFace(
  input: {
    schoolId: string;
    expectedFaceId: string;
    referenceImage:
      Uint8Array;
    thresholdBps: number;
  },
): Promise<{
  matched: boolean;
  similarityBps: number;
}> {
  const {
    config,
    rekognition,
  } =
    getClients();

  const collectionId =
    await ensureCollection(
      input.schoolId,
    );

  let response;

  try {
    response =
      await rekognition.send(
        new SearchFacesByImageCommand({
          CollectionId:
            collectionId,
          Image: {
            Bytes:
              input.referenceImage,
          },
          FaceMatchThreshold:
            input.thresholdBps /
            100,
          MaxFaces: 10,
          QualityFilter:
            config.qualityFilter,
        }),
      );
  } catch {
    throw new AwsBiometricUnavailableError(
      "Unable to search the school face collection.",
    );
  }

  const expectedMatch =
    response.FaceMatches
      ?.find(
        (match) =>
          match.Face?.FaceId ===
            input.expectedFaceId &&
          typeof match.Similarity ===
            "number",
      );

  if (
    !expectedMatch ||
    typeof expectedMatch.Similarity !==
      "number"
  ) {
    return {
      matched: false,
      similarityBps: 0,
    };
  }

  const similarityBps =
    percentToBasisPoints(
      expectedMatch.Similarity,
    );

  return {
    matched:
      similarityBps >=
      input.thresholdBps,
    similarityBps,
  };
}

export async function deleteAwsFace(
  input: {
    collectionId: string;
    faceId: string;
  },
): Promise<void> {
  const {
    rekognition,
  } =
    getClients();

  try {
    await rekognition.send(
      new DeleteFacesCommand({
        CollectionId:
          input.collectionId,
        FaceIds: [
          input.faceId,
        ],
      }),
    );
  } catch {
    throw new AwsBiometricUnavailableError(
      "Unable to delete the replaced AWS face vector.",
    );
  }
}