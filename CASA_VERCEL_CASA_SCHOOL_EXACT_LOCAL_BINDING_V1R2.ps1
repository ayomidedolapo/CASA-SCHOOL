param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30

$ExpectedVercelUser = "ayomidedolapo"
$ExpectedTeamSlug = "ayomidedolapos-projects"
$ExpectedTeamId = "team_7WKcvFM29KYYE0xpbTILi05i"
$ExpectedProjectName = "casa-school"
$ExpectedProjectId = "prj_zPsDuVHD9lTXz3Z1D4noD4Cbl8Hr"

# Older, unrelated CASA module. This project must never be selected by this binder.
$ProtectedOtherCasaProjectName = "casa"
$ProtectedOtherCasaProjectId = "prj_ttIrmj3X5fcOzYNBVmiiq2hZc5W9"

$ExpectedAwsAccount = "938733852185"
$AwsRegion = "eu-west-1"
$ExpectedStagingBucket = "casa-school-staging-card-artifacts-$ExpectedAwsAccount-$AwsRegion"
$ExpectedProductionBucket = "casa-school-production-card-artifacts-$ExpectedAwsAccount-$AwsRegion"
$ExpectedStagingPrefix = "casa-school-staging"
$ExpectedProductionPrefix = "casa-school-production"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$script:VercelRunnerCommand = $null
$script:VercelRunnerPrefix = @()
$script:VercelRunnerMode = $null

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Read-EnvMap([string]$Path) {
    $map = @{}

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Fail "Required env file missing: $Path"
    }

    foreach ($raw in [System.IO.File]::ReadAllLines($Path)) {
        $line = ([string]$raw).Trim()

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            continue
        }

        $index = $line.IndexOf("=")
        if ($index -le 0) {
            continue
        }

        $name = $line.Substring(0, $index).Trim()
        $value = $line.Substring($index + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if ($map.ContainsKey($name)) {
            Fail "Duplicate env key $name in $Path"
        }

        $map[$name] = $value
    }

    return $map
}

function Invoke-Native(
    [string]$Command,
    [string[]]$Arguments,
    [string]$Label,
    [switch]$AllowFailure
) {
    $stderr = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        $stdout = @(& $Command @Arguments 2> $stderr)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $rawError =
        if (Test-Path -LiteralPath $stderr) {
            Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
        }
        else {
            $null
        }

    $errorText =
        if ($null -eq $rawError) {
            ""
        }
        else {
            ([string]$rawError).Trim()
        }

    Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        Fail "$Label failed with exit code $exitCode. $errorText"
    }

    return [pscustomobject]@{
        ok = ($exitCode -eq 0)
        exitCode = $exitCode
        stdout = @($stdout)
        stderr = $errorText
    }
}

function Resolve-VercelRunner {
    $direct = Get-Command "vercel.cmd" -ErrorAction SilentlyContinue
    if ($null -eq $direct) {
        $direct = Get-Command "vercel" -ErrorAction SilentlyContinue
    }

    if ($null -ne $direct) {
        $script:VercelRunnerCommand =
            if (-not [string]::IsNullOrWhiteSpace([string]$direct.Source)) {
                [string]$direct.Source
            }
            else {
                [string]$direct.Name
            }
        $script:VercelRunnerPrefix = @()
        $script:VercelRunnerMode = "DIRECT"
        return
    }

    $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
    if ($null -eq $npx) {
        $npx = Get-Command "npx" -ErrorAction SilentlyContinue
    }

    if ($null -eq $npx) {
        Fail "Neither Vercel CLI nor npx is available."
    }

    $script:VercelRunnerCommand =
        if (-not [string]::IsNullOrWhiteSpace([string]$npx.Source)) {
            [string]$npx.Source
        }
        else {
            [string]$npx.Name
        }

    $script:VercelRunnerPrefix = @("--yes", "vercel@latest")
    $script:VercelRunnerMode = "NPX_TRANSIENT"
}

