[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$FrontendDirectory,
    [Parameter(Mandatory=$true)][string]$HostDirectory,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedRevision,
    [Parameter(Mandatory=$true)][string]$NodePath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$CertificateThumbprint,
    [string]$DotnetPath,
    [ValidateRange(1024,65535)][int]$ApiPort=5186,
    [ValidateRange(1024,65535)][int]$FrontendPort=5187,
    [ValidateRange(1024,65535)][int]$NodePort=3100
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This operator launcher requires Windows.' }
if (@($ApiPort,$FrontendPort,$NodePort | Select-Object -Unique).Count -ne 3) { throw 'API, frontend and Node ports must differ.' }
if ($env:NODE_TLS_REJECT_UNAUTHORIZED -eq '0') { throw 'Remove the inherited TLS validation bypass before using this launcher.' }

function Real-Path([string]$Value,[bool]$Directory) {
    $item=Get-Item -LiteralPath $Value -Force
    if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Expected a real local file/directory, not a link.' }
    $full=[IO.Path]::GetFullPath($item.FullName)
    if ($full.StartsWith('\\')) { throw 'Use a local filesystem path.' }
    $ancestor=if ($Directory) { $item } else { $item.Directory }
    while ($null -ne $ancestor) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked ancestor is not admitted.' }
        $ancestor=$ancestor.Parent
    }
    return $full
}
function Valid-Relative([string]$Value) {
    if ([string]::IsNullOrEmpty($Value) -or $Value.Contains('\') -or $Value.Contains(':') -or $Value.StartsWith('/') -or ($Value.Split('/') | Where-Object { $_ -in @('','.','..') })) { throw 'Unsafe artifact member path.' }
}
function Verify-Artifact([string]$Root,[string]$ManifestName,[string]$Kind) {
    $manifestPath=Join-Path $Root $ManifestName
    $meta=Get-Item -LiteralPath $manifestPath -Force
    if ($meta.Length -gt 33554432 -or $meta.PSIsContainer -or ($meta.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid artifact manifest.' }
    $m=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($m.schemaVersion -ne 1 -or $m.artifact -ne $Kind -or $m.sourceRevision -ne $ExpectedRevision -or $m.admission -ne 'BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE' -or $m.platform -ne 'win32' -or $m.arch -ne 'x64') { throw 'Artifact revision/platform/admission mismatch.' }
    if ($Kind -eq 'medcom-frontend' -and ($m.sourceState -ne 'CLEAN_CHECKED_OUT_REVISION' -or $m.nodeMajor -ne 24 -or $m.server -ne 'server.js')) { throw 'Unexpected standalone frontend metadata.' }
    if ($Kind -eq 'medcom-local-frontend-host' -and $m.entryPoint -ne 'Medcom.LocalFrontendHost.dll') { throw 'Unexpected TLS host entry point.' }
    $expected=@{}
    foreach ($file in $m.files) {
        Valid-Relative $file.path
        if ($expected.ContainsKey($file.path) -or $file.path -eq $ManifestName -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or $file.size -lt 0) { throw 'Invalid or duplicate artifact member.' }
        $expected[$file.path]=$file
    }
    $found=@{}
    $directories=@{}
    foreach ($item in Get-ChildItem -LiteralPath $Root -Recurse -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Artifact contains a linked member.' }
        $relative=$item.FullName.Substring($Root.TrimEnd('\').Length+1).Replace('\','/')
        if ($item.PSIsContainer) { $directories[$relative]=$true; continue }
        if ($relative -eq $ManifestName) { continue }
        if (-not $expected.ContainsKey($relative)) { throw 'Artifact has an unexpected file.' }
        $entry=$expected[$relative]
        if ($item.Length -ne $entry.size -or (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw 'Artifact file hash/size mismatch.' }
        $found[$relative]=$true
    }
    if ($found.Count -ne $expected.Count) { throw 'Artifact has missing files.' }
    $listed=@{}
    foreach ($directory in $m.directories) { Valid-Relative $directory; if ($listed.ContainsKey($directory)) { throw 'Duplicate artifact directory.' }; $listed[$directory]=$true }
    if ($listed.Count -ne $directories.Count -or @($directories.Keys | Where-Object { -not $listed.ContainsKey($_) }).Count) { throw 'Artifact directory inventory mismatch.' }
}
function Quote-Argument([string]$Value) {
    # Windows CommandLineToArgvW escaping, not shell evaluation.
    return '"'+[regex]::Replace([regex]::Replace($Value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
}
function Start-Child([string]$Executable,[string[]]$Arguments,[string]$WorkingDirectory,[hashtable]$Extra,[bool]$Capture=$false) {
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Executable; $info.Arguments=($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' '
    $info.WorkingDirectory=$WorkingDirectory; $info.UseShellExecute=$false
    $info.CreateNoWindow=$Capture; $info.RedirectStandardOutput=$Capture; $info.RedirectStandardError=$Capture
    $info.EnvironmentVariables.Clear()
    foreach ($key in @('SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','DOTNET_ROOT','DOTNET_ROOT_X64')) {
        $value=[Environment]::GetEnvironmentVariable($key,'Process')
        if ($null -ne $value) { $info.EnvironmentVariables[$key]=$value }
    }
    foreach ($key in $Extra.Keys) { $info.EnvironmentVariables[$key]=[string]$Extra[$key] }
    $process=New-Object Diagnostics.Process; $process.StartInfo=$info
    if (-not $process.Start()) { throw 'Could not start the owned process.' }
    return $process
}
function Stop-Owned([Diagnostics.Process]$Process) {
    if ($null -eq $Process) { return }
    if (-not $Process.HasExited) { $Process.Kill(); if (-not $Process.WaitForExit(5000)) { throw 'Could not confirm owned process termination.' } }
    $Process.Dispose()
}
function Probe([string]$Executable,[string[]]$Arguments,[string]$WorkingDirectory,[int]$Timeout=10000) {
    $process=$null
    try {
        $process=Start-Child $Executable $Arguments $WorkingDirectory @{} $true
        $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($Timeout)) { throw 'Bounded preflight timed out.' }
        if ($process.ExitCode -ne 0) {
            $diagnostic=$stderr.GetAwaiter().GetResult()
            if ($diagnostic -match 'Local frontend certificate rejected: ([a-z_]+)\.') { throw ('Certificate preflight rejected: '+$Matches[1]) }
            throw ('Preflight failed (exit '+$process.ExitCode+'). Verify the selected runtime and HTTPS backend locally.')
        }
        return $stdout.GetAwaiter().GetResult().Trim()
    } finally { Stop-Owned $process }
}
function Check-Port([int]$Port) {
    $listeners=@()
    try {
        foreach ($ip in @([Net.IPAddress]::Loopback,[Net.IPAddress]::IPv6Loopback)) {
            if ($ip.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetworkV6 -and -not [Net.Sockets.Socket]::OSSupportsIPv6) { continue }
            $listener=New-Object Net.Sockets.TcpListener($ip,$Port);$listener.Server.ExclusiveAddressUse=$true;$listener.Start();$listeners+=$listener
        }
    } finally { foreach ($listener in $listeners) { $listener.Stop() } }
}

$frontend=Real-Path $FrontendDirectory $true; $hostRoot=Real-Path $HostDirectory $true; $node=Real-Path $NodePath $false
if ([string]::IsNullOrWhiteSpace($DotnetPath)) { $DotnetPath=(Get-Command dotnet -CommandType Application).Source }
$dotnet=Real-Path $DotnetPath $false
if ($frontend -eq $hostRoot -or $hostRoot.StartsWith($frontend+'\',[StringComparison]::OrdinalIgnoreCase) -or $frontend.StartsWith($hostRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Keep frontend and helper packages separate.' }
Verify-Artifact $frontend 'medcom-package.json' 'medcom-frontend'
Verify-Artifact $hostRoot 'medcom-local-frontend-package.json' 'medcom-local-frontend-host'
# Official v24.21.0 win-x64/node.exe hash. The portable ZIP is downloaded
# separately from nodejs.org, never bundled, installed or added to PATH here.
if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32') { throw 'Node executable differs from verified official 24.21.0 Windows x64.' }
$runtime=Probe $node @('-p','JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})') $frontend | ConvertFrom-Json
if ($runtime.version -ne 'v24.21.0' -or $runtime.platform -ne 'win32' -or $runtime.arch -ne 'x64') { throw 'Use the dedicated official Node 24.21.0 Windows x64 executable.' }
$hostDll=Join-Path $hostRoot 'Medcom.LocalFrontendHost.dll'
[void](Probe $dotnet @($hostDll,'--certificate-thumbprint',$CertificateThumbprint,'--check-certificate') $hostRoot)
$apiOrigin='https://localhost:'+$ApiPort; $publicOrigin='https://localhost:'+$FrontendPort
$probeSource="fetch(process.argv[1],{redirect:'error',signal:AbortSignal.timeout(5000)}).then(async r=>{const status=r.status;await r.body?.cancel();if(status!==200)process.exit(2);console.log('TLS_OK')}).catch(()=>process.exit(3))"
if ((Probe $node @('--use-system-ca','-e',$probeSource,($apiOrigin+'/health/live')) $frontend) -ne 'TLS_OK') { throw 'Node backend TLS preflight did not pass.' }
Check-Port $NodePort; Check-Port $FrontendPort
$nodeProcess=$null; $hostProcess=$null
try {
    $nodeProcess=Start-Child $node @('--use-system-ca',(Join-Path $frontend 'server.js')) $frontend @{
        NODE_ENV='production'; NEXT_TELEMETRY_DISABLED='1'; HOSTNAME='127.0.0.1'; PORT=[string]$NodePort
        MEDCOM_LOCAL_HTTPS='1'; MEDCOM_PUBLIC_ORIGIN=$publicOrigin; MEDCOM_API_ORIGIN=$apiOrigin
    }
    $hostProcess=Start-Child $dotnet @($hostDll,'--certificate-thumbprint',$CertificateThumbprint,'--https-port',[string]$FrontendPort,'--node-port',[string]$NodePort) $hostRoot @{}
    $deadline=[DateTime]::UtcNow.AddSeconds(30);$ready=$false
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($nodeProcess.HasExited -or $hostProcess.HasExited) { throw 'An owned frontend process exited during startup.' }
        try { $ready=(Probe $node @('--use-system-ca','-e',$probeSource,($publicOrigin+'/')) $frontend 7000) -eq 'TLS_OK' } catch { $ready=$false }
        if ($ready) { break };Start-Sleep -Milliseconds 150
    }
    if (-not $ready) { throw 'Frontend HTTPS readiness timed out.' }
    Write-Host ('Modern Medcom frontend: '+$publicOrigin)
    Write-Host 'Keep this terminal open. Ctrl+C stops only these frontend processes. Backend and system Node are unchanged.'
    Write-Host 'This is a local smoke; SQL/business release acceptance is unchanged.'
    while (-not $nodeProcess.HasExited -and -not $hostProcess.HasExited) { Start-Sleep -Milliseconds 500 }
    throw 'An owned frontend process exited; stopping its peer.'
} finally {
    $failures=@()
    foreach ($process in @($hostProcess,$nodeProcess)) { try { Stop-Owned $process } catch { $failures+=$_.Exception.Message } }
    if ($failures.Count) { throw ($failures -join '; ') }
}
