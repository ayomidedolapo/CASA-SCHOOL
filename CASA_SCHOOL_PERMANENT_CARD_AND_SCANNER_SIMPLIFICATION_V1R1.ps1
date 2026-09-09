param(
  [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedMigrationCount = 30
$ExpectedMigration29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$ExpectedMigration30Hash = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"
$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedAwsLivenessHash = "a1bd8db909b88ba9f0c4f3e03199ad24521acb161e84b49bb9ca0f54cc451a2f"
$ExpectedScannerHash = "bae161ca1d8ad1d5ccb4c24e477ff8e8f980f93dce2ac7042678b65a391fbf90"
$ExpectedScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
$ExpectedInstallControlHash = "46dcd22acc5230eb2c6afcef96c857a07cc0049461d30c478ffbf7e5cc066075"

$ExpectedSourceHashes = [ordered]@{
  "src\server\school-operations\progression.ts" = "be209773078201502f225244d62517a32adaeddce077537419b67118c335c8bd"
  "src\server\card-production\renewal-production.ts" = "727534f212e35aefa58e3096f6618f16f72c7258e2093abd664f60843146c77d"
  "src\server\card-production\render.ts" = "40551fcc8229c416089e75872e364a1edaf79ddc5e695542993f5426120a1208"
  "src\server\card-production\template-layout.ts" = "8775abe86433e52d18efe53beccf46e45e810fcc32ab5f7ac327c9d38960115c"
  "src\app\api\internal\card-production\templates\route.ts" = "4d555243e647f41dc593b33f0e77cf54d10ad1d20829b35cf094f4ae41cdf0a0"
  "src\app\schools\[slug]\registry\student-cards.tsx" = "e6cae0450bd18b82e646cd0c3f22279a8b09710bbba4e1fbe5fd1b4f88f66e9a"
  "scripts\pass-a-selftest.ts" = "acc657e3e93d6480cd1e56b23eb670243450568bd6f26edb75f2ea3832810ae2"
}

$WriteStarted = $false
$ValidationPassed = $false
$Evidence = $null
$BackupRoot = $null
$Backups = @{}
$PatcherPath = $null
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Stop-Phase([string]$Message) {
  throw "ABORTED: $Message"
}

function Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Stop-Phase "Required file missing: $Path"
  }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Backup-File([string]$Path) {
  $relative = $Path.Substring($ProjectRoot.Length).TrimStart('\','/')
  $destination = Join-Path $BackupRoot $relative
  $parent = Split-Path -Parent $destination
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Copy-Item -LiteralPath $Path -Destination $destination -Force
  $script:Backups[$Path] = $destination
}

function Restore-Backups {
  if (-not $script:WriteStarted -or $script:ValidationPassed) {
    return
  }
  Write-Host ""
  Write-Host "==> Rolling back permanent-card/scanner source writes" -ForegroundColor Yellow
  foreach ($path in $script:Backups.Keys) {
    $backup = [string]$script:Backups[$path]
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Copy-Item -LiteralPath $backup -Destination $path -Force
    }
  }
  Write-Host "  source rollback complete"
}

function Run-Native(
  [string]$Label,
  [string]$Command,
  [string[]]$Arguments
) {
  Write-Host ""
  Write-Host "  $Label"
  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& $Command @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $oldPreference
  }
  foreach ($line in $output) {
    Write-Host ([string]$line)
  }
  if ($exitCode -ne 0) {
    Stop-Phase "$Label failed with exit code $exitCode."
  }
}

