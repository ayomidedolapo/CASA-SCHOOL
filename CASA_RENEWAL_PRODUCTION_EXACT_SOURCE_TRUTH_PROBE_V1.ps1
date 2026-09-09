param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"

$RelativePath =
    "src\server\card-production\renewal-production.ts"

$ExpectedCanonicalLfHash =
    "458982ebd6076b28777ad14aad1d66c9dd960e142e5a42b426cc87867997519"

function Stop-Phase([string]$Message) {
    throw "ABORTED: $Message"
}

function ShaBytes([byte[]]$Bytes) {
    $Hasher =
        [System.Security.Cryptography.SHA256]::Create()

    try {
        $Hash =
            $Hasher.ComputeHash($Bytes)

        return (
            -join (
                $Hash |
                    ForEach-Object {
                        $_.ToString("x2")
                    }
            )
        )
    }
    finally {
        $Hasher.Dispose()
    }
}

function Utf8Bytes([string]$Text) {
    return (
        New-Object System.Text.UTF8Encoding($false)
    ).GetBytes($Text)
}

Write-Host "CASA School - renewal-production.ts Exact Source Truth Probe V1" -ForegroundColor Green
Write-Host "READ ONLY. No source write. No DB read/write. No build. No AWS. No Staging/Production connection."

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    Stop-Phase "Repository not found: $ProjectRoot"
}

Set-Location $ProjectRoot

$Branch =
    (& git branch --show-current).Trim()

$Head =
    (& git rev-parse --short HEAD).Trim()

if (
    $Branch -ne $ExpectedBranch -or
    $Head -ne $ExpectedHead
) {
    Stop-Phase "Git checkpoint drift: $Branch/$Head"
}

$Path =
    Join-Path `
        $ProjectRoot `
        $RelativePath

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Stop-Phase "File missing: $RelativePath"
}

$Bytes =
    [System.IO.File]::ReadAllBytes($Path)

$RawHash =
    ShaBytes $Bytes

$HasUtf8Bom =
    $Bytes.Length -ge 3 -and
    $Bytes[0] -eq 0xEF -and
    $Bytes[1] -eq 0xBB -and
    $Bytes[2] -eq 0xBF

$Text =
    [System.IO.File]::ReadAllText($Path)

if (
    $Text.Length -gt 0 -and
    [int][char]$Text[0] -eq 0xFEFF
) {
    $TextNoBom =
        $Text.Substring(1)
}
else {
    $TextNoBom =
        $Text
}

$Lf =
    $TextNoBom.Replace("`r`n", "`n").Replace("`r", "`n")

$LfHash =
    ShaBytes (Utf8Bytes $Lf)

$LfNoFinalNewline =
    $Lf.TrimEnd("`n")

$LfNoFinalNewlineHash =
    ShaBytes (Utf8Bytes $LfNoFinalNewline)

$LfExactlyOneFinalNewline =
    $Lf.TrimEnd("`n") + "`n"

$LfExactlyOneFinalNewlineHash =
    ShaBytes (Utf8Bytes $LfExactlyOneFinalNewline)

$SemanticMarkers =
    [ordered]@{
        routineHelper =
            $TextNoBom.Contains(
                "function routineCardRenewalDisabled(): boolean"
            )
        helperCallCount =
            ([regex]::Matches(
                $TextNoBom,
                "routineCardRenewalDisabled\(\)"
            )).Count
        disabledCodeCount =
            ([regex]::Matches(
                $TextNoBom,
                "ROUTINE_CARD_RENEWAL_DISABLED"
            )).Count
        digitalOnlyMessage =
            $TextNoBom.Contains(
                "Class and academic-session changes are digital only"
            )
        itemEntrypoint =
            $TextNoBom.Contains(
                "export async function produceStudentCardRenewalItem("
            )
    }

$GitStatus =
    @(
        & git status --short -- $RelativePath
    ) -join "`n"

$GitDiff =
    @(
        & git diff --no-ext-diff -- $RelativePath
    ) -join "`n"

$Classification =
    "ACTUAL_CONTENT_DRIFT"

