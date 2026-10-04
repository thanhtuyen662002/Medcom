#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$LocationFile = (Join-Path $env:ProgramData 'Medcom\backend\config-location.json'),
    [string]$DefaultDirectory = 'D:\Config',
    [string]$ServiceAccount,
    [switch]$NoUi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

function Get-MedcomProtectedAcl {
    param([bool]$Directory)
    $acl = if ($Directory) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
    $acl.SetAccessRuleProtection($true, $false)
    $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $identities = @($current, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
    foreach ($identity in $identities) {
        $rule = if ($Directory) {
            [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        } else { [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow') }
        $acl.AddAccessRule($rule)
    }
    if ($ServiceAccount) {
        $serviceIdentity = [System.Security.Principal.NTAccount]::new($ServiceAccount)
        $rule = if ($Directory) {
            [System.Security.AccessControl.FileSystemAccessRule]::new($serviceIdentity, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        } else { [System.Security.AccessControl.FileSystemAccessRule]::new($serviceIdentity, 'Read', 'Allow') }
        $acl.AddAccessRule($rule)
    }
    return $acl
}

function Set-MedcomFileAcl {
    param([string]$Path)
    $acl = Get-MedcomProtectedAcl $false
    if ($PSVersionTable.PSVersion.Major -lt 6) { [IO.File]::SetAccessControl($Path, $acl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]::new($Path), $acl) }
}

function Set-MedcomDirectoryAcl {
    param([string]$Path)
    $acl = Get-MedcomProtectedAcl $true
    if ($PSVersionTable.PSVersion.Major -lt 6) { [IO.Directory]::SetAccessControl($Path, $acl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($Path), $acl) }
}

function Assert-MedcomPrivatePath {
    param([string]$Path)
    if ($Path -notmatch '^[A-Za-z]:[\\/]' -or $Path.Substring(2).Contains(':')) {
        throw 'Choose an absolute local server directory.'
    }
    foreach ($segment in ($Path -split '[\\/]')) {
        if ($segment.EndsWith('.') -or $segment.EndsWith(' ')) { throw 'Path components cannot end in a dot or space.' }
    }
    $full = [System.IO.Path]::GetFullPath($Path)
    $repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    if ($full.Equals($repo, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($repo.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Private configuration must be outside the repository.'
    }
    $itemPath = $full
    while ($itemPath) {
        if (Test-Path -LiteralPath $itemPath) {
            if ((Get-Item -LiteralPath $itemPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked configuration paths are not supported.' }
        }
        $parent = [IO.Path]::GetDirectoryName($itemPath.TrimEnd('\'))
        if ($parent -eq $itemPath) { break }
        $itemPath = $parent
    }
    return $full
}

function Assert-MedcomRestrictedDirectory {
    param([string]$Directory)
    $trustedWriters = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    $writeRights = [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    $trustedOwners = $trustedWriters
    try { $trustedOwners += [Security.Principal.NTAccount]::new('NT SERVICE\TrustedInstaller').Translate([Security.Principal.SecurityIdentifier]).Value } catch { }
    $replacementRights = [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    $candidate = [IO.Path]::GetFullPath($Directory)
    $destination = $true
    while ($candidate) {
        $acl = Get-Acl -LiteralPath $candidate
        $owners = if ($destination) { $trustedWriters } else { $trustedOwners }
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $owners) { throw 'Configuration directories require a trusted owner.' }
        $rights = if ($destination) { $writeRights } else { $replacementRights }
        foreach ($rule in $acl.Access) {
            if ($rule.AccessControlType -ne 'Allow' -or ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) { continue }
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if (($rule.FileSystemRights -band $rights) -ne 0 -and $sid -notin $trustedOwners) { throw 'Configuration directories cannot have untrusted replacement permissions.' }
        }
        $parent = [IO.Directory]::GetParent($candidate)
        $candidate = if ($parent) { $parent.FullName } else { $null }
        $destination = $false
    }
}

function Write-MedcomPrivateJson {
    param([string]$Path, [object]$Value)
    $full = Assert-MedcomPrivatePath $Path
    $directory = [IO.Path]::GetDirectoryName($full)
    if (-not (Test-Path -LiteralPath $directory)) {
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        Set-MedcomDirectoryAcl $directory
    }
    Assert-MedcomRestrictedDirectory $directory
    if (Test-Path -LiteralPath $full) {
        $owner = (Get-Acl -LiteralPath $full).GetOwner([Security.Principal.SecurityIdentifier]).Value
        if ($owner -notin @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')) { throw 'Private configuration requires a trusted owner.' }
    }
    $temporary = Join-Path $directory ('.medcom-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backup = $temporary + '.bak'
    try {
        # Create with inherited ACL, then restrict BEFORE writing any secret bytes.
        [IO.File]::WriteAllBytes($temporary, [byte[]]@())
        Set-MedcomFileAcl $temporary
        [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 32), [Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $full) {
            Set-MedcomFileAcl $full
            [IO.File]::Replace($temporary, $full, $backup)
        }
        else { [IO.File]::Move($temporary, $full) }
        Set-MedcomFileAcl $full
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    }
}

function New-MedcomConnectionString {
    param([string]$Server, [string]$Database, [bool]$Integrated, [string]$UserName, [string]$Password)
    if ([string]::IsNullOrWhiteSpace($Server) -or [string]::IsNullOrWhiteSpace($Database) -or $Server -match '(?i)\(localdb\)') { throw 'Server and database are required; LocalDB is unsupported.' }
    if (-not $Integrated -and ([string]::IsNullOrWhiteSpace($UserName) -or [string]::IsNullOrEmpty($Password))) { throw 'SQL authentication requires user name and password.' }
    $connection = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
    $connection['Data Source'] = $Server.Trim()
    $connection['Initial Catalog'] = $Database.Trim()
    $connection['Integrated Security'] = $Integrated
    $connection['Encrypt'] = $true
    $connection['TrustServerCertificate'] = $false
    $connection['Connect Timeout'] = 15
    $connection['Persist Security Info'] = $false
    if (-not $Integrated) { $connection['User ID'] = $UserName; $connection['Password'] = $Password }
    return $connection.ConnectionString
}

function Set-MedcomProperty {
    param([object]$Object, [string]$Name, [object]$Value)
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
}

function Save-MedcomServerConfiguration {
    param([string]$Directory, [string]$ConnectionString)
    $privatePath = Assert-MedcomPrivatePath (Join-Path $Directory 'appsettings.Private.json')
    $selector = Assert-MedcomPrivatePath $LocationFile
    if ($privatePath.Equals($selector, [StringComparison]::OrdinalIgnoreCase)) { throw 'Configuration and location files must differ.' }
    $sourcePath = $privatePath
    if (-not (Test-Path -LiteralPath $sourcePath) -and (Test-Path -LiteralPath $selector)) {
        $previous = Get-Content -LiteralPath $selector -Raw | ConvertFrom-Json
        $sourcePath = Assert-MedcomPrivatePath $previous.Medcom.PrivateConfigPath
    }
    $configuration = if (Test-Path -LiteralPath $sourcePath) { Get-Content -LiteralPath $sourcePath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
    $strings = if ($configuration.PSObject.Properties['ConnectionStrings']) { $configuration.ConnectionStrings } else { [pscustomobject]@{} }
    Set-MedcomProperty $strings 'Medcom' $ConnectionString
    Set-MedcomProperty $configuration 'ConnectionStrings' $strings
    if (-not $configuration.PSObject.Properties['Legacy']) { Set-MedcomProperty $configuration 'Legacy' ([pscustomobject]@{ Enabled = $false }) }
    # Retire the legacy duplicate without changing the existing enable/write gates.
    if ($configuration.Legacy.PSObject.Properties['ConnectionString']) { $configuration.Legacy.PSObject.Properties.Remove('ConnectionString') }
    Write-MedcomPrivateJson $privatePath $configuration
    Write-MedcomPrivateJson $selector ([pscustomobject]@{ Medcom = [pscustomobject]@{ PrivateConfigPath = $privatePath } })
}

if ($NoUi) { return }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Data
[System.Windows.Forms.Application]::EnableVisualStyles()
$window = [Windows.Forms.Form]::new()
$window.Text = 'Medcom - Cau hinh SQL Server'
$window.Size = [Drawing.Size]::new(620, 480)
$window.StartPosition = 'CenterScreen'
$window.FormBorderStyle = 'FixedDialog'
$window.MaximizeBox = $false
$window.Font = [Drawing.Font]::new('Segoe UI', 10)
$fields = @{}
function Add-SetupField {
    param([string]$Key, [string]$Label, [int]$Top)
    $labelControl = [Windows.Forms.Label]::new()
    $labelControl.Text = $Label; $labelControl.Location = [Drawing.Point]::new(20, $Top + 3); $labelControl.AutoSize = $true
    $inputControl = [Windows.Forms.TextBox]::new()
    $inputControl.Location = [Drawing.Point]::new(195, $Top); $inputControl.Size = [Drawing.Size]::new(385, 27)
    $window.Controls.Add($labelControl); $window.Controls.Add($inputControl); $fields[$Key] = $inputControl
}
Add-SetupField 'Directory' 'Thu muc tren server' 25
$fields.Directory.Text = $DefaultDirectory
$fields.Directory.Width = 285
$browse = [Windows.Forms.Button]::new(); $browse.Text = 'Chon...'; $browse.Location = [Drawing.Point]::new(490, 24); $browse.Size = [Drawing.Size]::new(90, 30)
$browse.Add_Click({
    $dialog = [Windows.Forms.FolderBrowserDialog]::new()
    $dialog.Description = 'Chon thu muc private tren may chay backend'
    $dialog.SelectedPath = $fields.Directory.Text
    try { if ($dialog.ShowDialog($window) -eq 'OK') { $fields.Directory.Text = $dialog.SelectedPath } } finally { $dialog.Dispose() }
})
$window.Controls.Add($browse)
Add-SetupField 'Server' 'Server / instance' 70
Add-SetupField 'Database' 'Ten database' 115
Add-SetupField 'User' 'SQL user' 205
Add-SetupField 'Password' 'Mat khau' 250
$fields.Password.UseSystemPasswordChar = $true
$integrated = [Windows.Forms.CheckBox]::new(); $integrated.Text = 'Windows Authentication'; $integrated.Location = [Drawing.Point]::new(195, 160); $integrated.AutoSize = $true
$integrated.Add_CheckedChanged({ $fields.User.Enabled = -not $integrated.Checked; $fields.Password.Enabled = -not $integrated.Checked })
$window.Controls.Add($integrated)
$notice = [Windows.Forms.Label]::new(); $notice.Text = 'TLS bat buoc. Can chung chi server hop le. Luu xong can khoi dong lai backend.'; $notice.Location = [Drawing.Point]::new(20, 295); $notice.Size = [Drawing.Size]::new(565, 45)
$window.Controls.Add($notice)
$test = [Windows.Forms.Button]::new(); $test.Text = 'Kiem tra ket noi'; $test.Location = [Drawing.Point]::new(195, 360); $test.Size = [Drawing.Size]::new(180, 36)
$save = [Windows.Forms.Button]::new(); $save.Text = 'Luu cau hinh'; $save.Location = [Drawing.Point]::new(400, 360); $save.Size = [Drawing.Size]::new(180, 36)
$status = [Windows.Forms.Label]::new(); $status.Location = [Drawing.Point]::new(20, 405); $status.Size = [Drawing.Size]::new(560, 30)
$window.Controls.Add($test); $window.Controls.Add($save); $window.Controls.Add($status)
$window.AcceptButton = $save
try {
    if (Test-Path -LiteralPath $LocationFile) {
        $storedLocation = Get-Content -LiteralPath $LocationFile -Raw | ConvertFrom-Json
        $fields.Directory.Text = [IO.Path]::GetDirectoryName((Assert-MedcomPrivatePath $storedLocation.Medcom.PrivateConfigPath))
    }
    $initial = Join-Path $fields.Directory.Text 'appsettings.Private.json'
    if (Test-Path -LiteralPath $initial) {
        $existing = Get-Content -LiteralPath $initial -Raw | ConvertFrom-Json
        if ($existing.PSObject.Properties['ConnectionStrings'] -and $existing.ConnectionStrings.PSObject.Properties['Medcom']) {
            $values = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($existing.ConnectionStrings.Medcom)
            $fields.Server.Text = $values.DataSource; $fields.Database.Text = $values.InitialCatalog
            $fields.User.Text = $values.UserID; $fields.Password.Text = $values.Password; $integrated.Checked = $values.IntegratedSecurity
        }
    }
} catch { $status.Text = 'Khong doc duoc cau hinh cu. File cu chua thay doi.' }
$test.Add_Click({
    $test.Enabled = $false; $save.Enabled = $false; $status.Text = 'Dang kiem tra...'; $window.Refresh()
    $sqlConnection = $null
    try {
        $text = New-MedcomConnectionString $fields.Server.Text $fields.Database.Text $integrated.Checked $fields.User.Text $fields.Password.Text
        $sqlConnection = [System.Data.SqlClient.SqlConnection]::new($text)
        $sqlConnection.Open()
        $command = $sqlConnection.CreateCommand(); $command.CommandText = 'SELECT 1'; $command.CommandTimeout = 15
        try { if ($command.ExecuteScalar() -ne 1) { throw 'Unexpected probe result.' } } finally { $command.Dispose() }
        $status.Text = 'Ket noi va SELECT 1 thanh cong. Chua nghiem thu nghiep vu.'
    } catch { $status.Text = 'Ket noi that bai. Kiem tra server, DB, tai khoan, mang va TLS.' }
    finally { if ($sqlConnection) { $sqlConnection.Dispose() }; $test.Enabled = $true; $save.Enabled = $true }
})
$save.Add_Click({
    $save.Enabled = $false
    try {
        $text = New-MedcomConnectionString $fields.Server.Text $fields.Database.Text $integrated.Checked $fields.User.Text $fields.Password.Text
        $destination = Join-Path $fields.Directory.Text 'appsettings.Private.json'
        if (Test-Path -LiteralPath $destination) {
            if ([Windows.Forms.MessageBox]::Show($window, 'Cap nhat cau hinh tai thu muc nay? Cac thiet lap khac duoc giu lai.', 'Xac nhan', 'YesNo', 'Question') -ne 'Yes') { return }
        }
        Save-MedcomServerConfiguration $fields.Directory.Text $text
        $status.Text = 'Da luu. Khoi dong lai backend de ap dung.'
    } catch { $status.Text = 'Luu that bai. Kiem tra quyen thu muc va cau truc JSON.' }
    finally { $save.Enabled = $true }
})
try { [void]$window.ShowDialog() } finally { $fields.Password.Clear(); $window.Dispose() }
