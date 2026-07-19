param(
  [Parameter(Mandatory=$true)]
  [string] $AppOutDir
)

$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping batch signing because this is not running on GitHub Actions"
  exit 0
}

# The SignPath release-signing policy requires submission via a trusted build
# system. Direct Submit-SigningRequest API calls are rejected with HTTP 403:
#   "The selected signing policy requires that the signing request is submitted
#    via a trusted build system."
# Windows CI signing is performed by signpath/github-action-submit-signing-request
# in .github/workflows/build.yml after electron-builder packs the app directory.
if ($env:SIGNPATH_API_TOKEN) {
  Write-Host "Skipping in-process SignPath batch signing (trusted build system required)."
  Write-Host "Signing is handled by the SignPath GitHub Action steps in the build workflow."
  exit 0
}

Write-Host "Skipping batch signing because SIGNPATH_API_TOKEN is not set"
exit 0
