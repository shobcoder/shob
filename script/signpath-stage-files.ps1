param(
  [Parameter(Mandatory = $true)]
  [string] $SourceDir,

  [Parameter(Mandatory = $true)]
  [string] $StagingDir,

  [string[]] $Extensions = @("*.exe", "*.dll", "*.node")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SourceDir)) {
  throw "Source directory does not exist: $SourceDir"
}

if (Test-Path $StagingDir) {
  Remove-Item -Path $StagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

$sourceRoot = (Resolve-Path $SourceDir).Path
Write-Host "Staging signable files from $sourceRoot -> $StagingDir"

$files = foreach ($pattern in $Extensions) {
  Get-ChildItem -Path $sourceRoot -Filter $pattern -Recurse -File -ErrorAction SilentlyContinue
}

if (-not $files -or $files.Count -eq 0) {
  throw "No files matching $($Extensions -join ', ') under $sourceRoot"
}

foreach ($file in $files) {
  $relPath = $file.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
  $destPath = Join-Path $StagingDir $relPath
  $destDir = Split-Path $destPath -Parent
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Copy-Item -Path $file.FullName -Destination $destPath -Force
}

Write-Host "Staged $($files.Count) file(s) for SignPath."
