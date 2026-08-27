param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"

$PreviousNodeOptions = $env:NODE_OPTIONS

try {
    $env:NODE_OPTIONS =
        "--dns-result-order=ipv4first --no-network-family-autoselection"

    $env:CASA_PROVISION_SCHOOL_NAME =
        Read-Host "School name"

    $env:CASA_PROVISION_SCHOOL_SLUG =
        Read-Host "School slug (lowercase, hyphenated)"

    $env:CASA_PROVISION_OWNER_NAME =
        Read-Host "Owner full name"

    $env:CASA_PROVISION_OWNER_IDENTIFIER =
        Read-Host "Owner email or E.164 phone"

    $SecurePassword =
        Read-Host "Owner password" -AsSecureString

    $Bstr =
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
            $SecurePassword
        )

    try {
        $env:CASA_PROVISION_OWNER_PASSWORD =
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
                $Bstr
            )

        Push-Location $ProjectRoot

        node `
            --env-file=.env.local `
            --import tsx `
            scripts/provision-first-owner.ts

        if ($LASTEXITCODE -ne 0) {
            throw "Provisioning command failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        if ($Bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
                $Bstr
            )
        }

        Pop-Location -ErrorAction SilentlyContinue
    }
}
finally {
    Remove-Item Env:CASA_PROVISION_SCHOOL_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:CASA_PROVISION_SCHOOL_SLUG -ErrorAction SilentlyContinue
    Remove-Item Env:CASA_PROVISION_OWNER_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:CASA_PROVISION_OWNER_IDENTIFIER -ErrorAction SilentlyContinue
    Remove-Item Env:CASA_PROVISION_OWNER_PASSWORD -ErrorAction SilentlyContinue

    if ($null -eq $PreviousNodeOptions) {
        Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    }
    else {
        $env:NODE_OPTIONS = $PreviousNodeOptions
    }
}