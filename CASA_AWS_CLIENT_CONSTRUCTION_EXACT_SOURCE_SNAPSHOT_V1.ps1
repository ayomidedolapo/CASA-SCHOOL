param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30

$Targets = @(
    "src\server\card-production\storage.ts",
    "src\server\biometrics\aws-rekognition.ts",
    "package.json",
    "package-lock.json"
)

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Print-NumberedRange(
    [string]$Path,
    [int]$Start,
    [int]$End
) {
    $lines = [System.IO.File]::ReadAllLines($Path)

    $safeStart = [Math]::Max(1, $Start)
    $safeEnd = [Math]::Min($lines.Length, $End)

    for ($i = $safeStart; $i -le $safeEnd; $i++) {
        Write-Host ("{0,5}: {1}" -f $i, $lines[$i - 1])
    }
}

function Get-MatchLines(
    [string]$Path,
    [string[]]$Patterns
) {
    $all = New-Object System.Collections.Generic.List[int]

    foreach ($pattern in $Patterns) {
        $matches =
            @(
                Select-String `
                    -LiteralPath $Path `
                    -Pattern $pattern `
                    -AllMatches `
                    -ErrorAction SilentlyContinue
            )

        foreach ($match in $matches) {
            if (-not $all.Contains([int]$match.LineNumber)) {
                [void]$all.Add([int]$match.LineNumber)
            }
        }
    }

    return @($all | Sort-Object)
}

Write-Host "CASA School - AWS Client Construction Exact Source Snapshot V1" -ForegroundColor Green
Write-Host "Read-only targeted source inspection before Vercel OIDC source wiring."
Write-Host "Prints only source/package content; no .env files or secret values are read."
Write-Host "No source write. No npm install. No Vercel/AWS/DB/migration/deployment mutation."

try {
    Step "Locking exact CASA source checkpoint"

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

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"

    Step "Locking target file existence and hashes"

    foreach ($relative in $Targets) {
        $path = Join-Path $ProjectRoot $relative

        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            if ($relative -eq "package-lock.json") {
                Write-Host "  $relative`: ABSENT"
                continue
            }

            Fail "Required source target missing: $relative"
        }

        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host "  $relative"
        Write-Host "    SHA256: $hash"
    }

    $storagePath =
        Join-Path `
            $ProjectRoot `
            "src\server\card-production\storage.ts"

    $rekognitionPath =
        Join-Path `
            $ProjectRoot `
            "src\server\biometrics\aws-rekognition.ts"

    Step "storage.ts imports and S3Client construction"

    $storageMatches =
        Get-MatchLines `
            $storagePath `
            @(
                'from\s+["'']@aws-sdk/client-s3["'']',
                '\bS3Client\b',
                '\bnew\s+S3Client\s*\(',
                'AWS_',
                'CASA_CARD_STORAGE'
            )

    if (@($storageMatches).Count -eq 0) {
        Fail "No S3 construction markers found in storage.ts."
    }

    Print-NumberedRange $storagePath 1 45

    foreach ($line in @($storageMatches)) {
        if ($line -le 45) {
            continue
        }

        Write-Host ""
        Write-Host "--- storage.ts context around line $line ---"
        Print-NumberedRange $storagePath ($line - 18) ($line + 28)
    }

    Step "aws-rekognition.ts imports and RekognitionClient construction"

    $rekognitionMatches =
        Get-MatchLines `
            $rekognitionPath `
            @(
                'from\s+["'']@aws-sdk/client-rekognition["'']',
                '\bRekognitionClient\b',
                '\bnew\s+RekognitionClient\s*\(',
                'AWS_',
                'CASA_AWS_REKOGNITION'
            )

    if (@($rekognitionMatches).Count -eq 0) {
        Fail "No Rekognition construction markers found."
    }

    Print-NumberedRange $rekognitionPath 1 55

    foreach ($line in @($rekognitionMatches)) {
        if ($line -le 55) {
            continue
        }

        Write-Host ""
        Write-Host "--- aws-rekognition.ts context around line $line ---"
        Print-NumberedRange $rekognitionPath ($line - 18) ($line + 28)
    }

    Step "package.json relevant dependency/scripts snapshot"

    $packagePath = Join-Path $ProjectRoot "package.json"
    $packageLines = [System.IO.File]::ReadAllLines($packagePath)

    $packageMatches =
        Get-MatchLines `
            $packagePath `
            @(
                '"dependencies"',
                '"devDependencies"',
                '"scripts"',
                '"@aws-sdk/',
                '"@vercel/',
                '"next"',
                '"typescript"'
            )

    $printed = New-Object System.Collections.Generic.HashSet[int]

    foreach ($line in @($packageMatches)) {
        $from = [Math]::Max(1, $line - 5)
        $to = [Math]::Min($packageLines.Length, $line + 12)

        $key = "$from-$to"
        if ($printed.Add($line)) {
            Write-Host ""
            Write-Host "--- package.json context around line $line ---"
            Print-NumberedRange $packagePath $from $to
        }
    }

    Write-Host ""
    Write-Host "CASA AWS CLIENT CONSTRUCTION EXACT SOURCE SNAPSHOT V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  source mutation:                NONE / READ ONLY"
    Write-Host "  npm mutation:                   NONE"
    Write-Host "  Vercel/AWS/DB/deployment:       NONE"
    Write-Host ""
    Write-Host "NEXT: return this complete output. The next guarded installer will wire Vercel OIDC into the exact existing S3/Rekognition client construction and preserve local credential-chain behavior." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA AWS CLIENT CONSTRUCTION EXACT SOURCE SNAPSHOT V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No source, npm, Vercel, AWS, DB, migration, or deployment mutation was authorized by this probe."
    throw
}