function Invoke-Vercel(
    [string[]]$Arguments,
    [string]$Label,
    [switch]$AllowFailure
) {
    if ([string]::IsNullOrWhiteSpace([string]$script:VercelRunnerCommand)) {
        Fail "Vercel runner has not been resolved."
    }

    $allArguments = @(@($script:VercelRunnerPrefix) + @($Arguments))

    if ($AllowFailure) {
        return Invoke-Native $script:VercelRunnerCommand $allArguments $Label -AllowFailure
    }

    return Invoke-Native $script:VercelRunnerCommand $allArguments $Label
}

function Parse-JsonResult([object]$Result, [string]$Label) {
    $text = (@($Result.stdout) -join "`n").Trim()

    if ([string]::IsNullOrWhiteSpace($text)) {
        Fail "$Label returned no JSON."
    }

    try {
        return ($text | ConvertFrom-Json)
    }
    catch {
        Fail "$Label returned invalid JSON."
    }
}

function As-Array([object]$Value) {
    if ($null -eq $Value) {
        return @()
    }

    if ($Value -is [System.Array]) {
        return @($Value)
    }

    return @($Value)
}

function Extract-Teams([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if ($Json -is [System.Array]) {
        return @($Json)
    }

    foreach ($property in @("teams", "items", "data")) {
        if ($null -ne $Json.PSObject.Properties[$property]) {
            return As-Array $Json.$property
        }
    }

    return As-Array $Json
}

function Extract-Projects([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if ($Json -is [System.Array]) {
        return @($Json)
    }

    foreach ($property in @("projects", "items", "data")) {
        if ($null -ne $Json.PSObject.Properties[$property]) {
            return As-Array $Json.$property
        }
    }

    return As-Array $Json
}

function Get-PropertyString([object]$Object, [string[]]$Names) {
    if ($null -eq $Object) {
        return $null
    }

    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -ne $property -and $null -ne $property.Value) {
            $value = ([string]$property.Value).Trim()
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
        }
    }

    return $null
}

function Read-LinkJson([string]$Path) {
    try {
        return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    }
    catch {
        Fail "Local Vercel project link is invalid JSON: $Path"
    }
}

Write-Host "CASA School - Vercel Exact Project Local Binding V1R2" -ForegroundColor Green
Write-Host "Binds this exact local CASA checkout to the already-proven existing Vercel project casa-school by writing only .vercel/project.json."
Write-Host "No Vercel project creation. No deployment. No Vercel environment pull. No AWS IAM/S3 mutation. No DB connection. No migration."