function Run-IfPresent([string]$Relative, [string]$Label) {
  $path = Join-Path $ProjectRoot $Relative
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    Run-Native $Label "npx.cmd" @("tsx", $Relative.Replace('\','/'))
  }
}

try {
  Write-Host "CASA School - Permanent Card + Scanner Simplification V1R1" -ForegroundColor Green
  Write-Host "Source-only product adjustment against the exact Pass A Development-green checkpoint."
  Write-Host "Student physical cards become long-lived identity credentials: no class/session renewal."
  Write-Host "Scanner removes installed-state badges and the Card/Face/Time/Done progress rail only."
  Write-Host "No DB, migration, AWS, attendance, Staging, or Production mutation."
  Write-Host "The pending failed Scanner attempt is NOT touched and must NOT be rescanned by this script."

  if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    Stop-Phase "CASA repository not found: $ProjectRoot"
  }
  Set-Location $ProjectRoot

  Step "Re-proving exact Pass A Development-green source boundary"

  $branch = (& git branch --show-current).Trim()
  $head = (& git rev-parse --short HEAD).Trim()
  if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
    Stop-Phase "Git checkpoint drift: $branch/$head"
  }

  $migrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Filter "migration.sql" -File -Recurse)
  if ($migrationFiles.Count -ne $ExpectedMigrationCount) {
    Stop-Phase "Expected $ExpectedMigrationCount local migrations; found $($migrationFiles.Count)."
  }

  $m29 = Join-Path $ProjectRoot "drizzle\20260909020000_pass-a-enum-expansion\migration.sql"
  $m30 = Join-Path $ProjectRoot "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql"
  if ((Sha $m29) -ne $ExpectedMigration29Hash) { Stop-Phase "Migration 29 checksum drift." }
  if ((Sha $m30) -ne $ExpectedMigration30Hash) { Stop-Phase "Recovered migration 30 checksum drift." }

  $packagePath = Join-Path $ProjectRoot "package.json"
  $awsPath = Join-Path $ProjectRoot "src\server\biometrics\aws-liveness.ts"
  $scannerPath = Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
  $scannerCssPath = Join-Path $ProjectRoot "src\app\scanner\scanner.module.css"
  $installControlPath = Join-Path $ProjectRoot "src\app\scanner\scanner-install-control.tsx"

  if ((Sha $packagePath) -ne $ExpectedPackageHash) { Stop-Phase "package.json drift." }
  if ((Sha $awsPath) -ne $ExpectedAwsLivenessHash) { Stop-Phase "AWS liveness source drift." }
  if ((Sha $scannerPath) -ne $ExpectedScannerHash) { Stop-Phase "Scanner source drift." }
  if ((Sha $scannerCssPath) -ne $ExpectedScannerCssHash) { Stop-Phase "Scanner CSS drift." }
  if ((Sha $installControlPath) -ne $ExpectedInstallControlHash) { Stop-Phase "Scanner install-control drift." }

  foreach ($relative in $ExpectedSourceHashes.Keys) {
    $path = Join-Path $ProjectRoot $relative
    $actual = Sha $path
    if ($actual -ne [string]$ExpectedSourceHashes[$relative]) {
      Stop-Phase "Pass A source drift: $relative expected=$($ExpectedSourceHashes[$relative]) actual=$actual"
    }
  }

  Write-Host "  branch/head:                    $branch/$head"
  Write-Host "  migrations:                     30 / VERIFIED"
  Write-Host "  migration 30 recovery:          VERIFIED"
  Write-Host "  Pass A target preimages:        7 / VERIFIED"
  Write-Host "  Scanner client/CSS:             EXACT / VERIFIED"
  Write-Host "  Scanner install control:        EXACT / VERIFIED"
  Write-Host "  AWS liveness source:            BYTE-FOR-BYTE LOCKED"

  Step "Creating guarded source backup"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $Evidence = Join-Path $ProjectRoot ".casa-backups\permanent-card-scanner-simplification-v1r1-$stamp"
  $BackupRoot = Join-Path $Evidence "before"
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

  $targets = New-Object System.Collections.Generic.List[string]
  foreach ($relative in $ExpectedSourceHashes.Keys) {
    [void]$targets.Add((Join-Path $ProjectRoot $relative))
  }
  [void]$targets.Add($scannerPath)
  [void]$targets.Add($installControlPath)

  $frontendSelftestPath = Join-Path $ProjectRoot "scripts\frontend-closure-selftest.ts"
  if (Test-Path -LiteralPath $frontendSelftestPath -PathType Leaf) {
    [void]$targets.Add($frontendSelftestPath)
  }

  foreach ($target in $targets) {
    Backup-File $target
  }
  Write-Host "  backup: $Evidence"

  Step "Applying permanent-card and Scanner simplification source patch"

  $PatcherPath = Join-Path $Evidence "apply-permanent-card-scanner-v1r1.mjs"
  $patcher = @'
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const full = (relative) => path.join(root, ...relative.split("/"));
const read = (relative) => fs.readFileSync(full(relative), "utf8");
const write = (relative, value) => fs.writeFileSync(full(relative), value, "utf8");
const sha = (relative) => crypto.createHash("sha256").update(fs.readFileSync(full(relative))).digest("hex");
const fail = (message) => { throw new Error(message); };

