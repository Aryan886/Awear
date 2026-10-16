param(
    [string]$Architectures = 'arm64-v8a,x86_64',
    [switch]$SkipPrebuild
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$installedJdks = Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'
if (Test-Path -LiteralPath $installedJdks) {
    $jdk = Get-ChildItem -LiteralPath $installedJdks -Directory -Filter 'jdk-17*' | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    throw 'Set JAVA_HOME to a compatible JDK 17 installation before building.'
}
$env:ANDROID_HOME = $androidSdk
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:NODE_ENV = 'production'
Push-Location $projectRoot
try {
    if (-not $SkipPrebuild) {
        & npx.cmd expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw 'Expo Prebuild failed.' }
    }
    $licenseDirectory = Join-Path $projectRoot 'android\app\src\main\assets\licenses'
    New-Item -ItemType Directory -Path $licenseDirectory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\fonts\PlusJakartaSans-OFL.txt') -Destination $licenseDirectory -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\fonts\NotoSansDevanagari-OFL.txt') -Destination $licenseDirectory -Force
    Push-Location (Join-Path $projectRoot 'android')
    try {
        & .\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" --max-workers=2 --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'Gradle APK build failed.' }
    } finally { Pop-Location }
    $outputDirectory = Join-Path $projectRoot 'dist'
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $apk = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
    $outputApk = Join-Path $outputDirectory 'AWEAR-demo.apk'
    Copy-Item -LiteralPath $apk -Destination $outputApk -Force
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($outputApk)
    try {
        $hash = [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
    [System.IO.File]::WriteAllText("$outputApk.sha256", "$hash  AWEAR-demo.apk`n")
    [PSCustomObject]@{ SHA256 = $hash; Path = $outputApk }
} finally { Pop-Location }
