param(
  [Parameter(Mandatory=$true)]
  [string] $AppOutDir
)

$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping batch signing because this is not running on GitHub Actions"
  exit 0
}

$apiToken = $env:SIGNPATH_API_TOKEN

if (-not $apiToken) {
  Write-Host "Skipping batch signing because SIGNPATH_API_TOKEN is not set"
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

# Create staging directories
$tempDir = Join-Path $env:TEMP "signpath-batch-$(New-Guid)"
$stagingUnsigned = Join-Path $tempDir "unsigned"
$stagingSigned = Join-Path $tempDir "signed"
$zipUnsigned = Join-Path $tempDir "unsigned.zip"
$zipSigned = Join-Path $tempDir "signed.zip"

New-Item -ItemType Directory -Path $stagingUnsigned -Force | Out-Null
New-Item -ItemType Directory -Path $stagingSigned -Force | Out-Null

Write-Host "Collecting .exe, .dll, and .node files from $AppOutDir..."
$files = Get-ChildItem -Path $AppOutDir -Include *.exe, *.dll, *.node -Recurse -File

if (-not $files -or $files.Count -eq 0) {
  Write-Host "No files found to sign."
  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}

foreach ($file in $files) {
  # Compute relative path
  $relPath = $file.FullName.Substring($AppOutDir.Length).TrimStart('\', '/')
  $destPath = Join-Path $stagingUnsigned $relPath
  $destDir = Split-Path $destPath -Parent
  
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  
  Copy-Item -Path $file.FullName -Destination $destPath -Force
}

Write-Host "Zipping unsigned files..."
# Compress the *contents* of stagingUnsigned so the zip doesn't have an "unsigned" root folder
Compress-Archive -Path "$stagingUnsigned\*" -DestinationPath $zipUnsigned -Force

Write-Host "Submitting batch signing request to SignPath..."
Submit-SigningRequest `
  -InputArtifactPath $zipUnsigned `
  -ApiToken $apiToken `
  -OrganizationId "61cfd03f-8ef9-4901-b822-eeb51545687f" `
  -ProjectSlug "shob" `
  -SigningPolicySlug "release-signing" `
  -OutputArtifactPath $zipSigned `
  -WaitForCompletion

if (-not (Test-Path $zipSigned)) {
  throw "SignPath batch signing failed. Output artifact not found at $zipSigned"
}

Write-Host "Extracting signed files..."
Expand-Archive -Path $zipSigned -DestinationPath $stagingSigned -Force

Write-Host "Replacing original files with signed files..."
$signedFiles = Get-ChildItem -Path $stagingSigned -Recurse -File
foreach ($signedFile in $signedFiles) {
  $relPath = $signedFile.FullName.Substring($stagingSigned.Length).TrimStart('\', '/')
  $targetPath = Join-Path $AppOutDir $relPath
  
  if (Test-Path $targetPath) {
    Copy-Item -Path $signedFile.FullName -Destination $targetPath -Force
  } else {
    Write-Warning "Signed file $targetPath does not exist in the original app directory."
  }
}

Write-Host "Batch signing complete."
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
