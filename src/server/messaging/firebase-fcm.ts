import {
  createSign,
} from "node:crypto";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let tokenCache:
  | {
      token: string;
      expiresAt: number;
    }
  | null = null;

function required(
  name: string,
): string {
  const value =
    process.env[name]
      ?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  return value;
}

function serviceAccount():
  ServiceAccount {
  const encoded =
    required(
      "CASA_FIREBASE_SERVICE_ACCOUNT_BASE64",
    );

  let parsed:
    Partial<ServiceAccount>;

  try {
    parsed =
      JSON.parse(
        Buffer.from(
          encoded,
          "base64",
        ).toString(
          "utf8",
        ),
      ) as
        Partial<ServiceAccount>;
  } catch {
    throw new Error(
      "CASA Firebase service-account secret is invalid.",
    );
  }

  if (
    !parsed.project_id ||
    !parsed.client_email ||
    !parsed.private_key
  ) {
    throw new Error(
      "CASA Firebase service-account secret is incomplete.",
    );
  }

  return {
    project_id:
      parsed.project_id,
    client_email:
      parsed.client_email,
    private_key:
      parsed.private_key.replace(
        /\\n/g,
        "\n",
      ),
  };
}

function b64url(
  value:
    string |
    Buffer,
) {
  return Buffer.from(
    value,
  ).toString(
    "base64url",
  );
}

async function accessToken() {
  const account =
    serviceAccount();
  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  if (
    tokenCache &&
    tokenCache.expiresAt >
      now + 120
  ) {
    return {
      projectId:
        account.project_id,
      token:
        tokenCache.token,
    };
  }

  const header =
    b64url(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
      }),
    );
  const claims =
    b64url(
      JSON.stringify({
        iss:
          account.client_email,
        scope:
          "https://www.googleapis.com/auth/firebase.messaging",
        aud:
          "https://oauth2.googleapis.com/token",
        iat:
          now,
        exp:
          now + 3600,
      }),
    );

  const unsigned =
    `${header}.${claims}`;
  const signer =
    createSign(
      "RSA-SHA256",
    );

  signer.update(
    unsigned,
  );
  signer.end();

  const assertion =
    `${unsigned}.${signer
      .sign(
        account.private_key,
      )
      .toString(
        "base64url",
      )}`;

  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body:
          new URLSearchParams({
            grant_type:
              "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
          }),
        cache:
          "no-store",
      },
    );

  const body =
    await response.json()
      .catch(
        () => ({}),
      ) as {
        access_token?: string;
        expires_in?: number;
        error_description?: string;
      };

  if (
    !response.ok ||
    !body.access_token
  ) {
    throw new Error(
      body.error_description ??
        "Firebase OAuth authorization failed.",
    );
  }

  tokenCache = {
    token:
      body.access_token,
    expiresAt:
      now +
      Number(
        body.expires_in ??
          3600,
      ),
  };

  return {
    projectId:
      account.project_id,
    token:
      body.access_token,
  };
}

export function firebasePublicConfig() {
  const config = {
    apiKey:
      process.env
        .NEXT_PUBLIC_CASA_FIREBASE_API_KEY
        ?.trim() ?? "",
    authDomain:
      process.env
        .NEXT_PUBLIC_CASA_FIREBASE_AUTH_DOMAIN
        ?.trim() ?? "",
    projectId:
      process.env
        .NEXT_PUBLIC_CASA_FIREBASE_PROJECT_ID
        ?.trim() ?? "",
    storageBucket:
      process.env
        .NEXT_PUBLIC_CASA_FIREBASE_STORAGE_BUCKET
        ?.trim() ?? "",
    messagingSenderId:
      process.env
        .NEXT_PUBLIC_CASA_FIREBASE_MESSAGING_SENDER_ID
        ?.trim() ?? "",
    appId:
      process.env
        .NEXT_PUBLIC_CASA_FIREBASE_APP_ID
        ?.trim() ?? "",
  };

  const vapidKey =
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_VAPID_KEY
      ?.trim() ?? "";

  const ready =
    Object.values(
      config,
    ).every(
      Boolean,
    ) &&
    Boolean(
      vapidKey,
    );

  return {
    ready,
    config,
    vapidKey,
  };
}

export async function sendFcmToFid(
  input: {
    fid: string;
    title: string;
    body: string;
    iconUrl?: string | null;
    clickUrl?: string | null;
    data?:
      Record<string, string>;
  },
) {
  const auth =
    await accessToken();

  const response =
    await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        auth.projectId,
      )}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${auth.token}`,
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            message: {
              fid:
                input.fid,
              notification: {
                title:
                  input.title,
                body:
                  input.body,
              },
              data:
                input.data ?? {},
              webpush: {
                headers: {
                  TTL:
                    "86400",
                  Urgency:
                    "high",
                },
                notification: {
                  ...(input.iconUrl
                    ? {
                        icon:
                          input.iconUrl,
                        badge:
                          input.iconUrl,
                      }
                    : {}),
                },
                ...(input.clickUrl
                  ? {
                      fcm_options: {
                        link:
                          input.clickUrl,
                      },
                    }
                  : {}),
              },
            },
          }),
        cache:
          "no-store",
      },
    );

  const raw =
    await response.text();

  let body:
    | {
        name?: string;
        error?: {
          message?: string;
        };
      }
    | null = null;

  try {
    body =
      JSON.parse(
        raw,
      );
  } catch {
    body =
      null;
  }

  return {
    ok:
      response.ok,
    status:
      response.status,
    messageId:
      body?.name ??
      null,
    error:
      response.ok
        ? null
        : body?.error
            ?.message ??
          raw.slice(
            0,
            900,
          ) ??
          "FCM send failed.",
  };
}
