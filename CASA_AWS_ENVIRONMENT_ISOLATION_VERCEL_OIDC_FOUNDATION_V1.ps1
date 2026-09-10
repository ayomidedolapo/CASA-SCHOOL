param(
  [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedPackageLockHash = "1f031c58be57c0525d535881d1287666c8c059292cea9111d88ef6b8e94f7a15"
$ExpectedAwsHash = "d43673976f21fd9200a67972b903fce38ba89d2407b19b6d2f094aa0871bb940"
$VercelFunctionsVersion = "3.9.6"

$AwsRelative = "src\server\biometrics\aws-rekognition.ts"
$StorageRelative = "src\server\card-production\storage.ts"
$CredentialRelative = "src\server\aws\runtime-credentials.ts"
$SelftestRelative = "scripts\aws-environment-isolation-selftest.ts"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$Evidence = $null
$Backups = @{}
$WriteStarted = $false
$Validated = $false

function Stop-Phase([string]$Message) { throw "ABORTED: $Message" }
function Step([string]$Message) { Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Sha([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Stop-Phase "Missing file: $Path" }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Run-Native([string]$Label,[scriptblock]$Action) {
  & $Action
  if ($LASTEXITCODE -ne 0) { Stop-Phase "$Label failed with exit code $LASTEXITCODE." }
  Write-Host "  ${Label}: PASS"
}
function Backup-File([string]$Relative) {
  $source = Join-Path $ProjectRoot $Relative
  $safe = $Relative -replace '[\\/\[\]:]', '_'
  $dest = Join-Path $Evidence ($safe + ".before")
  Copy-Item -LiteralPath $source -Destination $dest -Force
  $script:Backups[$Relative] = $dest
}
function Restore-Source {
  if (-not $script:WriteStarted -or $script:Validated) { return }
  Write-Host ""; Write-Host "==> Rolling back incomplete source patch" -ForegroundColor Yellow
  foreach ($relative in $script:Backups.Keys) {
    $dest = Join-Path $ProjectRoot $relative
    Copy-Item -LiteralPath ([string]$script:Backups[$relative]) -Destination $dest -Force
    Write-Host "  restored: $relative"
  }
  foreach ($relative in @($CredentialRelative,$SelftestRelative)) {
    $path = Join-Path $ProjectRoot $relative
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
      Write-Host "  removed: $relative"
    }
  }
  Write-Host "  AWS resources: NOT TOUCHED"
  Write-Host "  databases: NOT TOUCHED"
}

Write-Host "CASA School - AWS Environment Isolation + Vercel OIDC Source Foundation V1" -ForegroundColor Green
Write-Host "Source only. Preserves Development AWS behavior, adds environment-scoped Rekognition collections and Vercel OIDC credentials."
Write-Host "No AWS resource mutation. No DB connection/mutation. No deployment. No static AWS keys."

try {
  Step "Locking current CASA authority"
  if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { Stop-Phase "Repository not found." }
  Set-Location $ProjectRoot
  foreach ($cmd in @("git","node","npm","npx")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Stop-Phase "$cmd is unavailable." }
  }

  $branch = (& git branch --show-current).Trim()
  $head = (& git rev-parse --short HEAD).Trim()
  if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) { Stop-Phase "Git checkpoint drift: $branch/$head" }

  $packagePath = Join-Path $ProjectRoot "package.json"
  $lockPath = Join-Path $ProjectRoot "package-lock.json"
  $awsPath = Join-Path $ProjectRoot $AwsRelative
  $storagePath = Join-Path $ProjectRoot $StorageRelative
  $credentialPath = Join-Path $ProjectRoot $CredentialRelative
  $selftestPath = Join-Path $ProjectRoot $SelftestRelative

  if ((Sha $packagePath) -ne $ExpectedPackageHash) { Stop-Phase "package.json checksum drift." }
  if ((Sha $lockPath) -ne $ExpectedPackageLockHash) { Stop-Phase "package-lock.json checksum drift." }
  if ((Sha $awsPath) -ne $ExpectedAwsHash) { Stop-Phase "aws-rekognition.ts checksum drift." }
  if (-not (Test-Path -LiteralPath $storagePath -PathType Leaf)) { Stop-Phase "storage.ts missing." }
  if (Test-Path -LiteralPath $credentialPath) { Stop-Phase "$CredentialRelative already exists." }
  if (Test-Path -LiteralPath $selftestPath) { Stop-Phase "$SelftestRelative already exists." }

  $migrations = @(
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Recurse -File -Filter "migration.sql" |
      Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.FullName -notmatch '[\\/]\.casa-backups[\\/]' }
  )
  if ($migrations.Count -ne 30) { Stop-Phase "Expected 30 migrations; found $($migrations.Count)." }

  $awsText = Get-Content -LiteralPath $awsPath -Raw
  foreach ($marker in @(
    "export function awsCollectionIdForSchool(",
    "function getAwsBiometricConfig()",
    "function getClients()",
    "async function ensureCollection(",
    "new RekognitionClient({",
    "new STSClient({"
  )) { if (-not $awsText.Contains($marker)) { Stop-Phase "AWS patch anchor missing: $marker" } }

  $storageText = Get-Content -LiteralPath $storagePath -Raw
  foreach ($marker in @("function getStorage()","new S3Client({","CASA_CARD_STORAGE_BUCKET","CASA_CARD_STORAGE_REGION")) {
    if (-not $storageText.Contains($marker)) { Stop-Phase "Storage patch anchor missing: $marker" }
  }

  Write-Host "  branch/head:                    $branch/$head"
  Write-Host "  migrations:                     30 / VERIFIED"
  Write-Host "  package/lock/AWS source:        EXACT"
  Write-Host "  Development AWS mutation:       NONE"

  Step "Creating rollback evidence"
  & git check-ignore -q -- ".casa-backups"
  if ($LASTEXITCODE -ne 0) { Stop-Phase ".casa-backups is not Git-ignored." }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $Evidence = Join-Path $ProjectRoot ".casa-backups\aws-environment-isolation-oidc-foundation-v1-$stamp"
  New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
  foreach ($relative in @("package.json","package-lock.json",$AwsRelative,$StorageRelative)) { Backup-File $relative }
  Write-Host "  evidence: $Evidence"

  Step "Installing exact Vercel OIDC runtime package"
  $WriteStarted = $true
  Run-Native "npm install @vercel/functions@$VercelFunctionsVersion" {
    & npm install "@vercel/functions@$VercelFunctionsVersion" --save-exact
  }
  $pkg = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  if ([string]$pkg.dependencies."@vercel/functions" -ne $VercelFunctionsVersion) {
    Stop-Phase "@vercel/functions is not pinned exactly to $VercelFunctionsVersion."
  }

  Step "Applying environment isolation + OIDC source patch"
  $patcherPath = Join-Path $Evidence "patch.mjs"
  $patcher = @'
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("root missing");
const full = (p) => path.join(root, ...p.split(/[\\/]/));
const awsPath = full("src/server/biometrics/aws-rekognition.ts");
const storagePath = full("src/server/card-production/storage.ts");
const credentialPath = full("src/server/aws/runtime-credentials.ts");
const selftestPath = full("scripts/aws-environment-isolation-selftest.ts");
const read = (p) => fs.readFileSync(p, "utf8");
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s.replace(/\r\n/g, "\n"), "utf8");
};
const fail = (m) => { throw new Error(m); };

