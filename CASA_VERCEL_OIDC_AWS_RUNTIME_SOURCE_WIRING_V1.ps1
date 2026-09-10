param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30

$ExpectedStorageHash = "53c250365f6cb80328021e4e1f1a3226c52a2960ed128f600265f0e6bbcdeb99"
$ExpectedRekognitionHash = "d43673976f21fd9200a67972b903fce38ba89d2407b19b6d2f094aa0871bb940"
$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedPackageLockHash = "1f031c58be57c0525d535881d1287666c8c059292cea9111d88ef6b8e94f7a15"

$OidcPackage = "@vercel/oidc-aws-credentials-provider"
$OidcPackageVersion = "3.3.5"

$StorageRelative = "src\server\card-production\storage.ts"
$RekognitionRelative = "src\server\biometrics\aws-rekognition.ts"
$HelperRelative = "src\server\aws\vercel-oidc-credentials.ts"
$PackageRelative = "package.json"
$PackageLockRelative = "package-lock.json"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-FileHash(
    [string]$Path,
    [string]$Expected,
    [string]$Label
) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Fail "$Label is missing."
    }

    $actual =
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256).
            Hash.
            ToLowerInvariant()

    if ($actual -ne $Expected) {
        Fail "$Label checksum drift. Expected $Expected; found $actual"
    }

    Write-Host "  $Label`: VERIFIED"
}

function Replace-ExactlyOnce(
    [string]$Text,
    [string]$Old,
    [string]$New,
    [string]$Label
) {
    $first = $Text.IndexOf(
        $Old,
        [System.StringComparison]::Ordinal
    )

    if ($first -lt 0) {
        Fail "$Label preimage not found."
    }

    $second = $Text.IndexOf(
        $Old,
        $first + $Old.Length,
        [System.StringComparison]::Ordinal
    )

    if ($second -ge 0) {
        Fail "$Label preimage is not unique."
    }

    return $Text.Substring(0, $first) +
        $New +
        $Text.Substring($first + $Old.Length)
}

function Invoke-CheckedNpm(
    [string[]]$Arguments,
    [string]$Label
) {
    $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue

    if ($null -eq $npm) {
        $npm = Get-Command "npm" -ErrorAction SilentlyContinue
    }

    if ($null -eq $npm) {
        Fail "npm is not available."
    }

    $command =
        if (-not [string]::IsNullOrWhiteSpace([string]$npm.Source)) {
            [string]$npm.Source
        }
        else {
            [string]$npm.Name
        }

    & $command @Arguments

    if ($LASTEXITCODE -ne 0) {
        Fail "$Label failed with exit code $LASTEXITCODE."
    }
}