try {
    Step "Locking CASA source + already-green environment separation authority"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    foreach ($command in @("git")) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            Fail "$command is not available."
        }
    }

    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short=7 HEAD).Trim()

    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Fail "Git checkpoint drift: $branch/$head"
    }

    $migrationCount = @(
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

    $stagingEnv = Read-EnvMap (Join-Path $ProjectRoot ".env.staging.local")
    $productionEnv = Read-EnvMap (Join-Path $ProjectRoot ".env.production.local")

    $environmentChecks = @(
        @{
            label = "Staging"
            map = $stagingEnv
            bucket = $ExpectedStagingBucket
            prefix = $ExpectedStagingPrefix
        },
        @{
            label = "Production"
            map = $productionEnv
            bucket = $ExpectedProductionBucket
            prefix = $ExpectedProductionPrefix
        }
    )

    foreach ($entry in $environmentChecks) {
        if (
            -not $entry.map.ContainsKey("CASA_CARD_STORAGE_BUCKET") -or
            [string]$entry.map["CASA_CARD_STORAGE_BUCKET"] -ne [string]$entry.bucket
        ) {
            Fail "$($entry.label) S3 env authority is not exact."
        }

        if (
            -not $entry.map.ContainsKey("CASA_AWS_REKOGNITION_COLLECTION_PREFIX") -or
            [string]$entry.map["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne [string]$entry.prefix
        ) {
            Fail "$($entry.label) Rekognition namespace authority is not exact."
        }
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  Staging S3/env isolation:       VERIFIED"
    Write-Host "  Production S3/env isolation:    VERIFIED"

    Step "Locking exact authenticated Vercel identity"

    Resolve-VercelRunner
    Write-Host "  Vercel runner:                  $script:VercelRunnerMode"

    $versionResult = Invoke-Vercel @("--version") "Vercel CLI version"
    $versionText = (@($versionResult.stdout) -join " ").Trim()

    $whoamiResult = Invoke-Vercel @("whoami", "--no-color") "Vercel whoami" -AllowFailure
    if (-not $whoamiResult.ok) {
        Fail "Vercel CLI is not authenticated. Re-run the Vercel login flow before continuing."
    }

    $vercelUser = (
        @($whoamiResult.stdout) |
        Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } |
        Select-Object -Last 1
    )
    $vercelUser = ([string]$vercelUser).Trim()

    if ($vercelUser -ne $ExpectedVercelUser) {
        Fail "Vercel authenticated-user drift: expected $ExpectedVercelUser, found $vercelUser."
    }

    Write-Host "  Vercel CLI:                     $versionText"
    Write-Host "  authenticated user:             $vercelUser / VERIFIED"

    Step "Re-proving exact Vercel team and existing CASA School project read-only"

    if (
        $ExpectedProjectName -eq $ProtectedOtherCasaProjectName -or
        $ExpectedProjectId -eq $ProtectedOtherCasaProjectId
    ) {
        Fail "Safety invariant failed: target resolves to the older unrelated CASA module."
    }

    $teamsResult = Invoke-Vercel @("teams", "list", "--format", "json", "--no-color") "Vercel teams list"
    $teams = Extract-Teams (Parse-JsonResult $teamsResult "Vercel teams list")

    $matchingTeams = @(
        foreach ($team in $teams) {
            $teamId = Get-PropertyString $team @("id", "uid", "teamId")
            $teamSlug = Get-PropertyString $team @("slug")
            if ($teamSlug -eq $ExpectedTeamSlug -or $teamId -eq $ExpectedTeamId) {
                [pscustomobject]@{
                    id = $teamId
                    slug = $teamSlug
                }
            }
        }
    )

    if ($matchingTeams.Count -ne 1) {
        Fail "Exact Vercel team is not uniquely available to the authenticated user."
    }

    if (
        [string]$matchingTeams[0].id -ne $ExpectedTeamId -or
        [string]$matchingTeams[0].slug -ne $ExpectedTeamSlug
    ) {
        Fail "Vercel team identity drift."
    }

    Write-Host "  team slug:                      $ExpectedTeamSlug / VERIFIED"
    Write-Host "  team ID:                        $ExpectedTeamId / VERIFIED"

    $projectsResult = Invoke-Vercel @(
        "project",
        "ls",
        "--json",
        "--scope",
        $ExpectedTeamSlug,
        "--no-color"
    ) "Vercel project list for exact CASA team"

    $projects = Extract-Projects (Parse-JsonResult $projectsResult "Vercel project list")

    $nameMatches = @()
    $idMatches = @()

    foreach ($project in $projects) {
        $projectId = Get-PropertyString $project @("id", "uid", "projectId")
        $projectName = Get-PropertyString $project @("name")

        if ($projectName -eq $ExpectedProjectName) {
            $nameMatches += [pscustomobject]@{ id = $projectId; name = $projectName }
        }

        if ($projectId -eq $ExpectedProjectId) {
            $idMatches += [pscustomobject]@{ id = $projectId; name = $projectName }
        }
    }

    if ($nameMatches.Count -ne 1 -or $idMatches.Count -ne 1) {
        Fail "Exact CASA School Vercel project is not uniquely available."
    }

    if (
        [string]$nameMatches[0].id -ne $ExpectedProjectId -or
        [string]$idMatches[0].name -ne $ExpectedProjectName
    ) {
        Fail "CASA School Vercel project name/ID mapping drift."
    }

    Write-Host "  project name:                   $ExpectedProjectName / VERIFIED"
    Write-Host "  project ID:                     $ExpectedProjectId / VERIFIED"

    Step "Checking for conflicting local Vercel link state"

    $vercelDir = Join-Path $ProjectRoot ".vercel"
    $projectLinkPath = Join-Path $vercelDir "project.json"
    $repoLinkPath = Join-Path $vercelDir "repo.json"

    if (Test-Path -LiteralPath $repoLinkPath -PathType Leaf) {
        Fail "Unexpected .vercel/repo.json exists. Refusing to overlay single-project binding."
    }

    $alreadyExact = $false

    if (Test-Path -LiteralPath $projectLinkPath -PathType Leaf) {
        $existingLink = Read-LinkJson $projectLinkPath
        $existingOrgId = Get-PropertyString $existingLink @("orgId")
        $existingProjectId = Get-PropertyString $existingLink @("projectId")

        if ($existingOrgId -eq $ExpectedTeamId -and $existingProjectId -eq $ExpectedProjectId) {
            $alreadyExact = $true
            Write-Host "  local project link:             ALREADY EXACT / VERIFIED"
        }
        else {
            Fail "Existing .vercel/project.json points to a different Vercel identity."
        }
    }
    else {
        Write-Host "  local project link:             ABSENT / SAFE TO CREATE"
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $evidence = Join-Path $ProjectRoot ".casa-backups\vercel-exact-project-local-binding-v1r2-$stamp"
    New-Item -ItemType Directory -Path $evidence -Force | Out-Null

    $preState = [ordered]@{
        createdAt = (Get-Date -Format o)
        source = [ordered]@{
            branch = $branch
            head = $head
            migrations = $migrationCount
        }
        vercel = [ordered]@{
            runnerMode = $script:VercelRunnerMode
            cliVersion = $versionText
            authenticatedUser = $vercelUser
            teamSlug = $ExpectedTeamSlug
            teamId = $ExpectedTeamId
            projectName = $ExpectedProjectName
            projectId = $ExpectedProjectId
            projectLinkPresent = (Test-Path -LiteralPath $projectLinkPath -PathType Leaf)
            repoLinkPresent = (Test-Path -LiteralPath $repoLinkPath -PathType Leaf)
        }
    }

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PRE_BINDING_STATE.json"),
        ($preState | ConvertTo-Json -Depth 12),
        $Utf8NoBom
    )

    if (Test-Path -LiteralPath $vercelDir -PathType Container) {
        $backupVercelDir = Join-Path $evidence "PRE_BINDING_DOT_VERCEL"
        New-Item -ItemType Directory -Path $backupVercelDir -Force | Out-Null
        Get-ChildItem -LiteralPath $vercelDir -Force -ErrorAction SilentlyContinue |
            ForEach-Object {
                Copy-Item `
                    -LiteralPath $_.FullName `
                    -Destination $backupVercelDir `
                    -Recurse `
                    -Force
            }
    }

    if (-not $alreadyExact) {
        Step "Creating exact local .vercel/project.json binding only"

        New-Item -ItemType Directory -Path $vercelDir -Force | Out-Null

        $linkPayload = [ordered]@{
            orgId = $ExpectedTeamId
            projectId = $ExpectedProjectId
        }

        $temporaryLinkPath = Join-Path $vercelDir "project.json.casa-tmp-$PID"

        [System.IO.File]::WriteAllText(
            $temporaryLinkPath,
            ($linkPayload | ConvertTo-Json -Depth 4),
            $Utf8NoBom
        )

        Move-Item `
            -LiteralPath $temporaryLinkPath `
            -Destination $projectLinkPath `
            -Force

        Write-Host "  local binding write:            .vercel/project.json ONLY"
    }

    Step "Re-proving local binding and Vercel project resolution"

    if (-not (Test-Path -LiteralPath $projectLinkPath -PathType Leaf)) {
        Fail "Local Vercel project link was not created."
    }

    $finalLink = Read-LinkJson $projectLinkPath
    $finalOrgId = Get-PropertyString $finalLink @("orgId")
    $finalProjectId = Get-PropertyString $finalLink @("projectId")

    if ($finalOrgId -ne $ExpectedTeamId -or $finalProjectId -ne $ExpectedProjectId) {
        Fail "Post-write local Vercel project binding is not exact."
    }

    $inspectResult = Invoke-Vercel @(
        "project",
        "inspect",
        "--non-interactive",
        "--scope",
        $ExpectedTeamSlug,
        "--no-color"
    ) "Vercel linked project inspection" -AllowFailure

    if (-not $inspectResult.ok) {
        Fail "Vercel could not resolve the exact local project link. $($inspectResult.stderr)"
    }

    $inspectText = (@($inspectResult.stdout) -join "`n").Trim()
    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "VERCEL_PROJECT_INSPECT.txt"),
        $inspectText,
        $Utf8NoBom
    )

    # OIDC environment claims are intentionally NOT finalized here.
    # The next read-only probe must determine whether CASA Staging is Vercel
    # Preview or a custom target such as "staging" before IAM trust is created.

    $result = [ordered]@{
        createdAt = (Get-Date -Format o)
        proof = "CASA_VERCEL_EXACT_PROJECT_LOCAL_BINDING_V1R2"
        source = [ordered]@{
            branch = $branch
            head = $head
            migrations = $migrationCount
        }
        vercel = [ordered]@{
            runnerMode = $script:VercelRunnerMode
            cliVersion = $versionText
            authenticatedUser = $vercelUser
            teamSlug = $ExpectedTeamSlug
            teamId = $ExpectedTeamId
            projectName = $ExpectedProjectName
            projectId = $ExpectedProjectId
            localProjectLink = $projectLinkPath
            exact = $true
        }
        mutations = [ordered]@{
            localVercelProjectJson = (-not $alreadyExact)
            vercelRemote = $false
            vercelEnvironmentPull = $false
            deployment = $false
            awsIam = $false
            s3 = $false
            database = $false
            migration = $false
            source = $false
        }
    }

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "RESULT.json"),
        ($result | ConvertTo-Json -Depth 12),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA VERCEL EXACT PROJECT LOCAL BINDING V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  Vercel authenticated user:      $vercelUser / VERIFIED"
    Write-Host "  owner/team slug:                $ExpectedTeamSlug / VERIFIED"
    Write-Host "  owner/team ID:                  $ExpectedTeamId / VERIFIED"
    Write-Host "  project name:                   $ExpectedProjectName / VERIFIED"
    Write-Host "  project ID:                     $ExpectedProjectId / VERIFIED"
    Write-Host "  local .vercel/project.json:     EXACT / VERIFIED"
    Write-Host "  Vercel remote mutation:         NONE"
    Write-Host "  Vercel env pull:                NONE"
    Write-Host "  AWS IAM/S3 mutation:            NONE"
    Write-Host "  DB/migration/deployment:        NONE"
    Write-Host "  Team issuer candidate:          $issuer"
    Write-Host "  audience candidate:             $audience"
    Write-Host "  Staging subject candidate:      $stagingSubject"
    Write-Host "  Production subject candidate:   $productionSubject"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""
    Write-Host "NEXT: rerun CASA_VERCEL_EXACT_IDENTITY_OIDC_IAM_READINESS_V1R3.ps1 and return its complete output. It should now classify the exact linked identity as ready for guarded Team-issuer IAM binding." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL EXACT PROJECT LOCAL BINDING V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No Vercel remote project/environment, AWS IAM/S3, DB, migration, deployment, or CASA source mutation was authorized by this binder."
    throw
}
