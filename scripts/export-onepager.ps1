param(
    [string]$Html = "docs/Executive-One-Pager.html",
    [string]$Out = "docs/Executive-One-Pager.pdf"
)
$ErrorActionPreference = 'Stop'

# Resolve full paths and build file:// URI
$htmlPath = Resolve-Path -Path $Html
$outPath = Join-Path -Path (Resolve-Path -Path (Split-Path -Parent $Out)) -ChildPath (Split-Path -Leaf $Out)
$uri = [System.Uri]::new($htmlPath)
$uriStr = $uri.AbsoluteUri

function Invoke-Headless {
    param(
        [string]$exePath,
        [string]$name
    )
    if (-not (Test-Path $exePath)) { return $false }
    Write-Host "Attempting ${name} headless export..."
    & $exePath --headless --disable-gpu --print-to-pdf="$outPath" "$uriStr" | Out-Null
    if (Test-Path $outPath) { Write-Host "Success via ${name}: $outPath"; return $true }
    return $false
}

# Try Microsoft Edge
$edge = (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if (-not $edge) {
    $edgeCandidates = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($cand in $edgeCandidates) {
        if (Test-Path $cand) { $edge = $cand; break }
    }
}
if ($edge) {
    if (Invoke-Headless -exePath $edge -name 'Edge') { exit 0 }
}

# Try Google Chrome / Chromium
$chromeCmd = Get-Command chrome.exe, chromium.exe, chrome, chromium -ErrorAction SilentlyContinue | Select-Object -First 1
if ($chromeCmd) {
    if (Invoke-Headless -exePath $chromeCmd.Source -name 'Chrome/Chromium') { exit 0 }
}

Write-Warning "Headless PDF export not available. Open docs/Executive-One-Pager.html in a browser and Print to PDF."
