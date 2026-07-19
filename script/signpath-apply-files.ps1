param(
  [Parameter(Mandatory = $true)]
  [string] $SignedDir,

  [Parameter(Mandatory = $true)]
  [string] $TargetDir
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SignedDir)) {
  throw "Signed directory does not exist: $SignedDir"
}

if (-not (Test-Path $TargetDir)) {
  throw "Target directory does not exist: $TargetDir"
}

$signedRoot = (Resolve-Path $SignedDir).Path
$targetRoot = (Resolve-Path $TargetDir).Path

# upload-artifact may nest content under a single directory; prefer that as the
# root when the top level has no files of its own.
$topLevelFiles = @(Get-ChildItem -Path $signedRoot -File -ErrorAction SilentlyContinue)
$topLevelDirs = @(Get-ChildItem -Path $signedRoot -Directory -ErrorAction SilentlyContinue)
if ($topLevelFiles.Count -eq 0 -and $topLevelDirs.Count -eq 1) {
  $signedRoot = $topLevelDirs[0].FullName
  Write-Host "Using nested signed root: $signedRoot"
}

Write-Host "Applying signed files from $signedRoot -> $targetRoot"

$signedFiles = Get-ChildItem -Path $signedRoot -Recurse -File
if (-not $signedFiles -or $signedFiles.Count -eq 0) {
  throw "No signed files found under $signedRoot"
}

$replaced = 0
foreach ($signedFile in $signedFiles) {
  $relPath = $signedFile.FullName.Substring($signedRoot.Length).TrimStart('\', '/')
  $targetPath = Join-Path $targetRoot $relPath

  if (-not (Test-Path $targetPath)) {
    Write-Warning "Signed file has no counterpart in target: $relPath"
    continue
  }

  Copy-Item -Path $signedFile.FullName -Destination $targetPath -Force
  $replaced++
}

if ($replaced -eq 0) {
  throw "No signed files were applied to $targetRoot"
}

Write-Host "Applied $replaced signed file(s)."
