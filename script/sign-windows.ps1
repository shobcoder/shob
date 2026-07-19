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

# The SignPath policy (test-signing) requires submission via a trusted build
# system. Direct Submit-SigningRequest API calls are rejected with HTTP 403:
#   "The selected signing policy requires that the signing request is submitted
#    via a trusted build system."
# Windows CI signing is performed by signpath/github-action-submit-signing-request
# in .github/workflows/build.yml (batch for win-unpacked, then the NSIS installer).
if ($env:SIGNPATH_API_TOKEN) {
  Write-Host "Skipping in-process SignPath file signing (trusted build system required)."
  Write-Host "Paths left unsigned here (signed later in CI when applicable): $($Path -join ', ')"
  exit 0
}

Write-Host "Skipping Windows signing because SIGNPATH_API_TOKEN is not set"
exit 0
