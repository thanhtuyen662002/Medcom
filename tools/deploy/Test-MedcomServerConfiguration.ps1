#Requires -Version 5.1
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$testBase = [Environment]::GetFolderPath('UserProfile')
$testRoot = Join-Path $testBase ('MedcomConfigTest-' + [Guid]::NewGuid().ToString('N'))
try {
    . (Join-Path $PSScriptRoot 'Configure-MedcomServer.ps1') -NoUi -LocationFile (Join-Path $testRoot 'selector.json')
    [IO.Directory]::CreateDirectory($testRoot) | Out-Null
    Set-MedcomDirectoryAcl $testRoot
    $synthetic = New-MedcomConnectionString 'sql.example.invalid,1433' 'MedcomTestOnly' $false 'synthetic-user' 'not-a-real-secret;value'
    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($synthetic)
    if (-not $builder.Encrypt -or $builder.TrustServerCertificate -or $builder.PersistSecurityInfo -or $builder.Password -ne 'not-a-real-secret;value') { throw 'TLS or password escaping regression.' }
    try { New-MedcomConnectionString '(localdb)\MSSQLLocalDB' 'Test' $true '' '' | Out-Null; throw 'LocalDB accepted.' } catch { if ($_.Exception.Message -eq 'LocalDB accepted.') { throw } }
    try { Assert-MedcomPrivatePath (Join-Path $PSScriptRoot 'secret.json') | Out-Null; throw 'Repository private path accepted.' } catch { if ($_.Exception.Message -eq 'Repository private path accepted.') { throw } }
    foreach ($invalid in @('Medcom ', 'Medcom.')) {
        try { Assert-MedcomPrivatePath (Join-Path $testRoot ($invalid + '\secret.json')) | Out-Null; throw 'Noncanonical private path accepted.' } catch { if ($_.Exception.Message -eq 'Noncanonical private path accepted.') { throw } }
    }
    $first = Join-Path $testRoot 'first'
    Save-MedcomServerConfiguration $first $synthetic
    $firstPath = Join-Path $first 'appsettings.Private.json'
    $settings = Get-Content -LiteralPath $firstPath -Raw | ConvertFrom-Json
    if ($settings.Legacy.Enabled -ne $false -or $settings.ConnectionStrings.Medcom -ne $synthetic) { throw 'Saved configuration mismatch.' }
    Set-MedcomProperty $settings.Legacy 'Enabled' $true
    Set-MedcomProperty $settings.Legacy 'ConnectionString' 'old-test-value'
    Set-MedcomProperty $settings 'Unrelated' ([pscustomobject]@{ Retained = $true })
    Write-MedcomPrivateJson $firstPath $settings
    Save-MedcomServerConfiguration $first $synthetic
    $updated = Get-Content -LiteralPath $firstPath -Raw | ConvertFrom-Json
    if (-not $updated.Legacy.Enabled -or -not $updated.Unrelated.Retained -or $updated.Legacy.PSObject.Properties['ConnectionString']) { throw 'Existing settings or duplicate-key regression.' }
    $second = Join-Path $testRoot 'second'
    Save-MedcomServerConfiguration $second $synthetic
    $selector = Get-Content -LiteralPath $LocationFile -Raw | ConvertFrom-Json
    if ($selector.Medcom.PrivateConfigPath -ne (Join-Path $second 'appsettings.Private.json')) { throw 'Folder selector did not move.' }
    $relocated = Get-Content -LiteralPath (Join-Path $second 'appsettings.Private.json') -Raw | ConvertFrom-Json
    if (-not $relocated.Unrelated.Retained -or -not $relocated.Legacy.Enabled) { throw 'Folder relocation dropped existing settings.' }
    if ((Get-Content -LiteralPath $LocationFile -Raw).Contains('not-a-real-secret')) { throw 'Selector contains secret.' }
    $acl = Get-Acl -LiteralPath (Join-Path $second 'appsettings.Private.json')
    if (-not $acl.AreAccessRulesProtected) { throw 'Private file inherits permissions.' }
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -eq 'Allow' -and $sid -notin $allowed) { throw 'Unexpected private file reader.' }
    }
    $unsafe = Join-Path $testRoot 'unsafe'
    [IO.Directory]::CreateDirectory($unsafe) | Out-Null
    $unsafeAcl = Get-MedcomProtectedAcl $true
    $unsafeAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'), 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    if ($PSVersionTable.PSVersion.Major -lt 6) { [IO.Directory]::SetAccessControl($unsafe, $unsafeAcl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($unsafe), $unsafeAcl) }
    try { Write-MedcomPrivateJson (Join-Path $unsafe 'secret.json') ([pscustomobject]@{ Test = 'synthetic-only' }); throw 'Untrusted directory accepted.' } catch { if ($_.Exception.Message -eq 'Untrusted directory accepted.') { throw } }
    if (Test-Path -LiteralPath (Join-Path $unsafe 'secret.json')) { throw 'Secret written in untrusted directory.' }
    $protectedChild = Join-Path $unsafe 'protected-child'
    [IO.Directory]::CreateDirectory($protectedChild) | Out-Null
    Set-MedcomDirectoryAcl $protectedChild
    try { Write-MedcomPrivateJson (Join-Path $protectedChild 'secret.json') ([pscustomobject]@{ Test = 'synthetic-only' }); throw 'Untrusted ancestor accepted.' } catch { if ($_.Exception.Message -eq 'Untrusted ancestor accepted.') { throw } }
    if (Test-Path -LiteralPath (Join-Path $protectedChild 'secret.json')) { throw 'Secret written below untrusted ancestor.' }
    # Policy test only: substitute an ACL view without assigning a real untrusted owner.
    $medcomOriginalGetAcl = Get-Command Get-Acl
    function Get-Acl {
        param([string]$LiteralPath)
        $view = & $medcomOriginalGetAcl -LiteralPath $LiteralPath
        if ($LiteralPath -eq $protectedChild) { $view.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-1-0')) }
        return $view
    }
    try {
        try { Assert-MedcomRestrictedDirectory $protectedChild; throw 'Untrusted owner accepted.' } catch { if ($_.Exception.Message -eq 'Untrusted owner accepted.') { throw }; if ($_.Exception.Message -ne 'Configuration directories require a trusted owner.') { throw } }
    } finally { Remove-Item Function:\Get-Acl }
    'PASS: TLS, SQL escaping, LocalDB/repository rejection, save, preservation, folder relocation, secret-free selector, protected ACL.'
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        $resolved = [IO.Path]::GetFullPath($testRoot)
        $temp = [IO.Path]::GetFullPath($testBase)
        if (-not $resolved.StartsWith($temp.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'MedcomConfigTest-*') { throw 'Unsafe test cleanup target.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
