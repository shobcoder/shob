param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

$ErrorActionPreference = "Stop"

if (-not $Path -or $Path.Count -eq 0) {
  throw "At least one path is required"
}

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping Windows signing because this is not running on GitHub Actions"
  exit 0
}

$apiToken = $env:SIGNPATH_API_TOKEN

if (-not $apiToken) {
  Write-Host "Skipping Windows signing because SIGNPATH_API_TOKEN is not set"
  exit 0
}

$module = Get-Module -ListAvailable -Name SignPath

if (-not $module) {
  try {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
  }
  catch {
    Write-Host "NuGet package provider install skipped: $($_.Exception.Message)"
  }

  Install-Module -Name SignPath -Force -Repository PSGallery -Scope CurrentUser
}

Import-Module SignPath -Force

$files = @($Path | ForEach-Object { Resolve-Path $_ -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty Path -Unique)

if (-not $files -or $files.Count -eq 0) {
  throw "No files matched the requested paths"
}

foreach ($file in $files) {
  Write-Host "Signing $file with SignPath..."
  $tempOut = "$file.signed"
  
  Submit-SigningRequest `
    -InputArtifactPath $file `
    -ApiToken $apiToken `
    -OrganizationId "61cfd03f-8ef9-4901-b822-eeb51545687f" `
    -ProjectSlug "shob" `
    -SigningPolicySlug "release-signing" `
    -OutputArtifactPath $tempOut `
    -WaitForCompletion

  if (Test-Path $tempOut) {
    Move-Item -Path $tempOut -Destination $file -Force
    Write-Host "Successfully signed $file"
  } else {
    throw "Signing failed, no output artifact found at $tempOut"
  }
}
