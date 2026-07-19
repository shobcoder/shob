param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

$ErrorActionPreference = "Stop"

if (-not $Path -or $Path.Count -eq 0) {
  throw "At least one path is required"
}

foreach ($item in $Path) {
  if (-not (Test-Path -LiteralPath $item -PathType Leaf)) {
    throw "File does not exist: $item"
  }

  $resolved = (Resolve-Path -LiteralPath $item).Path
  $signature = Get-AuthenticodeSignature -LiteralPath $resolved

  if ($signature.Status -ne "Valid" -or -not $signature.SignerCertificate) {
    throw "Invalid or untrusted Authenticode signature for '$resolved': $($signature.Status) $($signature.StatusMessage)"
  }

  Write-Host "Verified Authenticode signature: $resolved"
  Write-Host "  Subject: $($signature.SignerCertificate.Subject)"
  Write-Host "  Issuer: $($signature.SignerCertificate.Issuer)"
  Write-Host "  Thumbprint: $($signature.SignerCertificate.Thumbprint)"
}