function replaceUnique(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) fail(`${label}: expected source fragment not found`);
  if (source.indexOf(before, first + before.length) >= 0) fail(`${label}: source fragment is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceRegexUnique(source, regex, replacement, label) {
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) fail(`${label}: expected exactly one match; found ${matches.length}`);
  return source.replace(regex, replacement);
}

function functionBodyRange(source, functionName) {
  const marker = `export async function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) fail(`${functionName}: function marker not found`);
  let paren = source.indexOf("(", start);
  let depth = 0;
  let quote = null;
  let escape = false;
  for (let i = paren; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        const open = source.indexOf("{", i);
        if (open < 0) fail(`${functionName}: body opening brace missing`);
        let braceDepth = 0;
        let bodyQuote = null;
        let bodyEscape = false;
        for (let j = open; j < source.length; j++) {
          const c = source[j];
          if (bodyQuote) {
            if (bodyEscape) { bodyEscape = false; continue; }
            if (c === "\\") { bodyEscape = true; continue; }
            if (c === bodyQuote) bodyQuote = null;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") { bodyQuote = c; continue; }
          if (c === "{") braceDepth++;
          else if (c === "}") {
            braceDepth--;
            if (braceDepth === 0) return { open, close: j };
          }
        }
      }
    }
  }
  fail(`${functionName}: body boundary not found`);
}

// 1) Progression remains academic-only. It must never create physical-card renewals.
{
  let source = read("src/server/school-operations/progression.ts");
  const start = source.indexOf("        renewal_batch as (");
  const end = source.indexOf("        integrity as (", start);
  if (start < 0 || end < 0) fail("progression: renewal CTE boundary not found");
  source = source.slice(0, start) + source.slice(end);

  source = replaceRegexUnique(
    source,
    /            \(\r?\n              select count\(\*\)::int\r?\n              from renewal_items\r?\n            \) as renewal_item_count,\r?\n/g,
    "",
    "progression renewal_item_count"
  );

  source = replaceRegexUnique(
    source,
    /            \(\r?\n              select count\(\*\)::int\r?\n              from reviewed\r?\n              where decision in \(\r?\n                'PROMOTED'::student_progression_decision,\r?\n                'RETAINED'::student_progression_decision,\r?\n                'TRANSFERRED'::student_progression_decision\r?\n              \)\r?\n                and target_class_arm_id is not null\r?\n                and source_class_arm_id <> target_class_arm_id\r?\n            \) as expected_renewals,\r?\n/g,
    "",
    "progression expected_renewals"
  );

  source = replaceRegexUnique(
    source,
    /            and integrity\.renewal_item_count =\r?\n              integrity\.expected_renewals\r?\n/g,
    "",
    "progression renewal confirmation guard"
  );

  source = replaceUnique(source, "        renewal_item_count: number;\n", "", "progression result renewal field");
  source = replaceUnique(source, "        expected_renewals: number;\n", "", "progression expected renewal field");
  source = replaceRegexUnique(
    source,
    /      renewalItems:\r?\n        Number\(\r?\n          row\.renewal_item_count,\r?\n        \),/g,
    "      renewalItems:\n        0,",
    "progression compatibility return"
  );

  if (/student_card_renewal_batches|student_card_renewal_batch_items|'CLASS_CHANGE'::student_card_renewal_reason/.test(source)) {
    fail("progression: routine physical-card renewal residue remains");
  }
  write("src/server/school-operations/progression.ts", source);
}

