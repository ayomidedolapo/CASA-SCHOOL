type AwsCredentialIdentity = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
};

type AwsCredentialProvider =
  () => Promise<AwsCredentialIdentity>;

type CachedProvider = {
  roleArn: string;
  region: string;
  provider: AwsCredentialProvider;
};

let cached:
  | CachedProvider
  | undefined;

function isVercelRuntime(): boolean {
  return (
    process.env.VERCEL ===
    "1"
  );
}

export function getVercelOidcAwsCredentials(
  region: string,
): AwsCredentialProvider | undefined {
  if (!isVercelRuntime()) {
    // Local/Development keeps the AWS SDK default credential chain
    // (for example AWS_PROFILE / aws login).
    return undefined;
  }

  const roleArn =
    process.env
      .AWS_ROLE_ARN
      ?.trim();

  if (!roleArn) {
    throw new Error(
      "AWS_ROLE_ARN is required for AWS access from Vercel.",
    );
  }

  if (
    cached &&
    cached.roleArn === roleArn &&
    cached.region === region
  ) {
    return cached.provider;
  }

  let delegated:
    | AwsCredentialProvider
    | undefined;

  const provider:
    AwsCredentialProvider =
    async () => {
      if (!delegated) {
        const {
          awsCredentialsProvider,
        } =
          await import(
            "@vercel/oidc-aws-credentials-provider"
          );

        delegated =
          awsCredentialsProvider({
            roleArn,
            audience:
              "sts.amazonaws.com",
            clientConfig: {
              region,
            },
          });
      }

      return delegated();
    };

  cached = {
    roleArn,
    region,
    provider,
  };

  return provider;
}