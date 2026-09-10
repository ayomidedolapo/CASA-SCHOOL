param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$PreviousHead = "a7aa668"
$CurrentHead = "1710b4f"
$ExpectedMigrationCount = 30

$Pins = [ordered]@{
    "package.json" = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
    "package-lock.json" = "1f031c58be57c0525d535881d1287666c8c059292cea9111d88ef6b8e94f7a15"
    "drizzle.config.ts" = "77e9d1759af7ad1b1d3c009e7f57c6c6e25dd159a3da9907fb410552508eff80"
    "src\app\scanner\scanner-client.tsx" = "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"
    "src\app\scanner\scanner.module.css" = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
    "src\app\scanner\scanner-install-control.tsx" = "7d7cf5f90474a3075544307998929fabb0344bdf73f6d2d591d6be82a530a6e9"
    "src\server\biometrics\aws-liveness.ts" = "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"
    "src\app\api\terminal\attempts\pending\route.ts" = "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"
    "scripts\scanner-pending-attempt-recovery-selftest.ts" = "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"
    "src\server\school-operations\progression.ts" = "718ed050f547361623cd9da73187ff2a2de0b7355017847481853475770ef7c9"
    "src\server\card-production\render.ts" = "a3ab20fb06d1ca44f3c64db1fbf99bb010f8f1e38623fc7f7dc8f763f1fd1bfc"
    "src\app\api\internal\card-production\templates\route.ts" = "dec41315e52c2c784ac20f3ca76f4990b088eaa5ad9b6ec885227c928c5dc531"
    "src\app\schools\[slug]\registry\student-cards.tsx" = "c17fdb66b3cf70984f88da2ea6c2d88ff05bda027edfac6389f2a9dbb8afd451"
    "scripts\pass-a-selftest.ts" = "ce24cd2c31dae5c23c2bed86a83ea68a8b6525bd8b8d4c5eb5c13b88d55bd4"
    "src\app\scanner\manifest.ts" = "ebc0a5e09b9e738ede85d25060c7f491166cee1bd99e0baf3accf31b1460bdad"
    "public\scanner\manifest.webmanifest" = "92d344134e7a94c41f6ac7d71411b1fa343a1473fcc13e404c6d40014b583093"
}