// 2) Legacy renewal endpoints stay import-compatible but fail closed.
{
  let source = read("src/server/card-production/renewal-production.ts");
  const message = "Student cards are long-lived identity credentials. Class and academic-session changes are digital only; use the exceptional replacement flow only for a lost, damaged, revoked, or compromised physical card.";
  for (const name of ["produceStudentCardRenewalItem", "produceStudentCardRenewalBatch"]) {
    const { open } = functionBodyRange(source, name);
    const gate = `
  return {
    ok: false as const,
    status: 409 as const,
    code:
      "ROUTINE_CARD_RENEWAL_DISABLED",
    message:
      ${JSON.stringify(message)},
  };
`;
    source = source.slice(0, open + 1) + gate + source.slice(open + 1);
  }
  const disabledCount = (source.match(/ROUTINE_CARD_RENEWAL_DISABLED/g) ?? []).length;
  if (disabledCount !== 2) fail(`renewal-production: expected 2 disabled entrypoints; found ${disabledCount}`);
  write("src/server/card-production/renewal-production.ts", source);
}

// 3) CLASS and ACADEMIC_SESSION are digital-only, including legacy templates.
{
  let source = read("src/server/card-production/render.ts");
  source = replaceRegexUnique(
    source,
    /      CLASS:\r?\n        snapshot\.className \?\?\r?\n        "",/g,
    '      CLASS:\n        "",',
    "render CLASS suppression"
  );
  source = replaceRegexUnique(
    source,
    /      \.filter\(\r?\n        \(item\) =>\r?\n          item\.source !==\r?\n          "ACADEMIC_SESSION",\r?\n      \)/g,
    `      .filter(
        (item) =>
          item.source !==
            "ACADEMIC_SESSION" &&
          item.source !==
            "CLASS",
      )`,
    "render changing-field legacy filter"
  );
  write("src/server/card-production/render.ts", source);
}

// 4) New card templates may not register changing academic fields.
{
  let source = read("src/app/api/internal/card-production/templates/route.ts");
  const anchor = "  const containsAcademicSession =\n";
  if (!source.includes(anchor)) fail("template route: Academic Session validation anchor missing");
  const classGuard = `  const containsClass =
    [
      ...body.data.layout.frontText,
      ...body.data.layout.backText,
    ].some(
      (item) =>
        item.source ===
          "CLASS",
    );

  if (containsClass) {
    return NextResponse.json(
      {
        message:
          "Class is digital-only for CASA long-lived student cards. Remove CLASS from the physical template layout.",
        code:
          "CARD_TEMPLATE_CLASS_FORBIDDEN",
      },
      {
        status: 409,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

`;
  source = replaceUnique(source, anchor, classGuard + anchor, "template CLASS guard");
  write("src/app/api/internal/card-production/templates/route.ts", source);
}

// 5) Registry wording makes replacement exceptional, never academic progression.
{
  let source = read("src/app/schools/[slug]/registry/student-cards.tsx");
  const replacements = [
    ["Enter a clear reason before card reissue.", "Enter a clear lost, damaged, or security reason before card replacement."],
    ["Reissue with Passkey", "Replace card with Passkey"],
    ["Card action reason", "Replacement / status reason"],
    ["Required for reissue; optional for status changes", "Required for lost/damaged/security replacement; optional for status changes"],
    ["Replacement card rendered and queued for CASA production.", "Exceptional replacement card rendered and queued for CASA production."]
  ];
  for (const [before, after] of replacements) {
    source = replaceUnique(source, before, after, `student-cards wording: ${before}`);
  }

  const oldCopy = `            CASA renders the personalized card server-side. The reusable QR
            credential is never returned to this browser or stored for later
            printing.`;
  const newCopy = `            CASA renders the personalized card server-side. The reusable QR
            credential is never returned to this browser or stored for later
            printing. This physical card remains valid across class and
            academic-session changes; those details stay authoritative in CASA
            digitally. Replace the card only if it is lost, damaged, revoked,
            or otherwise compromised.`;
  source = replaceUnique(source, oldCopy, newCopy, "student-cards permanent-card explanation");
  write("src/app/schools/[slug]/registry/student-cards.tsx", source);
}

