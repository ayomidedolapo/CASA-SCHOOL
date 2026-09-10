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

function Normalize-Newlines([string]$Text) {
    return (
        $Text.
            Replace("`r`n", "`n").
            Replace("`r", "`n")
    )
}

function Get-Newline([string]$Text) {
    if ($Text.Contains("`r`n")) {
        return "`r`n"
    }

    return "`n"
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

    Write-Host "  $Label`: ORIGINAL / VERIFIED"
}

function Insert-AfterExactlyOnce(
    [string]$Text,
    [string]$Marker,
    [string]$Insertion,
    [string]$Label
) {
    $first =
        $Text.IndexOf(
            $Marker,
            [System.StringComparison]::Ordinal
        )

    if ($first -lt 0) {
        Fail "$Label marker not found."
    }

    $second =
        $Text.IndexOf(
            $Marker,
            $first + $Marker.Length,
            [System.StringComparison]::Ordinal
        )

    if ($second -ge 0) {
        Fail "$Label marker is not unique."
    }

    $insertAt =
        $first +
        $Marker.Length

    return (
        $Text.Substring(
            0,
            $insertAt
        ) +
        $Insertion +
        $Text.Substring(
            $insertAt
        )
    )
}

function Invoke-CheckedNpm(
    [string[]]$Arguments,
    [string]$Label
) {
    $npm =
        Get-Command `
            "npm.cmd" `
            -ErrorAction SilentlyContinue

    if ($null -eq $npm) {
        $npm =
            Get-Command `
                "npm" `
                -ErrorAction SilentlyContinue
    }

    if ($null -eq $npm) {
        Fail "npm is not available."
    }

    $command =
        if (
            -not (
                [string]::IsNullOrWhiteSpace(
                    [string]$npm.Source
                )
            )
        ) {
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

Write-Host "CASA School - Vercel OIDC AWS Runtime Source Wiring V1R2 Recovery" -ForegroundColor Green
Write-Host "Continues only from the proven partial V1 state: package/helper installed, AWS client source files still original."
Write-Host "No npm install. No AWS IAM/S3 mutation. No Vercel env mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking exact CASA checkpoint and V1 partial-state boundary"

    if (
        -not (
            Test-Path `
                -LiteralPath $ProjectRoot `
                -PathType Container
        )
    ) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    foreach ($command in @("git", "npm")) {
        if (
            -not (
                Get-Command `
                    $command `
                    -ErrorAction SilentlyContinue
            )
        ) {
            Fail "$command is not available."
        }
    }

    $branch =
        (& git branch --show-current).Trim()

    $head =
        (& git rev-parse --short=7 HEAD).Trim()

    if (
        $branch -ne $ExpectedBranch -or
        $head -ne $ExpectedHead
    ) {
        Fail "Git checkpoint drift: $branch/$head"
    }

    $migrationCount =
        @(
            Get-ChildItem `
                -LiteralPath (
                    Join-Path `
                        $ProjectRoot `
                        "drizzle"
                ) `
                -Recurse `
                -File `
                -Filter "migration.sql" |
            Where-Object {
                $_.FullName -notmatch
                    '[\\/]node_modules[\\/]' -and
                $_.FullName -notmatch
                    '[\\/]\.casa-backups[\\/]'
            }
        ).Count

    if (
        $migrationCount -ne
        $ExpectedMigrationCount
    ) {
        Fail "Expected $ExpectedMigrationCount migrations; found $migrationCount."
    }

    $storagePath =
        Join-Path `
            $ProjectRoot `
            $StorageRelative

    $rekognitionPath =
        Join-Path `
            $ProjectRoot `
            $RekognitionRelative

    $helperPath =
        Join-Path `
            $ProjectRoot `
            $HelperRelative

    $packagePath =
        Join-Path `
            $ProjectRoot `
            $PackageRelative

    $packageLockPath =
        Join-Path `
            $ProjectRoot `
            $PackageLockRelative

    Assert-FileHash `
        $storagePath `
        $ExpectedStorageHash `
        $StorageRelative

    Assert-FileHash `
        $rekognitionPath `
        $ExpectedRekognitionHash `
        $RekognitionRelative

    if (
        -not (
            Test-Path `
                -LiteralPath $helperPath `
                -PathType Leaf
        )
    ) {
        Fail "V1 partial state is not exact: OIDC helper is missing."
    }

    if (
        -not (
            Test-Path `
                -LiteralPath $packagePath `
                -PathType Leaf
        ) -or
        -not (
            Test-Path `
                -LiteralPath $packageLockPath `
                -PathType Leaf
        )
    ) {
        Fail "package.json/package-lock.json missing."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  AWS client files:               ORIGINAL / VERIFIED"

    Step "Verifying package installation from V1 without reinstalling"

    try {
        $packageJson =
            Get-Content `
                -LiteralPath $packagePath `
                -Raw |
            ConvertFrom-Json
    }
    catch {
        Fail "package.json is invalid JSON."
    }

    $dependency =
        $packageJson.dependencies.
            PSObject.
            Properties[
                $OidcPackage
            ]

    if (
        $null -eq $dependency -or
        [string]$dependency.Value -ne
        $OidcPackageVersion
    ) {
        Fail "V1 partial state is not exact: expected $OidcPackage@$OidcPackageVersion in dependencies."
    }

    try {
        $packageLockJson =
            Get-Content `
                -LiteralPath $packageLockPath `
                -Raw |
            ConvertFrom-Json
    }
    catch {
        Fail "package-lock.json is invalid JSON."
    }

    $lockPackageKey =
        "node_modules/$OidcPackage"

    $lockedPackage =
        $packageLockJson.packages.
            PSObject.
            Properties[
                $lockPackageKey
            ]

    if (
        $null -eq $lockedPackage -or
        $null -eq $lockedPackage.Value -or
        [string]$lockedPackage.Value.version -ne
        $OidcPackageVersion
    ) {
        Fail "package-lock.json does not lock $OidcPackage@$OidcPackageVersion."
    }

    $installedPackagePath =
        Join-Path `
            $ProjectRoot `
            "node_modules\$OidcPackage\package.json"

    if (
        -not (
            Test-Path `
                -LiteralPath $installedPackagePath `
                -PathType Leaf
        )
    ) {
        Fail "Installed OIDC package is missing from node_modules."
    }

    try {
        $installedPackage =
            Get-Content `
                -LiteralPath $installedPackagePath `
                -Raw |
            ConvertFrom-Json
    }
    catch {
        Fail "Installed OIDC package.json is invalid."
    }

    if (
        [string]$installedPackage.version -ne
        $OidcPackageVersion
    ) {
        Fail "Installed OIDC package version drift."
    }

    Write-Host "  package.json dependency:        $OidcPackageVersion / VERIFIED"
    Write-Host "  package-lock version:           $OidcPackageVersion / VERIFIED"
    Write-Host "  node_modules version:           $OidcPackageVersion / VERIFIED"
    Write-Host "  npm install rerun:              NO"

    Step "Verifying exact OIDC helper created by V1"

    $expectedHelper = @'
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

    $actualHelper =
        [System.IO.File]::ReadAllText(
            $helperPath
        )

    if (
        (
            Normalize-Newlines(
                $actualHelper
            )
        ).TrimEnd() -ne
        (
            Normalize-Newlines(
                $expectedHelper
            )
        ).TrimEnd()
    ) {
        Fail "OIDC helper differs from the exact V1 helper."
    }

    Write-Host "  OIDC helper:                    V1 EXACT / VERIFIED"
    Write-Host "  custom audience:                sts.amazonaws.com / VERIFIED"
    Write-Host "  local default-chain fallback:   PRESENT / VERIFIED"

    Step "Creating second rollback snapshot of the exact partial state"

    $stamp =
        Get-Date `
            -Format "yyyyMMdd-HHmmss"

    $backup =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\vercel-oidc-aws-runtime-source-wiring-v1r2-recovery-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $backup `
        -Force |
    Out-Null

    foreach ($relative in @(
        $StorageRelative,
        $RekognitionRelative,
        $HelperRelative,
        $PackageRelative,
        $PackageLockRelative
    )) {
        $source =
            Join-Path `
                $ProjectRoot `
                $relative

        $destination =
            Join-Path `
                $backup `
                $relative

        $destinationDir =
            Split-Path `
                -Parent `
                $destination

        New-Item `
            -ItemType Directory `
            -Path $destinationDir `
            -Force |
        Out-Null

        Copy-Item `
            -LiteralPath $source `
            -Destination $destination `
            -Force
    }

    Write-Host "  recovery backup:                $backup"

    Step "Wiring S3Client using newline-independent guarded insertion"

    $storage =
        [System.IO.File]::ReadAllText(
            $storagePath
        )

    $storageNl =
        Get-Newline `
            $storage

    if (
        $storage.Contains(
            "getVercelOidcAwsCredentials"
        )
    ) {
        Fail "storage.ts already contains OIDC wiring unexpectedly."
    }

    $storageImportMarker =
        '} from "@aws-sdk/client-s3";'

    $storageImportInsertion =
        $storageNl +
        $storageNl +
        'import {' +
        $storageNl +
        '  getVercelOidcAwsCredentials,' +
        $storageNl +
        '} from "../aws/vercel-oidc-credentials";'

    $storage =
        Insert-AfterExactlyOnce `
            $storage `
            $storageImportMarker `
            $storageImportInsertion `
            "storage.ts AWS SDK import"

    $storageConfigMarker =
        '      forcePathStyle:' +
        $storageNl +
        '        config.forcePathStyle,'

    $storageConfigInsertion =
        $storageNl +
        '      credentials:' +
        $storageNl +
        '        getVercelOidcAwsCredentials(' +
        $storageNl +
        '          config.region,' +
        $storageNl +
        '        ),'

    $storage =
        Insert-AfterExactlyOnce `
            $storage `
            $storageConfigMarker `
            $storageConfigInsertion `
            "storage.ts S3Client config"

    [System.IO.File]::WriteAllText(
        $storagePath,
        $storage,
        $Utf8NoBom
    )

    Write-Host "  S3Client base credentials:      WIRED"

    Step "Wiring RekognitionClient + STSClient to the same Vercel OIDC base role"

    $rekognition =
        [System.IO.File]::ReadAllText(
            $rekognitionPath
        )

    $rekognitionNl =
        Get-Newline `
            $rekognition

    if (
        $rekognition.Contains(
            "getVercelOidcAwsCredentials"
        )
    ) {
        Fail "aws-rekognition.ts already contains OIDC wiring unexpectedly."
    }

    $rekognitionImportMarker =
        '} from "@aws-sdk/client-sts";'

    $rekognitionImportInsertion =
        $rekognitionNl +
        $rekognitionNl +
        'import {' +
        $rekognitionNl +
        '  getVercelOidcAwsCredentials,' +
        $rekognitionNl +
        '} from "../aws/vercel-oidc-credentials";'

    $rekognition =
        Insert-AfterExactlyOnce `
            $rekognition `
            $rekognitionImportMarker `
            $rekognitionImportInsertion `
            "aws-rekognition.ts STS import"

    $rekognitionClientMarker =
        '      new RekognitionClient({' +
        $rekognitionNl +
        '        region:' +
        $rekognitionNl +
        '          config.region,'

    $rekognitionClientInsertion =
        $rekognitionNl +
        '        credentials:' +
        $rekognitionNl +
        '          getVercelOidcAwsCredentials(' +
        $rekognitionNl +
        '            config.region,' +
        $rekognitionNl +
        '          ),'

    $rekognition =
        Insert-AfterExactlyOnce `
            $rekognition `
            $rekognitionClientMarker `
            $rekognitionClientInsertion `
            "aws-rekognition.ts RekognitionClient config"

    $stsClientMarker =
        '      new STSClient({' +
        $rekognitionNl +
        '        region:' +
        $rekognitionNl +
        '          config.region,'

    $stsClientInsertion =
        $rekognitionNl +
        '        credentials:' +
        $rekognitionNl +
        '          getVercelOidcAwsCredentials(' +
        $rekognitionNl +
        '            config.region,' +
        $rekognitionNl +
        '          ),'

    $rekognition =
        Insert-AfterExactlyOnce `
            $rekognition `
            $stsClientMarker `
            $stsClientInsertion `
            "aws-rekognition.ts STSClient config"

    [System.IO.File]::WriteAllText(
        $rekognitionPath,
        $rekognition,
        $Utf8NoBom
    )

    Write-Host "  RekognitionClient credentials:  WIRED"
    Write-Host "  STSClient base credentials:     WIRED"

    Step "Verifying source postconditions"

    $storagePost =
        [System.IO.File]::ReadAllText(
            $storagePath
        )

    $rekognitionPost =
        [System.IO.File]::ReadAllText(
            $rekognitionPath
        )

    $storageCount =
        (
            [regex]::Matches(
                $storagePost,
                "getVercelOidcAwsCredentials"
            )
        ).Count

    $rekognitionCount =
        (
            [regex]::Matches(
                $rekognitionPost,
                "getVercelOidcAwsCredentials"
            )
        ).Count

    if ($storageCount -ne 2) {
        Fail "storage.ts OIDC postcondition failed: expected 2 references, found $storageCount."
    }

    if ($rekognitionCount -ne 3) {
        Fail "aws-rekognition.ts OIDC postcondition failed: expected 3 references, found $rekognitionCount."
    }

    if (
        -not (
            $rekognitionPost.Contains(
                "AssumeRoleCommand"
            )
        ) -or
        -not (
            $rekognitionPost.Contains(
                "CASA_AWS_LIVENESS_STREAM_ROLE_ARN"
            )
        )
    ) {
        Fail "Existing Face Liveness stream-role assumption path was not preserved."
    }

    if (
        -not (
            $storagePost.Contains(
                'from "../aws/vercel-oidc-credentials";'
            )
        ) -or
        -not (
            $rekognitionPost.Contains(
                'from "../aws/vercel-oidc-credentials";'
            )
        )
    ) {
        Fail "Relative OIDC helper imports were not written exactly."
    }

    Write-Host "  S3 OIDC injection:              VERIFIED"
    Write-Host "  Rekognition OIDC injection:     VERIFIED"
    Write-Host "  STS base OIDC injection:        VERIFIED"
    Write-Host "  liveness stream-role path:      PRESERVED"

    Step "Running TypeScript verification"

    Invoke-CheckedNpm `
        @(
            "run",
            "typecheck"
        ) `
        "npm run typecheck"

    Write-Host "  typecheck:                      GREEN"

    Step "Running production build verification"

    Invoke-CheckedNpm `
        @(
            "run",
            "build"
        ) `
        "npm run build"

    Write-Host "  production build:               GREEN"

    Step "Capturing recovery evidence"

    $result =
        [ordered]@{
            createdAt =
                (Get-Date -Format o)
            proof =
                "CASA_VERCEL_OIDC_AWS_RUNTIME_SOURCE_WIRING_V1R2_RECOVERY"
            sourceAuthorityBeforePatch =
                "$branch/$head"
            migrations =
                $migrationCount
            recoveredFrom =
                "V1_PACKAGE_AND_HELPER_CREATED__AWS_CLIENT_FILES_UNCHANGED"
            dependency =
                "$OidcPackage@$OidcPackageVersion"
            postHashes =
                [ordered]@{
                    helper =
                        (
                            Get-FileHash `
                                -LiteralPath $helperPath `
                                -Algorithm SHA256
                        ).Hash.ToLowerInvariant()
                    storage =
                        (
                            Get-FileHash `
                                -LiteralPath $storagePath `
                                -Algorithm SHA256
                        ).Hash.ToLowerInvariant()
                    rekognition =
                        (
                            Get-FileHash `
                                -LiteralPath $rekognitionPath `
                                -Algorithm SHA256
                        ).Hash.ToLowerInvariant()
                    package =
                        (
                            Get-FileHash `
                                -LiteralPath $packagePath `
                                -Algorithm SHA256
                        ).Hash.ToLowerInvariant()
                    packageLock =
                        (
                            Get-FileHash `
                                -LiteralPath $packageLockPath `
                                -Algorithm SHA256
                        ).Hash.ToLowerInvariant()
                }
            behavior =
                [ordered]@{
                    localDefaultCredentialChainPreserved =
                        $true
                    vercelOidcRoleEnv =
                        "AWS_ROLE_ARN"
                    oidcAudience =
                        "sts.amazonaws.com"
                    s3UsesOidcProvider =
                        $true
                    rekognitionUsesOidcProvider =
                        $true
                    stsUsesOidcProvider =
                        $true
                    livenessStreamRoleAssumptionPreserved =
                        $true
                }
            validation =
                [ordered]@{
                    typecheck =
                        "GREEN"
                    productionBuild =
                        "GREEN"
                }
            mutations =
                [ordered]@{
                    source =
                        $true
                    npmInstall =
                        $false
                    packageManifest =
                        $false
                    packageLock =
                        $false
                    awsIam =
                        $false
                    s3 =
                        $false
                    vercelEnvironment =
                        $false
                    database =
                        $false
                    migration =
                        $false
                    deployment =
                        $false
                }
        }

    [System.IO.File]::WriteAllText(
        (
            Join-Path `
                $backup `
                "RESULT.json"
        ),
        (
            $result |
            ConvertTo-Json -Depth 12
        ),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA VERCEL OIDC AWS RUNTIME SOURCE WIRING V1R2 RECOVERY IS GREEN" -ForegroundColor Green
    Write-Host "  source authority before patch:  $branch/$head"
    Write-Host "  migrations:                     $migrationCount / UNCHANGED"
    Write-Host "  V1 package/helper partial state:RECOVERED"
    Write-Host "  npm install in V1R2:            NONE"
    Write-Host "  OIDC dependency:                $OidcPackage@$OidcPackageVersion / VERIFIED"
    Write-Host "  S3 credential path:             Vercel OIDC on Vercel / default chain locally"
    Write-Host "  Rekognition credential path:    Vercel OIDC on Vercel / default chain locally"
    Write-Host "  STS credential path:            Vercel OIDC on Vercel / default chain locally"
    Write-Host "  Face Liveness stream role:      PRESERVED"
    Write-Host "  typecheck:                      GREEN"
    Write-Host "  production build:               GREEN"
    Write-Host "  AWS IAM/S3 mutation:            NONE"
    Write-Host "  Vercel env/deployment mutation: NONE"
    Write-Host "  DB/migration mutation:          NONE"
    Write-Host "  recovery evidence:              $backup"
    Write-Host ""
    Write-Host "NEXT: return this complete output. If GREEN, the source side is ready for the guarded Vercel OIDC provider + least-privilege Staging/Production IAM binding." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL OIDC AWS RUNTIME SOURCE WIRING V1R2 RECOVERY STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No npm install, AWS IAM/S3, Vercel environment/deployment, DB, or migration mutation was authorized by this recovery installer."
    throw
}
