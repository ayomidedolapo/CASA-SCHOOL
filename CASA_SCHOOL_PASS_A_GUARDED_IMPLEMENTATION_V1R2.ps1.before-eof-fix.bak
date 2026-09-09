$installer = ".\CASA_SCHOOL_PASS_A_GUARDED_IMPLEMENTATION_V1R2.ps1"

Copy-Item $installer "$installer.before-eof-fix.bak" -Force

$text = [IO.File]::ReadAllText((Resolve-Path $installer))

# Update the two payload hashes to the normalized LF-at-EOF versions.
$text = $text.Replace(
    "2f3e513a21a3dcefdfb1a5f9224722ba04b8cf793976d3a4c51d32c7779abc6d",
    "2f3e513a21a3dcefdfb1a5f9224722ba04b8cf793976d3a4c51d32c7779abc6d"
)

$text = $text.Replace(
    "53d2293a7a980cf4ea71b56486192dff51ed8b69bb793394b2cd4a6e32fe18ab",
    "53d2293a7a980cf4ea71b56486192dff51ed8b69bb793394b2cd4a6e32fe18ab"
)

$anchor = '  Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadExtract -Force

  # Normalize the two known Pass A payload files that contained one
  # superfluous blank line at EOF. This is source-hygiene only.
  foreach ($relative in @(
    "src/db/schema/attendance-readiness.ts",
    "src/server/attendance/readiness.ts"
  )) {
    $payloadPathToNormalize = Join-Path $payloadExtract ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $payloadTextToNormalize = [IO.File]::ReadAllText($payloadPathToNormalize)

    # Exactly one terminating LF; preserve all other source bytes/text.
    $payloadTextToNormalize = [regex]::Replace(
      $payloadTextToNormalize,
      "(\r?\n){2}\z",
      "`n"
    )

    [IO.File]::WriteAllText(
      $payloadPathToNormalize,
      $payloadTextToNormalize,
      (New-Object System.Text.UTF8Encoding($false))
    )
  }'

$replacement = @'
  Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadExtract -Force

  # Normalize the two known Pass A payload files that contained one
  # superfluous blank line at EOF. This is source-hygiene only.
  foreach ($relative in @(
    "src/db/schema/attendance-readiness.ts",
    "src/server/attendance/readiness.ts"
  )) {
    $payloadPathToNormalize = Join-Path $payloadExtract ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $payloadTextToNormalize = [IO.File]::ReadAllText($payloadPathToNormalize)

    # Exactly one terminating LF; preserve all other source bytes/text.
    $payloadTextToNormalize = [regex]::Replace(
      $payloadTextToNormalize,
      "(\r?\n){2}\z",
      "`n"
    )

    [IO.File]::WriteAllText(
      $payloadPathToNormalize,
      $payloadTextToNormalize,
      (New-Object System.Text.UTF8Encoding($false))
    )
  }

  # Normalize the two known Pass A payload files that contained one
  # superfluous blank line at EOF. This is source-hygiene only.
  foreach ($relative in @(
    "src/db/schema/attendance-readiness.ts",
    "src/server/attendance/readiness.ts"
  )) {
    $payloadPathToNormalize = Join-Path $payloadExtract ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $payloadTextToNormalize = [IO.File]::ReadAllText($payloadPathToNormalize)

    # Exactly one terminating LF; preserve all other source bytes/text.
    $payloadTextToNormalize = [regex]::Replace(
      $payloadTextToNormalize,
      "(\r?\n){2}\z",
      "`n"
    )

    [IO.File]::WriteAllText(
      $payloadPathToNormalize,
      $payloadTextToNormalize,
      (New-Object System.Text.UTF8Encoding($false))
    )
  }
'@

if (-not $text.Contains($anchor)) {
    throw "ABORTED: Could not locate the V1R2 payload expansion anchor."
}

$text = $text.Replace($anchor, $replacement.TrimEnd("`r", "`n"))

[IO.File]::WriteAllText(
    (Resolve-Path $installer),
    $text,
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "V1R2 EOF hygiene repair applied."