Write-Host "CASA School - Vercel OIDC AWS Runtime Source Wiring V1" -ForegroundColor Green
Write-Host "Adds Vercel OIDC short-lived AWS credentials to the existing server-side S3, Rekognition, and STS clients."
Write-Host "Local/non-Vercel execution preserves the AWS SDK default credential chain."
Write-Host "No AWS IAM/S3 mutation. No Vercel env mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking exact CASA source checkpoint and preimages"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Fail "git is not available."
    }

    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short=7 HEAD).Trim()

    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Fail "Git checkpoint drift: $branch/$head"
    }

    $migrationCount =
        @(
            Get-ChildItem `
                -LiteralPath (Join-Path $ProjectRoot "drizzle") `
                -Recurse `
                -File `
                -Filter "migration.sql" |
            Where-Object {
                $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
                $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
            }
        ).Count

    if ($migrationCount -ne $ExpectedMigrationCount) {
        Fail "Expected $ExpectedMigrationCount migrations; found $migrationCount."
    }

    $storagePath = Join-Path $ProjectRoot $StorageRelative
    $rekognitionPath = Join-Path $ProjectRoot $RekognitionRelative
    $helperPath = Join-Path $ProjectRoot $HelperRelative
    $packagePath = Join-Path $ProjectRoot $PackageRelative
    $packageLockPath = Join-Path $ProjectRoot $PackageLockRelative

    Assert-FileHash $storagePath $ExpectedStorageHash $StorageRelative
    Assert-FileHash $rekognitionPath $ExpectedRekognitionHash $RekognitionRelative
    Assert-FileHash $packagePath $ExpectedPackageHash $PackageRelative
    Assert-FileHash $packageLockPath $ExpectedPackageLockHash $PackageLockRelative

    if (Test-Path -LiteralPath $helperPath) {
        Fail "$HelperRelative already exists; refusing to overwrite an unproven file."
    }

    $workingTree =
        @(
            & git status --porcelain --untracked-files=all
        )

    $allowedUntrackedPatterns = @(
        '^\?\? \.casa-backups/',
        '^\?\? CASA_.*\.ps1$',
        '^\?\? \.vercel/'
    )

    $unexpected =
        @(
            $workingTree |
            Where-Object {
                $line = [string]$_
                -not (
                    $allowedUntrackedPatterns |
                    Where-Object {
                        $line -match $_
                    }
                )
            }
        )

    if (@($unexpected).Count -gt 0) {
        Write-Host "  unexpected working-tree entries:" -ForegroundColor Yellow
        foreach ($line in $unexpected) {
            Write-Host "    $line"
        }
        Fail "Working tree contains changes outside guarded CASA evidence/PS1/Vercel-link artifacts."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  guarded target preimages:       VERIFIED"

    Step "Creating rollback backup before any source/package mutation"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\vercel-oidc-aws-runtime-source-wiring-v1-$stamp"

    New-Item -ItemType Directory -Path $backup -Force | Out-Null

    foreach ($relative in @(
        $StorageRelative,
        $RekognitionRelative,
        $PackageRelative,
        $PackageLockRelative
    )) {
        $source = Join-Path $ProjectRoot $relative
        $destination = Join-Path $backup $relative
        $destinationDir = Split-Path -Parent $destination

        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }

    Write-Host "  backup:                         $backup"

    Step "Adding exact Vercel OIDC credentials package"

    Invoke-CheckedNpm `
        @(
            "install",
            "--save-exact",
            "$OidcPackage@$OidcPackageVersion"
        ) `
        "OIDC package installation"

    $packageJson =
        Get-Content -LiteralPath $packagePath -Raw |
        ConvertFrom-Json

    $dependency =
        $packageJson.dependencies.PSObject.Properties[
            $OidcPackage
        ]

    if (
        $null -eq $dependency -or
        [string]$dependency.Value -ne $OidcPackageVersion
    ) {
        Fail "OIDC dependency did not resolve to exact version $OidcPackageVersion."
    }

    Write-Host "  dependency:                     $OidcPackage@$OidcPackageVersion / VERIFIED"

    Step "Creating shared server-only Vercel OIDC credential adapter"

    $helperDir = Split-Path -Parent $helperPath
    New-Item -ItemType Directory -Path $helperDir -Force | Out-Null

    $helper = @'
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
'@

    [System.IO.File]::WriteAllText(
        $helperPath,
        $helper,
        $Utf8NoBom
    )

    Step "Wiring S3Client to OIDC on Vercel while preserving local credentials"

    $storage =
        [System.IO.File]::ReadAllText(
            $storagePath
        )

    $storageImportOld = @'
} from "@aws-sdk/client-s3";

export class CardStorageUnavailableError extends Error {
'@

    $storageImportNew = @'
} from "@aws-sdk/client-s3";

import {
  getVercelOidcAwsCredentials,
} from "@/server/aws/vercel-oidc-credentials";

export class CardStorageUnavailableError extends Error {
'@

    $storageClientOld = @'
    new S3Client({
      region:
        config.region,
      endpoint:
        config.endpoint,
      forcePathStyle:
        config.forcePathStyle,
    });
'@