write(credentialPath, `import {
  awsCredentialsProvider,
} from "@vercel/functions/oidc";

export function casaAwsRuntimeCredentials(
  region?: string,
) {
  const isVercel =
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV);

  if (!isVercel) {
    return undefined;
  }

  const roleArn =
    process.env
      .CASA_AWS_RUNTIME_ROLE_ARN
      ?.trim();

  if (!roleArn) {
    throw new Error(
      "CASA_AWS_RUNTIME_ROLE_ARN_REQUIRED_ON_VERCEL",
    );
  }

  return awsCredentialsProvider({
    roleArn,
    ...(region
      ? { clientConfig: { region } }
      : {}),
  });
}
`);

let aws = read(awsPath);
if (aws.includes("@/server/aws/runtime-credentials")) fail("AWS helper already imported");
aws = `import {
  casaAwsRuntimeCredentials,
} from "@/server/aws/runtime-credentials";

` + aws;

const collectionStart = aws.indexOf("export function awsCollectionIdForSchool(");
const collectionEnd = aws.indexOf("function getAwsBiometricConfig()", collectionStart);
if (collectionStart < 0 || collectionEnd <= collectionStart) fail("collection function anchors missing");

const collectionCode = `function awsCollectionPrefix(): string {
  const configured =
    process.env
      .CASA_AWS_REKOGNITION_COLLECTION_PREFIX
      ?.trim()
      .toLowerCase();

  const prefix =
    configured ||
    "casa-school";

  if (
    prefix.length > 222 ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(prefix)
  ) {
    throw new Error(
      "INVALID_AWS_REKOGNITION_COLLECTION_PREFIX",
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
      .replace(/[^a-z0-9]/g, "");

  if (compact.length !== 32) {
    throw new Error(
      "INVALID_SCHOOL_ID_FOR_AWS_COLLECTION",
    );
  }

  return \`\${awsCollectionPrefix()}-\${compact}\`;
}

`;
aws = aws.slice(0, collectionStart) + collectionCode + aws.slice(collectionEnd);