$MigrationPins = [ordered]@{
    "drizzle\20260827143258_school-foundation\migration.sql" = "683a432f36721229e86ebe016e4d956ab3df649b702930c8c05a803e0b9be613"
    "drizzle\20260827171725_school-auth-foundation\migration.sql" = "a6d01bb226545d3f67422aa3149572b5c7cf85168269dba1fcda8e06b0e3fc36"
    "drizzle\20260827174117_secure-login\migration.sql" = "76f5468f8c2554be98e5d6969b36b36a865d4bd1adcad1b1dd200b5c8da06b63"
    "drizzle\20260827191914_student-registry-foundation\migration.sql" = "9224cc76ea86744ac79aa0a705173a007d3fdee01b2b449eb83d0ce88b9a7fb4"
    "drizzle\20260827211507_student-id-card-lifecycle\migration.sql" = "7382817a032979d577536bf9d1556f269388b105899346c9af546fc185f2f06d"
    "drizzle\20260828003838_attendance-foundation\migration.sql" = "70f2ac13858e78bc7f668e99fa7f1b3cfcee14d33f20b12326e0c57a9a1ba452"
    "drizzle\20260828014547_student-identity-operating-model\migration.sql" = "981a83662ea810c1e00cbadc0c19fcbfe6a75624e194581bfe23c495c8a230fb"
    "drizzle\20260828015513_presence-school-messaging\migration.sql" = "5d4ef2848c3190328c104c8924303b8618f1835e9bae7bf6ae4c892d7588eab8"
    "drizzle\20260828020702_scanner-trust-card-resolution\migration.sql" = "346fb3e397be6c89ddae30982801d4b288e17f07a08c746cd9104ee851c030c4"
    "drizzle\20260828022058_trusted-biometric-presence-finalization\migration.sql" = "bf672317df4f953d3ef55763589ae2d961673405532254de68940e139108bb33"
    "drizzle\20260828024845_passkey-identity-step-up\migration.sql" = "070aebf19da8eb13a3287a0530310a111c109fe4d44b478a71652acefff59aba"
    "drizzle\20260828030204_face-enrollment-biometric-gateway\migration.sql" = "fc244d51841bac5873f30fc70c943abac0470f5ae7381b155ba5115a38e13dcc"
    "drizzle\20260828032347_aws-rekognition-biometric-engine\migration.sql" = "5738c4a86b86cd588072f0c4bc5121a2ec496d47e483d153fa8a516295453591"
    "drizzle\20260828103906_attendance-operations-supervised-exceptions\migration.sql" = "2d011422410a7ee64c498a9f9e056331c536ee059e6dea2690c8564d70c1ec58"
    "drizzle\20260829002614_equal_sabra\migration.sql" = "743027f1b2f533b12a2ca498a6adaf108e6138785ddab46bc705fcc749ffb279"
    "drizzle\20260829120249_school-scoped-card-templates\migration.sql" = "4b80bbe96046dd86ff07ab727393df8a87db461817239cd3cbb12bf098db80a1"
    "drizzle\20260830031700_school-real-world-foundation\migration.sql" = "a5caed6e5750af3282570dc44c8c678dc31e46a7aabc269d57c76b03599b1b66"
    "drizzle\20260830143000_card-production-authority\migration.sql" = "ef109d255d53a2f6a7c729a9ab0d7bf93208f82f9957e9a87769bf6201893b44"
    "drizzle\20260830153500_identity-card-lifecycle-authority\migration.sql" = "b6f3c065c9055b65f6669afb3e6f567612764bc0bf4653ee91b5a36994df9a8d"
    "drizzle\20260831064829_post-migration19-snapshot-baseline\migration.sql" = "63e0a9f759662885c6a1d350596b957c6765d0ded53467f4475a8ebcfd78f9a6"
    "drizzle\20260831064909_teacher-my-class-assignment\migration.sql" = "d0f080bc0bd5256416d1dc61e74a4cf1bd5e7fa2caa9b9e7f28fe44d2d8f4f27"
    "drizzle\20260901081825_attendance-readiness-card-replacement\migration.sql" = "085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b"
    "drizzle\20260902190300_wave1_transport_casa_internal\migration.sql" = "5bbde238a3a791e488f0dceeab4d98996e57dbe21ac3717cde35b2c25f034aa3"
    "drizzle\20260902201500_wave2_structure_audit\migration.sql" = "96ea98960aed00d4fca194403b54c8b8c6137e1937783b837bb38c980df0334f"
    "drizzle\20260905030000_internal_face_authority\migration.sql" = "cab5de3c1b8bf69d6148b529a1bafcda7860c9037bd17d251ed179c9f9a28dd7"
    "drizzle\20260907043140_attendance-session-reopen\migration.sql" = "881c3d9c742a5eb16e699632d95dd5cdc5321dc07de356d29add6e9b4ce980bd"
    "drizzle\20260907105900_attendance-session-event-stream-multicycle\migration.sql" = "bb708c2702a5165549447b9b91d176ded1a3a03f79ddb37332959a1181fcc0a4"
    "drizzle\20260908135855_attendance-session-policy-rebind\migration.sql" = "7791abd6bcf90d2038e434fb7e6334d98a38d19c9f14c1f2871d03f27e498681"
    "drizzle\20260909020000_pass-a-enum-expansion\migration.sql" = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
    "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql" = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"
}

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Fail "Required file missing: $Path"
    }

    return (
        Get-FileHash -LiteralPath $Path -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

function Git-Lines([string[]]$Arguments) {
    $previous = $ErrorActionPreference
    $stderr = [IO.Path]::GetTempFileName()
    try {
        $ErrorActionPreference = "Continue"
        $lines = @(& git -C $ProjectRoot @Arguments 2> $stderr)
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            $message = ""
            if (Test-Path -LiteralPath $stderr) {
                $message = (Get-Content -LiteralPath $stderr -Raw).Trim()
            }
            Fail "git $($Arguments -join ' ') failed. $message"
        }
        return @($lines)
    }
    finally {
        $ErrorActionPreference = $previous
        Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue
    }
}

function Git-Text([string[]]$Arguments) {
    return ((Git-Lines $Arguments) -join "`n").Trim()
}

Write-Host "CASA School - Current HEAD 1710b4f Transition Truth Probe V1R1" -ForegroundColor Green
Write-Host "READ ONLY. Proves whether main/1710b4f is a safe descendant of the previous green authority main/a7aa668."
Write-Host "No source write. No npm install. No DB connection. No AWS call. No deployment mutation."