// 6) Scanner: remove local install-status UI + 01 Card / 02 Face / 03 Time / 04 Done rail.
//    Camera, front/rear switching, QR scan, face/liveness and attendance logic stay untouched.
{
  let source = read("src/app/scanner/scanner-client.tsx");

  const installTypeStart = source.indexOf("type ScannerBeforeInstallPromptEvent =");
  const cameraTypeStart = source.indexOf("type CameraFacing =", installTypeStart);
  if (installTypeStart >= 0 && cameraTypeStart > installTypeStart) {
    source = source.slice(0, installTypeStart) + source.slice(cameraTypeStart);
  }

  const componentStart = source.indexOf("function ScannerInstallControl(");
  const qrStart = source.indexOf("function QrCamera(", componentStart);
  if (componentStart < 0 || qrStart <= componentStart) {
    fail("scanner: premium install/stage component boundary not found");
  }
  const removedBlock = source.slice(componentStart, qrStart);
  if (!removedBlock.includes("function ScannerStageRail(")) {
    fail("scanner: stage rail is not inside expected removable premium block");
  }
  source = source.slice(0, componentStart) + source.slice(qrStart);

  source = replaceRegexUnique(
    source,
    /<ScannerInstallControl\s*\/>/g,
    "",
    "scanner local install control invocation"
  );
  source = replaceRegexUnique(
    source,
    /<ScannerStageRail[\s\S]*?\/>/g,
    "",
    "scanner stage rail invocation"
  );

  // Component removal can leave indentation-only lines where JSX used to live.
  // Preserve all substantive Scanner bytes/logic while making the resulting diff
  // whitespace-clean for the repository's fail-closed git diff --check gate.
  source = source
    .split(/\r?\n/)
    .map((line) => (/^[\t ]+$/.test(line) ? "" : line))
    .join("\n");

  for (const forbidden of ["ScannerStageRail", "01Card", "02Face", "03Time", "04Done", "Installed app", "Installed terminal app"]) {
    if (source.includes(forbidden)) fail(`scanner: unwanted UI marker remains: ${forbidden}`);
  }
  for (const required of [
    "createScannerRequestId",
    '"/api/terminal/scan"',
    "FaceLivenessDetectorCore",
    "cameraFacing",
    "Front camera",
    "wakeLockRef",
    '"/scanner-sw.js"',
    "Identity verified attendance",
    "Scan student card.",
    "Hold your CASA student card in front of the camera."
  ]) {
    if (!source.includes(required)) fail(`scanner: protected focus/trust marker missing after simplification: ${required}`);
  }
  write("src/app/scanner/scanner-client.tsx", source);
}

// 7) Scanner-scoped PWA install control remains available before installation,
//    but shows no "Scanner installed" badge once installed.
{
  let source = read("src/app/scanner/scanner-install-control.tsx");
  source = replaceRegexUnique(
    source,
    /  if \(installed\) \{\r?\n    return \(\r?\n      <div[\s\S]*?Scanner installed[\s\S]*?    \);\r?\n  \}/g,
    `  if (installed) {
    return null;
  }`,
    "scanner installed-state badge"
  );
  if (source.includes("Scanner installed")) fail("install control: visible installed badge remains");
  if (!source.includes("beforeinstallprompt") || !source.includes("Install Scanner")) {
    fail("install control: installability behavior was lost");
  }
  write("src/app/scanner/scanner-install-control.tsx", source);
}