const clientsStart = aws.indexOf("function getClients()");
const clientsEnd = aws.indexOf("async function ensureCollection(", clientsStart);
if (clientsStart < 0 || clientsEnd <= clientsStart) fail("getClients anchors missing");

const clientsCode = `function getClients() {
  const config =
    getAwsBiometricConfig();

  const credentials =
    casaAwsRuntimeCredentials(
      config.region,
    );

  const clientConfig = {
    region:
      config.region,
    ...(credentials
      ? { credentials }
      : {}),
  };

  return {
    config,
    rekognition:
      new RekognitionClient(
        clientConfig,
      ),
    sts:
      new STSClient(
        clientConfig,
      ),
  };
}

`;
aws = aws.slice(0, clientsStart) + clientsCode + aws.slice(clientsEnd);
if ((aws.match(/CASA_AWS_REKOGNITION_COLLECTION_PREFIX/g) ?? []).length !== 1) fail("prefix contract count wrong");
write(awsPath, aws);

let storage = read(storagePath);
if (storage.includes("@/server/aws/runtime-credentials")) fail("Storage helper already imported");
storage = `import {
  casaAwsRuntimeCredentials,
} from "@/server/aws/runtime-credentials";

` + storage;
const s = storage.indexOf("  const client =", storage.indexOf("function getStorage()"));
const e = storage.indexOf("  cached = {", s);
if (s < 0 || e <= s) fail("S3 constructor anchors missing");
const clientCode = `  const credentials =
    casaAwsRuntimeCredentials(
      config.region,
    );

  const client =
    new S3Client({
      region:
        config.region,
      endpoint:
        config.endpoint,
      forcePathStyle:
        config.forcePathStyle,
      ...(credentials
        ? { credentials }
        : {}),
    });

`;
storage = storage.slice(0, s) + clientCode + storage.slice(e);
write(storagePath, storage);