try {
    Step "Locking repository identity"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "Repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    $Branch = Git-Text @("branch","--show-current")
    $Head = Git-Text @("rev-parse","--short=7","HEAD")

    if ($Branch -ne $ExpectedBranch) {
        Fail "Expected branch $ExpectedBranch; found $Branch."
    }

    if ($Head -ne $CurrentHead) {
        Fail "Expected current HEAD $CurrentHead; found $Head."
    }

    & git merge-base --is-ancestor $PreviousHead $CurrentHead
    if ($LASTEXITCODE -ne 0) {
        Fail "$CurrentHead is not a descendant of previous green authority $PreviousHead."
    }

    $PreviousResolved = Git-Text @("rev-parse","--short=7",$PreviousHead)

    Write-Host "  branch/head:                    $Branch/$Head"
    Write-Host "  previous green authority:       $PreviousResolved"
    Write-Host "  ancestry:                       $PreviousHead -> $CurrentHead / VERIFIED"

    Step "Capturing exact commit transition"

    $CommitLog = @(
        Git-Lines @(
            "log",
            "--oneline",
            "--decorate",
            "$PreviousHead..$CurrentHead"
        )
    )

    $Changed = @(
        Git-Lines @(
            "diff",
            "--name-status",
            "$PreviousHead..$CurrentHead"
        )
    )

    $Working = @(
        Git-Lines @(
            "status",
            "--short"
        )
    )

    Write-Host "  commits since ${PreviousHead}:     $($CommitLog.Count)"
    if ($CommitLog.Count -gt 0) {
        foreach ($line in $CommitLog) {
            Write-Host "    $line"
        }
    }

    Write-Host "  committed changed paths:        $($Changed.Count)"
    if ($Changed.Count -gt 0) {
        foreach ($line in $Changed) {
            Write-Host "    $line"
        }
    }

    Write-Host "  current working-tree entries:   $($Working.Count)"
    if ($Working.Count -gt 0) {
        foreach ($line in $Working) {
            Write-Host "    $line"
        }
    }

    Step "Verifying exact 30-migration authority"

    $MigrationFiles = @(
        Get-ChildItem `
            -LiteralPath (Join-Path $ProjectRoot "drizzle") `
            -Recurse `
            -File `
            -Filter "migration.sql" |
        Where-Object {
            $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
            $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
        }
    )

    if ($MigrationFiles.Count -ne $ExpectedMigrationCount) {
        Fail "Expected exactly $ExpectedMigrationCount migrations; found $($MigrationFiles.Count)."
    }

    foreach ($Relative in $MigrationPins.Keys) {
        $Actual = Sha (Join-Path $ProjectRoot $Relative)
        $Expected = [string]$MigrationPins[$Relative]

        if ($Actual -ne $Expected) {
            Fail "Migration checksum drift: $Relative`nExpected: $Expected`nActual:   $Actual"
        }
    }

    Write-Host "  migrations:                     30 / EXACT HASH MANIFEST"

    Step "Re-proving protected source authorities"

    $PinResults = New-Object System.Collections.Generic.List[object]

    foreach ($Relative in $Pins.Keys) {
        $Path = Join-Path $ProjectRoot $Relative
        $Actual = Sha $Path
        $Expected = [string]$Pins[$Relative]
        $Ok = $Actual -eq $Expected

        $PinResults.Add(
            [PSCustomObject]@{
                path = $Relative
                expected = $Expected
                actual = $Actual
                exact = $Ok
            }
        ) | Out-Null

        if (-not $Ok) {
            Write-Host "  DRIFT: $Relative" -ForegroundColor Yellow
            Write-Host "    expected: $Expected"
            Write-Host "    actual:   $Actual"
        }
    }

    $ExactCount = @($PinResults | Where-Object { $_.exact }).Count
    $DriftCount = @($PinResults | Where-Object { -not $_.exact }).Count

    # renewal-production.ts has a known historical line-ending/source-truth issue,
    # so prove the permanent-card semantic contract instead of pinning a stale byte hash.
    $RenewalPath =
        Join-Path $ProjectRoot "src\server\card-production\renewal-production.ts"

    if (-not (Test-Path -LiteralPath $RenewalPath -PathType Leaf)) {
        Fail "renewal-production.ts is missing."
    }

    $Renewal =
        Get-Content -LiteralPath $RenewalPath -Raw

    $HelperCount =
        ([regex]::Matches(
            $Renewal,
            "routineCardRenewalDisabled\(\)"
        )).Count

    $DisabledCount =
        ([regex]::Matches(
            $Renewal,
            "ROUTINE_CARD_RENEWAL_DISABLED"
        )).Count

    if (
        -not $Renewal.Contains("function routineCardRenewalDisabled(): boolean") -or
        $HelperCount -ne 3 -or
        $DisabledCount -ne 2
    ) {
        Fail "Permanent-card fail-closed renewal contract is not intact."
    }

    Write-Host "  exact protected pins:           $ExactCount"
    Write-Host "  protected pin drift count:      $DriftCount"
    Write-Host "  permanent-card renewal contract: VERIFIED"

    Step "Classifying the HEAD transition"

    $CriticalChanged = @()

    foreach ($line in $Changed) {
        $parts = ([string]$line) -split "`t"
        if ($parts.Count -lt 2) {
            continue
        }

        $path = $parts[$parts.Count - 1].Replace("/", "\")

        if (
            $MigrationPins.Contains($path) -or
            $Pins.Contains($path) -or
            $path -eq "src\server\card-production\renewal-production.ts"
        ) {
            $CriticalChanged += [string]$line
        }
    }

    $Classification = $null

    if ($DriftCount -eq 0 -and $CriticalChanged.Count -eq 0) {
        $Classification =
            "SAFE_DESCENDANT__GREEN_AUTHORITIES_BYTE_EXACT__REPINS_ALLOWED"
    }
    elseif ($DriftCount -eq 0 -and $CriticalChanged.Count -gt 0) {
        $Classification =
            "SAFE_DESCENDANT__CRITICAL_PATHS_COMMITTED_BUT_CURRENT_BYTES_MATCH_GREEN_AUTHORITY"
    }
    else {
        $Classification =
            "DESCENDANT_BUT_PROTECTED_SOURCE_DRIFT_REQUIRES_REVIEW_BEFORE_AWS_PATCH"
    }

    Write-Host "  protected committed changes:    $($CriticalChanged.Count)"
    if ($CriticalChanged.Count -gt 0) {
        foreach ($line in $CriticalChanged) {
            Write-Host "    $line"
        }
    }

    Write-Host "  classification:                 $Classification"

    $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\head-1710b4f-transition-truth-v1r1-$Stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    $CommitLog |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "commits.txt") `
            -Encoding UTF8

    $Changed |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "changed-paths.txt") `
            -Encoding UTF8

    $Working |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "git-status.txt") `
            -Encoding UTF8

    $PinResults |
        ConvertTo-Json -Depth 8 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "protected-pins.json") `
            -Encoding UTF8

    [ordered]@{
        createdAt = (Get-Date -Format o)
        branch = $Branch
        currentHead = $Head
        previousHead = $PreviousHead
        ancestorVerified = $true
        migrationCount = $MigrationFiles.Count
        migrationManifestExact = $true
        protectedPinsExact = $ExactCount
        protectedPinsDrift = $DriftCount
        protectedCommittedChanges = $CriticalChanged
        permanentCardRenewalContract = $true
        classification = $Classification
        mutation = $false
        dbConnected = $false
        awsConnected = $false
        deploymentMutation = $false
    } |
        ConvertTo-Json -Depth 12 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "RESULT.json") `
            -Encoding UTF8

    Write-Host ""
    Write-Host "CASA CURRENT HEAD 1710b4f TRANSITION TRUTH PROBE V1R1 IS GREEN" -ForegroundColor Green
    Write-Host "  branch/head:                     $Branch/$Head"
    Write-Host "  previous authority ancestry:     $PreviousHead -> $CurrentHead / VERIFIED"
    Write-Host "  migrations:                      30 / EXACT"
    Write-Host "  protected pins exact:            $ExactCount"
    Write-Host "  protected pins drift:            $DriftCount"
    Write-Host "  permanent-card renewal contract: VERIFIED"
    Write-Host "  source mutation:                 NONE / READ ONLY"
    Write-Host "  DB/AWS/deployment mutation:      NONE"
    Write-Host "  classification:                  $Classification"
    Write-Host "  evidence:                        $Evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete output. If classification is SAFE_DESCENDANT, the AWS isolation installer can be safely repinned to main/1710b4f." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA CURRENT HEAD 1710b4f TRANSITION TRUTH PROBE V1R1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    throw
}