    $storageClientNew = @'
    new S3Client({
      region:
        config.region,
      endpoint:
        config.endpoint,
      forcePathStyle:
        config.forcePathStyle,
      credentials:
        getVercelOidcAwsCredentials(
          config.region,
        ),
    });
'@

    $storage =
        Replace-ExactlyOnce `
            $storage `
            $storageImportOld `
            $storageImportNew `
            "storage.ts OIDC import"

    $storage =
        Replace-ExactlyOnce `
            $storage `
            $storageClientOld `
            $storageClientNew `
            "storage.ts S3Client credentials"

    [System.IO.File]::WriteAllText(
        $storagePath,
        $storage,
        $Utf8NoBom
    )

    Step "Wiring RekognitionClient and STSClient to the same Vercel OIDC base role"

    $rekognition =
        [System.IO.File]::ReadAllText(
            $rekognitionPath
        )

    $rekognitionImportOld = @'
} from "@aws-sdk/client-sts";

export const AWS_REKOGNITION_PROVIDER =
'@

    $rekognitionImportNew = @'
} from "@aws-sdk/client-sts";

import {
  getVercelOidcAwsCredentials,
} from "@/server/aws/vercel-oidc-credentials";

export const AWS_REKOGNITION_PROVIDER =
'@

    $rekognitionClientOld = @'
    rekognition:
      new RekognitionClient({
        region:
          config.region,
      }),
    sts:
      new STSClient({
        region:
          config.region,
      }),