write(selftestPath, `import assert from "node:assert/strict";

import {
  awsCollectionIdForSchool,
} from "../src/server/biometrics/aws-rekognition";
import {
  casaAwsRuntimeCredentials,
} from "../src/server/aws/runtime-credentials";

const school =
  "00000000-0000-4000-8000-000000000001";

const saved = {
  prefix: process.env.CASA_AWS_REKOGNITION_COLLECTION_PREFIX,
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
  role: process.env.CASA_AWS_RUNTIME_ROLE_ARN,
};

const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

try {
  delete process.env.CASA_AWS_REKOGNITION_COLLECTION_PREFIX;
  assert.equal(
    awsCollectionIdForSchool(school),
    "casa-school-00000000000040008000000000000001",
  );

  process.env.CASA_AWS_REKOGNITION_COLLECTION_PREFIX =
    "casa-school-staging";
  assert.equal(
    awsCollectionIdForSchool(school),
    "casa-school-staging-00000000000040008000000000000001",
  );

  process.env.CASA_AWS_REKOGNITION_COLLECTION_PREFIX =
    "casa-school-production";
  assert.equal(
    awsCollectionIdForSchool(school),
    "casa-school-production-00000000000040008000000000000001",
  );

  process.env.CASA_AWS_REKOGNITION_COLLECTION_PREFIX =
    "INVALID PREFIX";
  assert.throws(
    () => awsCollectionIdForSchool(school),
    /INVALID_AWS_REKOGNITION_COLLECTION_PREFIX/,
  );

  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.CASA_AWS_RUNTIME_ROLE_ARN;
  assert.equal(
    casaAwsRuntimeCredentials("eu-west-1"),
    undefined,
  );

  process.env.VERCEL = "1";
  assert.throws(
    () => casaAwsRuntimeCredentials("eu-west-1"),
    /CASA_AWS_RUNTIME_ROLE_ARN_REQUIRED_ON_VERCEL/,
  );

  console.log(
    "CASA AWS environment isolation + Vercel OIDC self-test passed.",
  );
} finally {
  restore("CASA_AWS_REKOGNITION_COLLECTION_PREFIX", saved.prefix);
  restore("VERCEL", saved.vercel);
  restore("VERCEL_ENV", saved.vercelEnv);
  restore("CASA_AWS_RUNTIME_ROLE_ARN", saved.role);
}
`);
console.log("CASA AWS environment-isolation source patch applied.");
'@
  [System.IO.File]::WriteAllText($patcherPath,$patcher,$Utf8NoBom)
  Run-Native "source patcher" { & node $patcherPath $ProjectRoot }

  Step "Proving source contracts"
  $awsAfter = Get-Content -LiteralPath $awsPath -Raw
  $storageAfter = Get-Content -LiteralPath $storagePath -Raw
  $credentialAfter = Get-Content -LiteralPath $credentialPath -Raw

  foreach ($marker in @("CASA_AWS_REKOGNITION_COLLECTION_PREFIX","INVALID_AWS_REKOGNITION_COLLECTION_PREFIX","casaAwsRuntimeCredentials(")) {
    if (-not $awsAfter.Contains($marker)) { Stop-Phase "AWS postcondition missing: $marker" }
  }
  foreach ($marker in @("CASA_CARD_STORAGE_BUCKET","CASA_CARD_STORAGE_REGION","casaAwsRuntimeCredentials(")) {
    if (-not $storageAfter.Contains($marker)) { Stop-Phase "Storage postcondition missing: $marker" }
  }
  foreach ($marker in @('@vercel/functions/oidc',"CASA_AWS_RUNTIME_ROLE_ARN","CASA_AWS_RUNTIME_ROLE_ARN_REQUIRED_ON_VERCEL")) {
    if (-not $credentialAfter.Contains($marker)) { Stop-Phase "Credential helper postcondition missing: $marker" }
  }
  if ($credentialAfter -match "AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY") {
    Stop-Phase "Static AWS credential variables were introduced."
  }

  Write-Host "  Development namespace:            casa-school-<schoolId> / PRESERVED"
  Write-Host "  Staging namespace:                casa-school-staging-<schoolId>"
  Write-Host "  Production namespace:             casa-school-production-<schoolId>"
  Write-Host "  local credential model:           DEFAULT SDK CHAIN / AWS_PROFILE PRESERVED"
  Write-Host "  Vercel credential model:          OIDC / SHORT-LIVED / FAIL-CLOSED"

  Step "Running regression gates"
  Run-Native "AWS environment-isolation self-test" { & npx tsx $SelftestRelative }
  Run-Native "typecheck" { & npm run typecheck }
  Run-Native "Scanner self-test" { & npm run scanner:selftest }
  Run-Native "student-card self-test" { & npm run card:selftest }
  Run-Native "Pass A self-test" { & npx tsx scripts/pass-a-selftest.ts }
  Run-Native "pending recovery self-test" { & npx tsx scripts/scanner-pending-attempt-recovery-selftest.ts }

  Step "Running production build"
  Run-Native "npm run build" { & npm run build }

  Step "Final integrity proof"
  & git diff --check
  if ($LASTEXITCODE -ne 0) { Stop-Phase "git diff --check failed." }
  $migrationCount = @(
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Recurse -File -Filter "migration.sql" |
      Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.FullName -notmatch '[\\/]\.casa-backups[\\/]' }
  ).Count
  if ($migrationCount -ne 30) { Stop-Phase "Migration count changed." }

  $result = [ordered]@{
    createdAt = (Get-Date -Format o)
    proof = "CASA_AWS_ENVIRONMENT_ISOLATION_VERCEL_OIDC_FOUNDATION_V1"
    branch = $branch
    head = $head
    migrations = 30
    vercelFunctionsVersion = $VercelFunctionsVersion
    developmentCollectionPrefix = "casa-school"
    stagingCollectionPrefix = "casa-school-staging"
    productionCollectionPrefix = "casa-school-production"
    hostedCredentialModel = "VERCEL_OIDC_SHORT_LIVED"
    runtimeRoleEnv = "CASA_AWS_RUNTIME_ROLE_ARN"
    awsRekognitionSha256 = (Sha $awsPath)
    cardStorageSha256 = (Sha $storagePath)
    runtimeCredentialsSha256 = (Sha $credentialPath)
    packageJsonSha256 = (Sha $packagePath)
    packageLockSha256 = (Sha $lockPath)
    awsResourceMutation = $false
    databaseMutation = $false
    deploymentMutation = $false
    productionConnected = $false
  }
  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $Evidence "RESULT.json") -Encoding UTF8

  $Validated = $true

  Write-Host ""
  Write-Host "CASA AWS ENVIRONMENT ISOLATION + VERCEL OIDC SOURCE FOUNDATION V1 IS GREEN" -ForegroundColor Green
  Write-Host "  source authority:                $branch/$head"
  Write-Host "  migrations:                      30 / UNCHANGED"
  Write-Host "  Development Rekognition prefix:  casa-school / PRESERVED"
  Write-Host "  Staging Rekognition prefix:      casa-school-staging"
  Write-Host "  Production Rekognition prefix:   casa-school-production"
  Write-Host "  Development credential chain:    EXISTING AWS_PROFILE / PRESERVED"
  Write-Host "  hosted credential model:         VERCEL OIDC / SHORT-LIVED"
  Write-Host "  S3 + Rekognition OIDC support:   INSTALLED"
  Write-Host "  static AWS keys:                 NONE"
  Write-Host "  typecheck/regressions/build:     PASS"
  Write-Host "  AWS resource mutation:           NONE"
  Write-Host "  DB mutation:                     NONE"
  Write-Host "  Production:                      NOT CONNECTED"
  Write-Host "  evidence:                        $Evidence"
  Write-Host ""
  Write-Host "NEXT: return this complete GREEN output. Then we provision isolated Staging + Production S3/IAM boundaries." -ForegroundColor Yellow
}
catch {
  Restore-Source
  Write-Host ""
  Write-Host "CASA AWS ENVIRONMENT ISOLATION + VERCEL OIDC SOURCE FOUNDATION V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  if ($Evidence) { Write-Host "Evidence: $Evidence" }
  throw
}