if ($RawHash -eq $ExpectedCanonicalLfHash) {
    $Classification =
        "BYTE_EXACT_CANONICAL"
}
elseif ($LfHash -eq $ExpectedCanonicalLfHash) {
    $Classification =
        "BOM_OR_LINE_ENDING_ONLY"
}
elseif ($LfExactlyOneFinalNewlineHash -eq $ExpectedCanonicalLfHash) {
    $Classification =
        "BOM_LINE_ENDING_OR_FINAL_NEWLINE_ONLY"
}
elseif ($LfNoFinalNewlineHash -eq $ExpectedCanonicalLfHash) {
    $Classification =
        "BOM_LINE_ENDING_OR_FINAL_NEWLINE_ONLY"
}
elseif (
    [bool]$SemanticMarkers.routineHelper -and
    [int]$SemanticMarkers.helperCallCount -eq 3 -and
    [int]$SemanticMarkers.disabledCodeCount -eq 2 -and
    [bool]$SemanticMarkers.digitalOnlyMessage -and
    [bool]$SemanticMarkers.itemEntrypoint
) {
    $Classification =
        "SEMANTIC_PERMANENT_CARD_CONTRACT_PRESENT_BUT_BYTES_DIFFER"
}

$Stamp =
    Get-Date -Format "yyyyMMdd-HHmmss"

$Evidence =
    Join-Path `
        $ProjectRoot `
        ".casa-backups\renewal-production-source-truth-v1-$Stamp"

New-Item `
    -ItemType Directory `
    -Path $Evidence `
    -Force |
    Out-Null

$Result =
    [ordered]@{
        createdAt =
            (Get-Date -Format o)
        branch =
            $Branch
        head =
            $Head
        file =
            $RelativePath
        expectedCanonicalLfSha256 =
            $ExpectedCanonicalLfHash
        rawSha256 =
            $RawHash
        lfNormalizedNoBomSha256 =
            $LfHash
        lfNoFinalNewlineSha256 =
            $LfNoFinalNewlineHash
        lfExactlyOneFinalNewlineSha256 =
            $LfExactlyOneFinalNewlineHash
        utf8Bom =
            $HasUtf8Bom
        semanticMarkers =
            $SemanticMarkers
        gitStatus =
            $GitStatus
        gitDiffPresent =
            -not [string]::IsNullOrWhiteSpace($GitDiff)
        classification =
            $Classification
        sourceMutation =
            $false
        databaseConnected =
            $false
        awsCalled =
            $false
        stagingConnected =
            $false
        productionConnected =
            $false
    }

$Result |
    ConvertTo-Json -Depth 12 |
    Set-Content `
        -LiteralPath (
            Join-Path `
                $Evidence `
                "RESULT.json"
        ) `
        -Encoding UTF8

if (-not [string]::IsNullOrWhiteSpace($GitDiff)) {
    [System.IO.File]::WriteAllText(
        (Join-Path $Evidence "GIT_DIFF.txt"),
        $GitDiff,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

Write-Host ""
Write-Host "CASA renewal-production.ts SOURCE TRUTH PROBE IS GREEN" -ForegroundColor Green
Write-Host "  branch/head:                     $Branch/$Head"
Write-Host "  expected canonical LF SHA256:    $ExpectedCanonicalLfHash"
Write-Host "  raw SHA256:                      $RawHash"
Write-Host "  LF normalized/no-BOM SHA256:     $LfHash"
Write-Host "  UTF-8 BOM:                       $(if ($HasUtf8Bom) { 'YES' } else { 'NO' })"
Write-Host "  permanent-card helper:           $($SemanticMarkers.routineHelper)"
Write-Host "  helper occurrences:              $($SemanticMarkers.helperCallCount) / expected 3"
Write-Host "  disabled-code occurrences:       $($SemanticMarkers.disabledCodeCount) / expected 2"
Write-Host "  digital-only policy message:     $($SemanticMarkers.digitalOnlyMessage)"
Write-Host "  git status:                      $(if ([string]::IsNullOrWhiteSpace($GitStatus)) { 'CLEAN FOR FILE' } else { $GitStatus })"
Write-Host "  git diff:                        $(if ([string]::IsNullOrWhiteSpace($GitDiff)) { 'NONE' } else { 'PRESENT / SAVED TO EVIDENCE' })"
Write-Host "  classification:                  $Classification"
Write-Host "  mutation:                        NONE / READ ONLY"
Write-Host "  DB/AWS/Staging/Production:       NOT CONNECTED"
Write-Host "  evidence:                        $Evidence"
Write-Host ""
Write-Host "NEXT: return this complete output. Do not edit renewal-production.ts manually." -ForegroundColor Yellow
