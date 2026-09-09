param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$DevelopmentDbHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$NeonApiHost = "api.us-east-2.aws.neon.tech"
$ControlHost = "aws.amazon.com"

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Try-ResolveSystem([string]$HostName) {
    try {
        $rows = @(
            Resolve-DnsName `
                -Name $HostName `
                -Type A `
                -DnsOnly `
                -ErrorAction Stop
        )

        $ips = @(
            $rows |
                Where-Object { $_.Type -eq "A" -and $_.IPAddress } |
                ForEach-Object { [string]$_.IPAddress } |
                Sort-Object -Unique
        )

        return [pscustomobject]@{
            ok = ($ips.Count -gt 0)
            ips = $ips
            error = $null
        }
    }
    catch {
        return [pscustomobject]@{
            ok = $false
            ips = @()
            error = $_.Exception.Message
        }
    }
}

function Try-ResolveServer(
    [string]$HostName,
    [string]$Server
) {
    try {
        $rows = @(
            Resolve-DnsName `
                -Name $HostName `
                -Type A `
                -DnsOnly `
                -Server $Server `
                -ErrorAction Stop
        )

        $ips = @(
            $rows |
                Where-Object { $_.Type -eq "A" -and $_.IPAddress } |
                ForEach-Object { [string]$_.IPAddress } |
                Sort-Object -Unique
        )

        return [pscustomobject]@{
            ok = ($ips.Count -gt 0)
            ips = $ips
            error = $null
        }
    }
    catch {
        return [pscustomobject]@{
            ok = $false
            ips = @()
            error = $_.Exception.Message
        }
    }
}

function BoolWord([bool]$Value) {
    if ($Value) { return "YES" }
    return "NO"
}

Write-Host "CASA School - Neon Development DNS Path Diagnosis V1" -ForegroundColor Green
Write-Host "READ ONLY. Diagnoses the ENOTFOUND api.us-east-2.aws.neon.tech failure."
Write-Host "No DNS change. No cache flush. No hosts-file edit. No CASA source/DB/AWS mutation."
Write-Host "No Staging/Production connection."

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "CASA repository not found: $ProjectRoot"
}

Set-Location $ProjectRoot

Step "Re-proving local CASA checkpoint only"

$branch = (& git branch --show-current).Trim()
$head = (& git rev-parse --short HEAD).Trim()

if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
    throw "CASA checkpoint drift: $branch/$head"
}

Write-Host "  branch/head:                 $branch/$head"
Write-Host "  source mutation planned:     NO"
Write-Host "  database connection planned: NO"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidence = Join-Path $ProjectRoot ".casa-backups\neon-development-dns-diagnosis-v1-$stamp"
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

Step "Reading Windows DNS configuration"

$dnsRows = @(
    Get-DnsClientServerAddress `
        -AddressFamily IPv4 `
        -ErrorAction SilentlyContinue |
    Where-Object {
        $_.ServerAddresses -and
        @($_.ServerAddresses).Count -gt 0
    } |
    Select-Object InterfaceAlias, InterfaceIndex, ServerAddresses
)

if ($dnsRows.Count -eq 0) {
    Write-Host "  active IPv4 DNS servers:     NOT DISCOVERED"
}
else {
    foreach ($row in $dnsRows) {
        Write-Host "  interface:                    $($row.InterfaceAlias)"
        Write-Host "    DNS servers:                $(@($row.ServerAddresses) -join ', ')"
    }
}

$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$hostsText = ""
if (Test-Path -LiteralPath $hostsPath -PathType Leaf) {
    $hostsText = Get-Content -LiteralPath $hostsPath -Raw -ErrorAction SilentlyContinue
}

$hostsMentionsNeon =
    $hostsText -match [regex]::Escape($NeonApiHost) -or
    $hostsText -match [regex]::Escape($DevelopmentDbHost)

Write-Host "  hosts-file Neon override:    $(BoolWord $hostsMentionsNeon)"

Step "Testing normal Windows DNS resolution"

$systemApi = Try-ResolveSystem $NeonApiHost
$systemDb = Try-ResolveSystem $DevelopmentDbHost
$systemControl = Try-ResolveSystem $ControlHost

Write-Host "  Neon API host:               $(BoolWord $systemApi.ok)"
if ($systemApi.ok) {
    Write-Host "    A records:                  $($systemApi.ips -join ', ')"
}
else {
    Write-Host "    error:                      $($systemApi.error)"
}

Write-Host "  Development DB host:         $(BoolWord $systemDb.ok)"
if ($systemDb.ok) {
    Write-Host "    A records:                  $($systemDb.ips -join ', ')"
}
else {
    Write-Host "    error:                      $($systemDb.error)"
}

Write-Host "  control host aws.amazon.com:  $(BoolWord $systemControl.ok)"
if (-not $systemControl.ok) {
    Write-Host "    error:                      $($systemControl.error)"
}

Step "Comparing direct public DNS resolvers"

$publicResolvers = @(
    [pscustomobject]@{ name = "Cloudflare"; server = "1.1.1.1" },
    [pscustomobject]@{ name = "Google"; server = "8.8.8.8" }
)

$publicResults = @()

foreach ($resolver in $publicResolvers) {
    $api = Try-ResolveServer $NeonApiHost $resolver.server
    $db = Try-ResolveServer $DevelopmentDbHost $resolver.server
    $control = Try-ResolveServer $ControlHost $resolver.server

    $entry = [pscustomobject]@{
        name = $resolver.name
        server = $resolver.server
        api = $api
        db = $db
        control = $control
    }
    $publicResults += $entry

    Write-Host "  $($resolver.name) [$($resolver.server)]"
    Write-Host "    Neon API:                  $(BoolWord $api.ok)"
    Write-Host "    Development DB:            $(BoolWord $db.ok)"
    Write-Host "    control host:              $(BoolWord $control.ok)"
}

Step "Testing basic outbound network reachability"

$tcpCloudflare = $false
$tcpGoogleDns = $false

try {
    $tcpCloudflare = [bool](
        Test-NetConnection `
            -ComputerName "1.1.1.1" `
            -Port 443 `
            -InformationLevel Quiet `
            -WarningAction SilentlyContinue
    )
}
catch {}

try {
    $tcpGoogleDns = [bool](
        Test-NetConnection `
            -ComputerName "8.8.8.8" `
            -Port 443 `
            -InformationLevel Quiet `
            -WarningAction SilentlyContinue
    )
}
catch {}

Write-Host "  TCP 443 -> 1.1.1.1:          $(BoolWord $tcpCloudflare)"
Write-Host "  TCP 443 -> 8.8.8.8:          $(BoolWord $tcpGoogleDns)"

$publicApiSuccess = @(
    $publicResults |
        Where-Object { $_.api.ok }
).Count -gt 0

$publicDbSuccess = @(
    $publicResults |
        Where-Object { $_.db.ok }
).Count -gt 0

$publicControlSuccess = @(
    $publicResults |
        Where-Object { $_.control.ok }
).Count -gt 0

$classification = "UNCLASSIFIED"

if ($hostsMentionsNeon) {
    $classification = "LOCAL_HOSTS_FILE_OVERRIDE_PRESENT"
}
elseif (-not $systemControl.ok -and -not $publicControlSuccess) {
    $classification = "BROADER_DNS_OR_NETWORK_FAILURE"
}
elseif (-not $systemApi.ok -and $publicApiSuccess) {
    $classification = "SYSTEM_OR_ROUTER_DNS_FAILURE_FOR_NEON"
}
elseif (-not $systemApi.ok -and -not $publicApiSuccess -and ($systemControl.ok -or $publicControlSuccess)) {
    $classification = "NEON_DOMAIN_RESOLUTION_BLOCKED_OR_UPSTREAM_DNS_FAILURE"
}
elseif ($systemApi.ok -and $systemDb.ok) {
    $classification = "DNS_CURRENTLY_GREEN__TRANSIENT_FAILURE_LIKELY"
}
elseif ($systemApi.ok -and -not $systemDb.ok -and $publicDbSuccess) {
    $classification = "SYSTEM_DNS_PARTIAL_FAILURE"
}
elseif (($tcpCloudflare -or $tcpGoogleDns) -and -not $systemControl.ok) {
    $classification = "INTERNET_REACHABLE_BUT_SYSTEM_DNS_BROKEN"
}

$result = [ordered]@{
    createdAt = (Get-Date -Format o)
    classification = $classification
    neonApiHost = $NeonApiHost
    developmentDbHost = $DevelopmentDbHost
    systemDns = [ordered]@{
        neonApi = [ordered]@{
            ok = [bool]$systemApi.ok
            ips = @($systemApi.ips)
            error = $systemApi.error
        }
        developmentDb = [ordered]@{
            ok = [bool]$systemDb.ok
            ips = @($systemDb.ips)
            error = $systemDb.error
        }
        control = [ordered]@{
            ok = [bool]$systemControl.ok
            ips = @($systemControl.ips)
            error = $systemControl.error
        }
    }
    publicResolvers = @(
        $publicResults | ForEach-Object {
            [ordered]@{
                name = $_.name
                server = $_.server
                neonApi = [bool]$_.api.ok
                developmentDb = [bool]$_.db.ok
                control = [bool]$_.control.ok
            }
        }
    )
    hostsOverride = [bool]$hostsMentionsNeon
    outbound443 = [ordered]@{
        cloudflare = [bool]$tcpCloudflare
        googleDns = [bool]$tcpGoogleDns
    }
    sourceMutation = $false
    dbMutation = $false
    awsMutation = $false
    stagingTouched = $false
    productionTouched = $false
}

$result |
    ConvertTo-Json -Depth 12 |
    Set-Content `
        -LiteralPath (Join-Path $evidence "RESULT.json") `
        -Encoding UTF8

Write-Host ""
Write-Host "CASA NEON DEVELOPMENT DNS PATH DIAGNOSIS COMPLETE" -ForegroundColor Green
Write-Host "  classification:              $classification"
Write-Host "  source mutation:             NO"
Write-Host "  database mutation:           NO"
Write-Host "  DNS/network mutation:        NO"
Write-Host "  Staging/Production:          NOT TOUCHED"
Write-Host "  evidence:                    $evidence"
Write-Host ""
Write-Host "Return this complete output. Do not rescan the student card."