'@

    $rekognitionClientNew = @'
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
'@

    $rekognition =
        Replace-ExactlyOnce `
            $rekognition `
            $rekognitionImportOld `
            $rekognitionImportNew `
            "aws-rekognition.ts OIDC import"

    $rekognition =
        Replace-ExactlyOnce `
            $rekognition `
            $rekognitionClientOld `
            $rekognitionClientNew `
            "aws-rekognition.ts AWS clients credentials"

    [System.IO.File]::WriteAllText(
        $rekognitionPath,
        $rekognition,
        $Utf8NoBom
    )

    Step "Verifying exact source wiring before compilation"

    $helperText =
        [System.IO.File]::ReadAllText(
            $helperPath
        )

    $storagePost =
        [System.IO.File]::ReadAllText(
            $storagePath
        )

    $rekognitionPost =
        [System.IO.File]::ReadAllText(
            $rekognitionPath
        )

    if (
        $helperText -notmatch
        [regex]::Escape(
            '@vercel/oidc-aws-credentials-provider'
        ) -or
        $helperText -notmatch
        [regex]::Escape(
            'audience:'
        ) -or
        $helperText -notmatch
        [regex]::Escape(
            '"sts.amazonaws.com"'
        ) -or
        $helperText -notmatch
        [regex]::Escape(
            '.AWS_ROLE_ARN'
        )
    ) {
        Fail "OIDC helper postcondition failed."
    }

    $storageCredentialCount =
        ([regex]::Matches(
            $storagePost,
            "getVercelOidcAwsCredentials"
        )).Count

    $rekognitionCredentialCount =
        ([regex]::Matches(
            $rekognitionPost,
            "getVercelOidcAwsCredentials"
        )).Count

    if ($storageCredentialCount -ne 2) {
        Fail "Expected storage.ts to contain one import plus one OIDC credentials use."
    }

    if ($rekognitionCredentialCount -ne 3) {
        Fail "Expected aws-rekognition.ts to contain one import plus two OIDC credentials uses."
    }

    if (
        $rekognitionPost -notmatch
        [regex]::Escape(
            "AssumeRoleCommand"
        ) -or
        $rekognitionPost -notmatch
        [regex]::Escape(
            "CASA_AWS_LIVENESS_STREAM_ROLE_ARN"
        )
    ) {
        Fail "Existing liveness stream-role path was not preserved."
    }

    Write-Host "  S3 OIDC injection:              VERIFIED"
    Write-Host "  Rekognition OIDC injection:     VERIFIED"
    Write-Host "  STS base OIDC injection:        VERIFIED"
    Write-Host "  local default-chain fallback:   VERIFIED"
    Write-Host "  liveness stream-role path:      PRESERVED"

    Step "Running TypeScript and production build verification"

    Invoke-CheckedNpm `
        @(
            "run",
            "typecheck"
        ) `
        "npm run typecheck"

    Invoke-CheckedNpm `
        @(
            "run",
            "build"
        ) `
        "npm run build"

    Step "Capturing post-write evidence"

    $postHashes =
        [ordered]@{
            helper =
                (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).
                    Hash.
                    ToLowerInvariant()
            storage =
                (Get-FileHash -LiteralPath $storagePath -Algorithm SHA256).
                    Hash.
                    ToLowerInvariant()
            rekognition =
                (Get-FileHash -LiteralPath $rekognitionPath -Algorithm SHA256).
                    Hash.
                    ToLowerInvariant()
            package =
                (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).
                    Hash.
                    ToLowerInvariant()
            packageLock =
                (Get-FileHash -LiteralPath $packageLockPath -Algorithm SHA256).
                    Hash.
                    ToLowerInvariant()
        }

    $evidence =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_VERCEL_OIDC_AWS_RUNTIME_SOURCE_WIRING_V1"
            sourceAuthority = "$branch/$head"
            migrations = $migrationCount
            dependency = "$OidcPackage@$OidcPackageVersion"
            behavior = [ordered]@{
                vercelUsesOidcWhenAwsRoleArnPresent = $true
                vercelMissingRoleFailsClosed = $true
                localUsesDefaultAwsCredentialChain = $true
                s3UsesSharedProvider = $true
                rekognitionUsesSharedProvider = $true
                stsUsesSharedProvider = $true
                existingLivenessStreamRoleAssumptionPreserved = $true
            }
            postHashes = $postHashes
            mutations = [ordered]@{
                source = $true
                packageManifest = $true
                packageLock = $true
                awsIam = $false
                s3 = $false
                vercelEnvironment = $false
                database = $false
                migration = $false
                deployment = $false
            }
        }

    [System.IO.File]::WriteAllText(
        (Join-Path $backup "RESULT.json"),
        ($evidence | ConvertTo-Json -Depth 12),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA VERCEL OIDC AWS RUNTIME SOURCE WIRING V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority before patch:  $branch/$head"
    Write-Host "  migrations:                     $migrationCount / UNCHANGED"
    Write-Host "  dependency:                     $OidcPackage@$OidcPackageVersion"
    Write-Host "  S3 credential path:             Vercel OIDC on Vercel / default chain locally"
    Write-Host "  Rekognition credential path:    Vercel OIDC on Vercel / default chain locally"
    Write-Host "  STS credential path:            Vercel OIDC on Vercel / default chain locally"
    Write-Host "  liveness stream-role assumption:PRESERVED"
    Write-Host "  typecheck:                      GREEN"
    Write-Host "  production build:               GREEN"
    Write-Host "  AWS IAM/S3 mutation:            NONE"
    Write-Host "  Vercel env/deployment mutation: NONE"
    Write-Host "  DB/migration mutation:          NONE"
    Write-Host "  rollback/evidence:              $backup"
    Write-Host ""
    Write-Host "NEXT: return this complete output. The next guarded step can create the exact Vercel Team OIDC provider and least-privilege Staging/Production AWS runtime roles, including sts:AssumeRole only for the existing liveness stream role." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL OIDC AWS RUNTIME SOURCE WIRING V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "If source/package mutation had started, use the printed .casa-backups path as rollback authority."
    Write-Host "No AWS IAM/S3, Vercel environment/deployment, DB, or migration mutation was authorized by this installer."
    throw
}