// 8) Pass A source contract now asserts the permanent-card model.
{
  let source = read("scripts/pass-a-selftest.ts");
  const start = source.indexOf('const progression = read("src/server/school-operations/progression.ts");');
  const end = source.indexOf("const cardProductionSources = [", start);
  if (start < 0 || end < 0) fail("Pass A selftest permanent-card section boundary missing");
  const replacement = `const progression = read("src/server/school-operations/progression.ts");
assert(!progression.includes("student_card_renewal_batches"), "progression still creates a physical-card renewal batch");
assert(!progression.includes("student_card_renewal_batch_items"), "progression still creates physical-card renewal items");
assert(!progression.includes("'CLASS_CHANGE'::student_card_renewal_reason"), "class progression still triggers physical-card renewal");
assert(progression.includes("renewalItems:\\n        0"), "progression compatibility response does not report zero routine renewals");

const renewal = read("src/server/card-production/renewal-production.ts");
assert((renewal.match(/ROUTINE_CARD_RENEWAL_DISABLED/g) ?? []).length === 2, "legacy renewal entrypoints are not both fail-closed");
assert(renewal.includes("Class and academic-session changes are digital only"), "permanent-card renewal policy message missing");

const templateRoute = read("src/app/api/internal/card-production/templates/route.ts");
assert(templateRoute.includes("CARD_TEMPLATE_CLASS_FORBIDDEN"), "new templates can still register Class");
assert(templateRoute.includes("CARD_TEMPLATE_ACADEMIC_SESSION_FORBIDDEN"), "new templates can still register Academic Session");

const render = read("src/server/card-production/render.ts");
assert(render.includes('CLASS:\\n        ""'), "legacy Class is not suppressed at render time");
assert(render.includes('ACADEMIC_SESSION:\\n        ""'), "legacy Academic Session is not suppressed at render time");
assert(render.includes('element.source !==\\n            "ACADEMIC_SESSION"'), "legacy Academic Session template element is not filtered");
assert(render.includes('element.source !==\\n            "CLASS"'), "legacy Class template element is not filtered");
assert(render.includes("function fitText("), "bounded text fitting missing");
assert(render.includes("function wrapText("), "bounded text wrapping missing");
assert(render.includes("minFontSize"), "bounded font shrink missing");

const registryCards = read("src/app/schools/[slug]/registry/student-cards.tsx");
assert(registryCards.includes("This physical card remains valid across class and"), "Registry does not explain long-lived physical-card policy");
assert(registryCards.includes("Replace card with Passkey"), "Registry still presents routine reissue wording");

`;
  source = source.slice(0, start) + replacement + source.slice(end);
  write("scripts/pass-a-selftest.ts", source);
}

// 9) Synchronize the historical frontend regression's accepted Scanner hash if it is hash-pinned.
{
  const relative = "scripts/frontend-closure-selftest.ts";
  if (fs.existsSync(full(relative))) {
    let source = read(relative);
    const oldHash = "bae161ca1d8ad1d5ccb4c24e477ff8e8f980f93dce2ac7042678b65a391fbf90";
    const newHash = sha("src/app/scanner/scanner-client.tsx");
    const count = source.split(oldHash).length - 1;
    if (count > 1) fail(`frontend closure selftest contains ${count} current Scanner hash copies; refusing broad rewrite`);
    if (count === 1) {
      source = source.replace(oldHash, newHash);
      write(relative, source);
    }
  }
}

