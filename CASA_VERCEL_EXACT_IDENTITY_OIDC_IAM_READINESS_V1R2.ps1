param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
    [string]$AwsProfile = "casa-dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30
$ExpectedAwsAccount = "938733852185"
$AwsRegion = "eu-west-1"

$ExpectedStagingBucket =
    "casa-school-staging-card-artifacts-$ExpectedAwsAccount-$AwsRegion"
$ExpectedProductionBucket =
    "casa-school-production-card-artifacts-$ExpectedAwsAccount-$AwsRegion"

$ExpectedStagingPrefix = "casa-school-staging"
$ExpectedProductionPrefix = "casa-school-production"

$Utf8NoBom =
    New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Read-EnvMap([string]$Path) {
    $map = @{}

    if (
        -not (
            Test-Path `
                -LiteralPath $Path `
                -PathType Leaf
        )
    ) {
        Fail "Required env file missing: $Path"
    }

    foreach (
        $raw in
        [System.IO.File]::ReadAllLines($Path)
    ) {
        $line =
            ([string]$raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace($line) -or
            $line.StartsWith("#")
        ) {
            continue
        }

        $index =
            $line.IndexOf("=")

        if ($index -le 0) {
            continue
        }

        $name =
            $line.Substring(0, $index).Trim()

        $value =
            $line.Substring($index + 1).Trim()

        if (
            (
                $value.StartsWith('"') -and
                $value.EndsWith('"')
            ) -or
            (
                $value.StartsWith("'") -and
                $value.EndsWith("'")
            )
        ) {
            $value =
                $value.Substring(
                    1,
                    $value.Length - 2
                )
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
    $stderr =
        [IO.Path]::GetTempFileName()

    $previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"

        $stdout =
            @(
                & $Command @Arguments 2> $stderr
            )

        $exitCode =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $previous
    }

    $rawError =
        if (
            Test-Path -LiteralPath $stderr
        ) {
            Get-Content `
                -LiteralPath $stderr `
                -Raw `
                -ErrorAction SilentlyContinue
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

    Remove-Item `
        -LiteralPath $stderr `
        -Force `
        -ErrorAction SilentlyContinue

    if (
        $exitCode -ne 0 -and
        -not $AllowFailure
    ) {
        Fail "$Label failed with exit code $exitCode. $errorText"
    }

    return [pscustomobject]@{
        ok = ($exitCode -eq 0)
        exitCode = $exitCode
        stdout = @($stdout)
        stderr = $errorText
    }
}

function Parse-JsonResult(
    [object]$Result,
    [string]$Label
) {
    $text =
        (
            @($Result.stdout) -join "`n"
        ).Trim()

    if (
        [string]::IsNullOrWhiteSpace($text)
    ) {
        Fail "$Label returned no JSON."
    }

    try {
        return (
            $text |
                ConvertFrom-Json
        )
    }
    catch {
        Fail "$Label returned invalid JSON."
    }
}

function As-Array([object]$Value) {
    if ($null -eq $Value) {
        return @()
    }

    if (
        $Value -is [System.Array]
    ) {
        return @($Value)
    }

    return @($Value)
}

function Extract-Teams([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if (
        $Json -is [System.Array]
    ) {
        return @($Json)
    }

    foreach ($property in @(
        "teams",
        "items",
        "data"
    )) {
        if (
            $null -ne
            $Json.PSObject.Properties[$property]
        ) {
            return As-Array $Json.$property
        }
    }

    return As-Array $Json
}

function Extract-Projects([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if (
        $Json -is [System.Array]
    ) {
        return @($Json)
    }

    foreach ($property in @(
        "projects",
        "items",
        "data"
    )) {
        if (
            $null -ne
            $Json.PSObject.Properties[$property]
        ) {
            return As-Array $Json.$property
        }
    }

    return As-Array $Json
}

function Get-PropertyString(
    [object]$Object,
    [string[]]$Names
) {
    if ($null -eq $Object) {
        return $null
    }

    foreach ($name in $Names) {
        $property =
            $Object.PSObject.Properties[$name]

        if (
            $null -ne $property -and
            $null -ne $property.Value
        ) {
            $value =
                ([string]$property.Value).Trim()

            if (
                -not (
                    [string]::IsNullOrWhiteSpace(
                        $value
                    )
                )
            ) {
                return $value
            }
        }
    }

    return $null
}

Write-Host "CASA School - Vercel Exact Identity + OIDC IAM Binding Readiness V1R2" -ForegroundColor Green
Write-Host "Read-only Vercel/AWS discovery. Resolves exact Vercel owner/team + project identity before any AWS OIDC/IAM trust is created."
Write-Host "No Vercel project creation/link mutation. No AWS IAM mutation. No S3 mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking CASA source + environment separation authority"

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

    foreach ($command in @(
        "git",
        "aws",
        "vercel"
    )) {
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
                    Join-Path $ProjectRoot "drizzle"
                ) `
                -Recurse `
                -File `
                -Filter "migration.sql" |
            Where-Object {
                $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
                $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
            }
        ).Count

    if (
        $migrationCount -ne
        $ExpectedMigrationCount
    ) {
        Fail "Expected $ExpectedMigrationCount migrations; found $migrationCount."
    }

    $stagingEnvPath =
        Join-Path `
            $ProjectRoot `
            ".env.staging.local"

    $productionEnvPath =
        Join-Path `
            $ProjectRoot `
            ".env.production.local"

    $stagingEnv =
        Read-EnvMap $stagingEnvPath

    $productionEnv =
        Read-EnvMap $productionEnvPath

    $expectedEnv = @(
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

    foreach ($entry in $expectedEnv) {
        if (
            -not $entry.map.ContainsKey(
                "CASA_CARD_STORAGE_BUCKET"
            ) -or
            [string]$entry.map[
                "CASA_CARD_STORAGE_BUCKET"
            ] -ne
            [string]$entry.bucket
        ) {
            Fail "$($entry.label) S3 env authority is not exact."
        }

        if (
            -not $entry.map.ContainsKey(
                "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
            ) -or
            [string]$entry.map[
                "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
            ] -ne
            [string]$entry.prefix
        ) {
            Fail "$($entry.label) Rekognition namespace authority is not exact."
        }
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     30 / VERIFIED"
    Write-Host "  Staging S3/env isolation:       VERIFIED"
    Write-Host "  Production S3/env isolation:    VERIFIED"

    Step "Locking AWS identity read-only"

    $awsIdentityResult =
        Invoke-Native `
            "aws" `
            @(
                "sts",
                "get-caller-identity",
                "--profile",
                $AwsProfile,
                "--region",
                $AwsRegion,
                "--output",
                "json",
                "--no-cli-pager"
            ) `
            "AWS caller identity"

    $awsIdentity =
        Parse-JsonResult `
            $awsIdentityResult `
            "AWS caller identity"

    if (
        [string]$awsIdentity.Account -ne
        $ExpectedAwsAccount
    ) {
        Fail "AWS account mismatch."
    }

    Write-Host "  AWS account:                    $ExpectedAwsAccount / VERIFIED"
    Write-Host "  AWS region:                     $AwsRegion"

    Step "Locking authenticated Vercel CLI identity"

    $vercelVersion =
        Invoke-Native `
            "vercel" `
            @(
                "--version"
            ) `
            "Vercel CLI version"

    $versionText =
        (
            @($vercelVersion.stdout) -join " "
        ).Trim()

    $whoami =
        Invoke-Native `
            "vercel" `
            @(
                "whoami",
                "--no-color"
            ) `
            "Vercel whoami"

    $vercelUser =
        (
            @($whoami.stdout) |
            Where-Object {
                -not (
                    [string]::IsNullOrWhiteSpace(
                        [string]$_
                    )
                )
            } |
            Select-Object -Last 1
        )

    $vercelUser =
        ([string]$vercelUser).Trim()

    if (
        [string]::IsNullOrWhiteSpace(
            $vercelUser
        )
    ) {
        Fail "Vercel CLI is not authenticated."
    }

    Write-Host "  Vercel CLI:                     $versionText"
    Write-Host "  authenticated user:             $vercelUser"

    Step "Discovering Vercel teams and scopes read-only"

    $teamsResult =
        Invoke-Native `
            "vercel" `
            @(
                "teams",
                "list",
                "--format",
                "json",
                "--no-color"
            ) `
            "Vercel teams list"

    $teamsJson =
        Parse-JsonResult `
            $teamsResult `
            "Vercel teams list"

    $teams =
        Extract-Teams $teamsJson

    $teamRows =
        New-Object System.Collections.Generic.List[object]

    foreach ($team in $teams) {
        $teamId =
            Get-PropertyString `
                $team `
                @(
                    "id",
                    "uid",
                    "teamId"
                )

        $teamSlug =
            Get-PropertyString `
                $team `
                @(
                    "slug"
                )

        $teamName =
            Get-PropertyString `
                $team `
                @(
                    "name"
                )

        if (
            -not (
                [string]::IsNullOrWhiteSpace(
                    $teamSlug
                )
            )
        ) {
            $teamRows.Add(
                [pscustomobject]@{
                    id = $teamId
                    slug = $teamSlug
                    name = $teamName
                }
            ) | Out-Null
        }
    }

    Write-Host "  teams discovered:               $($teamRows.Count)"

    foreach ($row in $teamRows) {
        Write-Host "    $($row.slug) / $($row.id)"
    }

    Step "Inspecting local Vercel project linkage"

    $linkPath =
        Join-Path `
            $ProjectRoot `
            ".vercel\project.json"

    $linked =
        Test-Path `
            -LiteralPath $linkPath `
            -PathType Leaf

    $linkedOrgId = $null
    $linkedProjectId = $null
    $linkedProjectName = $null

    if ($linked) {
        try {
            $linkJson =
                Get-Content `
                    -LiteralPath $linkPath `
                    -Raw |
                ConvertFrom-Json
        }
        catch {
            Fail ".vercel/project.json is invalid JSON."
        }

        $linkedOrgId =
            Get-PropertyString `
                $linkJson `
                @(
                    "orgId"
                )

        $linkedProjectId =
            Get-PropertyString `
                $linkJson `
                @(
                    "projectId"
                )

        $linkedProjectName =
            Get-PropertyString `
                $linkJson `
                @(
                    "projectName"
                )

        if (
            [string]::IsNullOrWhiteSpace(
                $linkedOrgId
            ) -or
            [string]::IsNullOrWhiteSpace(
                $linkedProjectId
            )
        ) {
            Fail ".vercel/project.json lacks orgId/projectId."
        }

        Write-Host "  local Vercel link:              PRESENT"
        Write-Host "  linked org ID:                  $linkedOrgId"
        Write-Host "  linked project ID:              $linkedProjectId"
    }
    else {
        Write-Host "  local Vercel link:              ABSENT"
    }

    Step "Enumerating CASA project candidates without mutation"

    $scopeCandidates =
        New-Object System.Collections.Generic.List[string]

    [void]$scopeCandidates.Add(
        $vercelUser
    )

    foreach ($row in $teamRows) {
        if (
            -not $scopeCandidates.Contains(
                [string]$row.slug
            )
        ) {
            [void]$scopeCandidates.Add(
                [string]$row.slug
            )
        }
    }

    $projectCandidates =
        New-Object System.Collections.Generic.List[object]

    $allProjects =
        New-Object System.Collections.Generic.List[object]

    foreach ($scope in $scopeCandidates) {
        $projectsResult =
            Invoke-Native `
                "vercel" `
                @(
                    "project",
                    "ls",
                    "--json",
                    "--scope",
                    $scope,
                    "--no-color"
                ) `
                "Vercel project list for scope $scope" `
                -AllowFailure

        if (-not $projectsResult.ok) {
            Write-Host "  scope ${scope}: project listing unavailable"
            continue
        }

        $projectsText =
            (
                @($projectsResult.stdout) -join "`n"
            ).Trim()

        if (
            [string]::IsNullOrWhiteSpace(
                $projectsText
            )
        ) {
            continue
        }

        try {
            $projectsJson =
                $projectsText |
                    ConvertFrom-Json
        }
        catch {
            Write-Host "  scope ${scope}: non-JSON project-list output skipped"
            continue
        }

        foreach (
            $project in
            (Extract-Projects $projectsJson)
        ) {
            $projectId =
                Get-PropertyString `
                    $project `
                    @(
                        "id",
                        "uid",
                        "projectId"
                    )

            $projectName =
                Get-PropertyString `
                    $project `
                    @(
                        "name"
                    )

            if (
                [string]::IsNullOrWhiteSpace(
                    $projectName
                )
            ) {
                continue
            }

            $item =
                [pscustomobject]@{
                    scope = $scope
                    id = $projectId
                    name = $projectName
                }

            $allProjects.Add($item) |
                Out-Null

            if (
                $projectName -match
                "(?i)casa"
            ) {
                $projectCandidates.Add(
                    $item
                ) | Out-Null
            }
        }
    }

    Write-Host "  total accessible projects:      $($allProjects.Count)"
    Write-Host "  CASA-named candidates:          $($projectCandidates.Count)"

    foreach ($candidate in $projectCandidates) {
        Write-Host "    $($candidate.scope) / $($candidate.name) / $($candidate.id)"
    }

    $resolvedOwnerSlug = $null
    $resolvedProjectName = $null
    $resolvedProjectId = $null

    if ($linked) {
        foreach ($row in $teamRows) {
            if (
                [string]$row.id -eq
                [string]$linkedOrgId
            ) {
                $resolvedOwnerSlug =
                    [string]$row.slug

                break
            }
        }

        if (
            [string]::IsNullOrWhiteSpace(
                $resolvedOwnerSlug
            )
        ) {
            foreach ($project in $allProjects) {
                if (
                    [string]$project.id -eq
                    [string]$linkedProjectId
                ) {
                    $resolvedOwnerSlug =
                        [string]$project.scope

                    break
                }
            }
        }

        $resolvedProjectId =
            $linkedProjectId

        if (
            -not (
                [string]::IsNullOrWhiteSpace(
                    $linkedProjectName
                )
            )
        ) {
            $resolvedProjectName =
                $linkedProjectName
        }
        else {
            foreach ($project in $allProjects) {
                if (
                    [string]$project.id -eq
                    [string]$linkedProjectId
                ) {
                    $resolvedProjectName =
                        [string]$project.name

                    break
                }
            }
        }
    }

    Step "Checking existing AWS Vercel OIDC provider read-only"

    $providersResult =
        Invoke-Native `
            "aws" `
            @(
                "iam",
                "list-open-id-connect-providers",
                "--profile",
                $AwsProfile,
                "--region",
                $AwsRegion,
                "--output",
                "json",
                "--no-cli-pager"
            ) `
            "AWS OIDC provider inventory"

    $providersJson =
        Parse-JsonResult `
            $providersResult `
            "AWS OIDC provider inventory"

    $providerArns =
        @(
            $providersJson.OpenIDConnectProviderList |
            ForEach-Object {
                [string]$_.Arn
            }
        )

    $expectedProviderArn = $null
    $providerExists = $false

    if (
        -not (
            [string]::IsNullOrWhiteSpace(
                $resolvedOwnerSlug
            )
        )
    ) {
        $expectedProviderArn =
            "arn:aws:iam::$ExpectedAwsAccount`:oidc-provider/oidc.vercel.com/$resolvedOwnerSlug"

        $providerExists =
            $providerArns -contains
            $expectedProviderArn
    }

    $classification = $null

    if (
        $linked -and
        -not (
            [string]::IsNullOrWhiteSpace(
                $resolvedOwnerSlug
            )
        ) -and
        -not (
            [string]::IsNullOrWhiteSpace(
                $resolvedProjectName
            )
        ) -and
        -not (
            [string]::IsNullOrWhiteSpace(
                $resolvedProjectId
            )
        )
    ) {
        $classification =
            "LINKED_EXACT_IDENTITY_READY_FOR_TEAM_ISSUER_IAM_BINDING"
    }
    elseif (
        -not $linked -and
        $projectCandidates.Count -eq 1
    ) {
        $classification =
            "ONE_EXISTING_CASA_PROJECT_FOUND__LOCAL_LINK_REQUIRED_BEFORE_IAM_BINDING"
    }
    elseif (
        -not $linked -and
        $projectCandidates.Count -eq 0
    ) {
        $classification =
            "NO_EXISTING_CASA_PROJECT_FOUND__VERCEL_PROJECT_CREATION_AND_LINK_REQUIRED"
    }
    else {
        $classification =
            "VERCEL_PROJECT_IDENTITY_AMBIGUOUS__LINK_EXACT_PROJECT_BEFORE_IAM_BINDING"
    }

    $stagingSubject = $null
    $productionSubject = $null
    $audience = $null
    $issuer = $null

    if (
        $classification -eq
        "LINKED_EXACT_IDENTITY_READY_FOR_TEAM_ISSUER_IAM_BINDING"
    ) {
        $issuer =
            "https://oidc.vercel.com/$resolvedOwnerSlug"

        $audience =
            "https://vercel.com/$resolvedOwnerSlug"

        # We intentionally use Vercel Preview as the first hosted Staging
        # identity until a custom staging environment is explicitly proven.
        $stagingSubject =
            "owner:$resolvedOwnerSlug`:project:$resolvedProjectName`:environment:preview"

        $productionSubject =
            "owner:$resolvedOwnerSlug`:project:$resolvedProjectName`:environment:production"
    }

    $stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\vercel-oidc-exact-identity-readiness-v1r2-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $evidence `
        -Force |
        Out-Null

    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_VERCEL_OIDC_EXACT_IDENTITY_READINESS_V1R2"
            source = [ordered]@{
                branch = $branch
                head = $head
                migrations = $migrationCount
            }
            aws = [ordered]@{
                account = $ExpectedAwsAccount
                region = $AwsRegion
                oidcProviderExpected = $expectedProviderArn
                oidcProviderExists = $providerExists
            }
            vercel = [ordered]@{
                cliVersion = $versionText
                authenticatedUser = $vercelUser
                linked = $linked
                linkedOrgId = $linkedOrgId
                linkedProjectId = $linkedProjectId
                ownerSlug = $resolvedOwnerSlug
                projectName = $resolvedProjectName
                projectId = $resolvedProjectId
                casaCandidateCount = $projectCandidates.Count
                issuer = $issuer
                audience = $audience
                stagingSubject = $stagingSubject
                productionSubject = $productionSubject
            }
            classification = $classification
            mutations = [ordered]@{
                vercel = $false
                awsIam = $false
                s3 = $false
                database = $false
                migration = $false
                deployment = $false
            }
        }

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "RESULT.json"),
        (
            $result |
                ConvertTo-Json -Depth 12
        ),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA VERCEL EXACT IDENTITY + OIDC IAM BINDING READINESS V1R2 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  AWS account/region:             $ExpectedAwsAccount / $AwsRegion"
    Write-Host "  Vercel authenticated user:      $vercelUser"
    Write-Host "  local Vercel project link:      $(if ($linked) { 'PRESENT' } else { 'ABSENT' })"
    Write-Host "  resolved owner/team slug:       $(if ($resolvedOwnerSlug) { $resolvedOwnerSlug } else { 'NOT YET RESOLVED' })"
    Write-Host "  resolved project name:          $(if ($resolvedProjectName) { $resolvedProjectName } else { 'NOT YET RESOLVED' })"
    Write-Host "  resolved project ID:            $(if ($resolvedProjectId) { $resolvedProjectId } else { 'NOT YET RESOLVED' })"
    Write-Host "  existing AWS Vercel OIDC IdP:   $(if ($providerExists) { 'YES' } else { 'NO / NOT YET CREATED' })"
    Write-Host "  classification:                 $classification"
    Write-Host "  Vercel mutation:                NONE / READ ONLY"
    Write-Host "  AWS IAM/S3 mutation:            NONE / READ ONLY"
    Write-Host "  DB/migration/deployment:        NONE"
    Write-Host "  evidence:                       $evidence"

    if (
        $classification -eq
        "LINKED_EXACT_IDENTITY_READY_FOR_TEAM_ISSUER_IAM_BINDING"
    ) {
        Write-Host ""
        Write-Host "  exact Team issuer:              $issuer"
        Write-Host "  exact audience:                 $audience"
        Write-Host "  Staging trust subject:          $stagingSubject"
        Write-Host "  Production trust subject:       $productionSubject"
        Write-Host ""
        Write-Host "NEXT: return this complete output. The next guarded installer can create the exact Team-issuer AWS OIDC provider and separate Staging/Production IAM roles." -ForegroundColor Yellow
    }
    else {
        Write-Host ""
        Write-Host "NEXT: return this complete output. It will tell us whether CASA must be linked to an existing Vercel project or whether the Vercel project must be created first." -ForegroundColor Yellow
    }
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL EXACT IDENTITY + OIDC IAM BINDING READINESS V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No Vercel, AWS IAM, S3, DB, migration, or deployment mutation was authorized by this probe."
    throw
}