console.log(JSON.stringify({
  scannerSha256: sha("src/app/scanner/scanner-client.tsx"),
  installControlSha256: sha("src/app/scanner/scanner-install-control.tsx"),
  progressionSha256: sha("src/server/school-operations/progression.ts"),
  renewalProductionSha256: sha("src/server/card-production/renewal-production.ts"),
  renderSha256: sha("src/server/card-production/render.ts"),
  templateRouteSha256: sha("src/app/api/internal/card-production/templates/route.ts"),
  registryCardsSha256: sha("src/app/schools/[slug]/registry/student-cards.tsx"),
  passASelftestSha256: sha("scripts/pass-a-selftest.ts")
}));
'@
  [System.IO.File]::WriteAllText($PatcherPath, $patcher, $Utf8NoBom)

  $WriteStarted = $true
  Run-Native "Guarded source patcher" "node.exe" @($PatcherPath)

  Step "Proving permanent-card and simplified-Scanner contracts"

  $progressionText = Get-Content -LiteralPath (Join-Path $ProjectRoot "src\server\school-operations\progression.ts") -Raw
  if ($progressionText -match "student_card_renewal_batches|student_card_renewal_batch_items|'CLASS_CHANGE'::student_card_renewal_reason") {
    Stop-Phase "Progression still contains routine physical-card renewal behavior."
  }

  $renewalText = Get-Content -LiteralPath (Join-Path $ProjectRoot "src\server\card-production\renewal-production.ts") -Raw
  if (([regex]::Matches($renewalText, "ROUTINE_CARD_RENEWAL_DISABLED")).Count -ne 2) {
    Stop-Phase "Both legacy renewal entrypoints are not fail-closed."
  }

  $renderText = Get-Content -LiteralPath (Join-Path $ProjectRoot "src\server\card-production\render.ts") -Raw
  if ($renderText -notmatch 'CLASS:\s*""' -or $renderText -notmatch 'ACADEMIC_SESSION:\s*""') {
    Stop-Phase "Class/Academic Session physical render suppression is incomplete."
  }

  $templateText = Get-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\internal\card-production\templates\route.ts") -Raw
  if (-not $templateText.Contains("CARD_TEMPLATE_CLASS_FORBIDDEN") -or -not $templateText.Contains("CARD_TEMPLATE_ACADEMIC_SESSION_FORBIDDEN")) {
    Stop-Phase "Changing academic fields are not both rejected for new physical templates."
  }

  $scannerText = Get-Content -LiteralPath $scannerPath -Raw
  foreach ($forbidden in @("ScannerStageRail", "01Card", "02Face", "03Time", "04Done", "Installed app", "Installed terminal app")) {
    if ($scannerText.Contains($forbidden)) {
      Stop-Phase "Scanner simplification residue remains: $forbidden"
    }
  }
  foreach ($required in @("createScannerRequestId", "/api/terminal/scan", "FaceLivenessDetectorCore", "cameraFacing", "Front camera", "wakeLockRef", "/scanner-sw.js", "Identity verified attendance", "Scan student card.", "Hold your CASA student card in front of the camera.")) {
    if (-not $scannerText.Contains($required)) {
      Stop-Phase "Scanner protected behavior/focus marker missing: $required"
    }
  }

  $installText = Get-Content -LiteralPath $installControlPath -Raw
  if ($installText.Contains("Scanner installed")) {
    Stop-Phase "Visible Scanner installed badge remains."
  }
  if (-not $installText.Contains("Install Scanner") -or -not $installText.Contains("beforeinstallprompt")) {
    Stop-Phase "Scanner PWA installability was accidentally removed."
  }

  if ((Sha $scannerCssPath) -ne $ExpectedScannerCssHash) { Stop-Phase "Scanner CSS changed unexpectedly." }
  if ((Sha $awsPath) -ne $ExpectedAwsLivenessHash) { Stop-Phase "AWS liveness source changed unexpectedly." }
  if ((Sha $packagePath) -ne $ExpectedPackageHash) { Stop-Phase "package.json changed unexpectedly." }
  if ((Sha $m29) -ne $ExpectedMigration29Hash -or (Sha $m30) -ne $ExpectedMigration30Hash) {
    Stop-Phase "Migration source changed during source-only patch."
  }

  Run-Native "git diff --check" "git.exe" @("diff", "--check", "HEAD", "--")

  Write-Host "  physical card lifecycle:         LONG-LIVED / VERIFIED"
  Write-Host "  class/session routine renewal:   DISABLED"
  Write-Host "  CLASS physical render:           SUPPRESSED"
  Write-Host "  ACADEMIC_SESSION physical render: SUPPRESSED"
  Write-Host "  exceptional replacement:         RETAINED"
  Write-Host "  Scanner installed badges:        REMOVED"
  Write-Host "  Scanner Card/Face/Time/Done rail: REMOVED"
  Write-Host "  Scanner camera/face trust path:  PRESERVED"
  Write-Host "  migrations:                      30 / UNCHANGED"

  Step "Running guarded source regressions"
  Run-Native "npm run typecheck" "npm.cmd" @("run", "typecheck")
  Run-Native "npm run scanner:selftest" "npm.cmd" @("run", "scanner:selftest")
  Run-Native "npm run card:selftest" "npm.cmd" @("run", "card:selftest")

  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  if ($null -ne $package.scripts.PSObject.Properties["card-production:selftest"]) {
    Run-Native "npm run card-production:selftest" "npm.cmd" @("run", "card-production:selftest")
  }

  Run-Native "Pass A permanent-card contract selftest" "npx.cmd" @("tsx", "scripts/pass-a-selftest.ts")
  Run-IfPresent "scripts\frontend-closure-selftest.ts" "Frontend closure regression"

  Step "Running production build"
  Run-Native "npm run build" "npm.cmd" @("run", "build")

  if ((Sha $awsPath) -ne $ExpectedAwsLivenessHash) { Stop-Phase "AWS liveness source drifted during regressions/build." }
  if ((Sha $scannerCssPath) -ne $ExpectedScannerCssHash) { Stop-Phase "Scanner CSS drifted during regressions/build." }
  if ((Sha $m29) -ne $ExpectedMigration29Hash -or (Sha $m30) -ne $ExpectedMigration30Hash) { Stop-Phase "Migration source drifted during regressions/build." }

  $ValidationPassed = $true

  Write-Host ""
  Write-Host "CASA PERMANENT CARD + SCANNER SIMPLIFICATION V1R1 IS GREEN" -ForegroundColor Green
  Write-Host "  checkpoint authority:             main/a7aa668"
  Write-Host "  physical student card:            ONE LONG-LIVED CARD UNTIL EXIT/EXCEPTIONAL REPLACEMENT"
  Write-Host "  class change/promotion renewal:   NO"
  Write-Host "  academic-session renewal:         NO"
  Write-Host "  class/session changes:            DIGITAL ONLY"
  Write-Host "  physical CLASS field:             REMOVED FROM RENDERING"
  Write-Host "  physical ACADEMIC SESSION field:  REMOVED FROM RENDERING"
  Write-Host "  lost/damaged/revoked/security replacement: AVAILABLE / PASSKEY-PROTECTED"
  Write-Host "  Scanner installed-state badges:   REMOVED"
  Write-Host "  Scanner 01/02/03/04 progress rail: REMOVED"
  Write-Host "  Scanner CASA/school/terminal focus: PRESERVED"
  Write-Host "  Scanner camera + face/liveness logic: PRESERVED"
  Write-Host "  local migrations:                 30 / UNCHANGED"
  Write-Host "  database mutation:                NO"
  Write-Host "  AWS mutation:                     NO"
  Write-Host "  failed pending Scanner attempt:   UNTOUCHED / DO NOT RESCAN YET"
  Write-Host "  Staging mutation:                 NO"
  Write-Host "  Production mutation:              NO"
  Write-Host "  evidence backup:                  $Evidence"
  Write-Host ""
  Write-Host "NEXT: return this complete GREEN output. We will then resume the exact liveness-start 503 diagnosis without rescanning the card." -ForegroundColor Yellow
}
catch {
  Restore-Backups
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  if ($PatcherPath -and (Test-Path -LiteralPath $PatcherPath -PathType Leaf)) {
    # Keep the patcher inside evidence only on success for auditability; it contains no secrets.
    if (-not $ValidationPassed) {
      Remove-Item -LiteralPath $PatcherPath -Force -ErrorAction SilentlyContinue
    }
  }
}
