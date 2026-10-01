# Tools.dll static metadata evidence

Evidence date: 2026-10-01 (Asia/Ho_Chi_Minh).

This document records sanitized metadata from the owner supplied binary at
C:\Users\Vo Thanh Tuyen\Downloads\Tools.dll. The binary itself is not part of
the public repository and was not executed, loaded for behavior, decompiled or
committed.

## Immutable file identity

- SHA-256: AA8910F3BA244FC405CCAD2D322D142D40F938BE3DA94277CCD8D0814082DD61
- Length: 8,258,049 bytes
- Assembly name: Tools
- Assembly version: 7.9.9767.36959
- Public key token: none
- PE machine: I386
- CLR flags: ILOnly
- Metadata version: v4.0.30319
- TargetFrameworkAttribute: .NETFramework,Version=v4.6.2
- Assembly attributes include SuppressIldasm and CLSCompliant true

The I386 and ILOnly PE shape and .NET Framework 4.6.2 target are static facts.
They do not prove that the assembly can load safely in a .NET 10 ASP.NET Core
process. A private compatibility bridge remains the safe default until an
isolated load test proves otherwise.

## Assembly references observed

The binary references .NET Framework and desktop UI libraries including
mscorlib 4.0, System, System.Core, System.Data, System.Drawing,
System.Windows.Forms, System.Design, System.Web.Extensions, Microsoft.VisualBasic
and System.Management.

It also references Janus UI, GridEX, Data, Common, ExplorerBar, TimeLine,
Schedule and Ribbon assemblies; ActiveReports 6 viewer, document, design,
chart and export assemblies; Aspose.Cells, Aspose.Words, Aspose.Pdf, EPPlus,
SpreadsheetGear2017, Newtonsoft.Json, QRCoder, MindFusion diagramming,
VideoGrabberNET, CSharpLib and vnConvert. These names are dependency metadata
only. Their versions, deployment location, licensing and runtime availability
still require environment verification.

## Verified public API shape

Static metadata enumerated 686 public types and 8,566 public or protected
methods. The following signatures are directly observed:

| Type | Method or property | Signature or return |
|---|---|---|
| Tools.Utils.Functions | VerifyUserPass | Boolean VerifyUserPass(String, String, String) |
| Tools.Utils.Functions | GetPermission | Tools.Data.PermissionType GetPermission(String, Boolean) |
| Tools.Utils.Functions | GetPermissionWithMenuPara | Tools.Data.PermissionType GetPermissionWithMenuPara(String, String, Boolean) |
| Tools.Utils.Functions | CheckAdminUserGroup | Boolean CheckAdminUserGroup(Boolean) |
| Tools.Utils.Functions | CheckSupperAdmin | Boolean CheckSupperAdmin() |
| Tools.Utils.Functions | GetUserAutoID | String GetUserAutoID() |
| Tools.Utils.Functions | GetCurrentUserAutoID | String GetCurrentUserAutoID() |
| Tools.Utils.Functions | GetUserAutoIDForUID | String GetUserAutoIDForUID() |
| Tools.Utils.Functions | EncodeUserPass | String EncodeUserPass(String, String) |
| Tools.Utils.Functions | CheckPasswordComplex | Boolean CheckPasswordComplex(String, Int32, Int32, Int32, Int32, Int32) |
| Tools.MD5 | EncryptUserPass | String EncryptUserPass(String, String) |
| Tools.MD5 | VerifyUserPass | Boolean VerifyUserPass(String, String, String) |
| Tools.MD5 | VerifyUserPassSystem | Boolean VerifyUserPassSystem(String, String, String) |
| Tools.Data.Connector | UserLogin | String get and set property |
| Tools.Data.Connector | UserFullName | String get and set property |
| Tools.Data.Connector | UserGroup | String get and set property |
| Tools.Data.Connector | UserNameDB | String get and set property |
| Tools.Data.Connector | Password | String get and set property; never log or expose |
| Tools.Data.Connector | GetBranchDefault | String GetBranchDefault() |
| Tools.Data.Connector | GetBranchFilter | String GetBranchFilter(String) |
| Tools.Data.Storer | UserAutoID | String get and set property |
| Tools.Data.Storer | BranchValue | String get and set property |
| Tools.Data.Storer | CanAdmin | Boolean get and set property |
| Tools.Data.Storer | SetUserAutoID | Void SetUserAutoID(String, Int16) |
| Tools.FormControler | SetPermission | Boolean SetPermission(Boolean, Boolean, Boolean) |
| Tools.FormControler | SetUserFilterCombo | Void SetUserFilterCombo(Tools.ComboX by reference, String) |
| Tools.FormControler | SetDocumentPrefixWithBranchID | Void SetDocumentPrefixWithBranchID(String) |
| Tools.SY_ApproveDocumentFrm | KiemTraUserCoQuyenDuyet | Boolean KiemTraUserCoQuyenDuyet(String) |

Tools.Data.PermissionType is a value type, not an enum. Its observed fields
are FormName, View, AddNew, Edit, Delete, Manager, Admin, AutoLock, HideAmount,
LockDoc, UnLockDoc and ExportExcel. Field names describe a capability shape;
they do not prove precedence, enforcement timing, scope or server-safe semantics.

## Negative and unresolved findings

No public method named Login, Logout, Logon or Logoff was found by the metadata
scan. This is a negative name search only. It does not prove that VerifyUserPass
is the complete login operation, that logout is absent, or that session
invalidation is implemented in this assembly. Do not rename or wrap
VerifyUserPass as a Web login contract without runtime or source verification.

Still UNKNOWN:

- argument order and meaning for authentication, permission and branch methods;
- password hashing or encoding algorithm, salt, storage and migration semantics;
- database connection ownership and whether Connector properties are process global;
- session creation, renewal, logout, expiry and revocation behavior;
- permission precedence across menu, form, role, company, branch and storehouse;
- exception, timeout, retry, thread safety and reentrancy behavior;
- required versions and deployment paths for all desktop dependencies;
- whether direct .NET 10 loading is safe or a private .NET Framework bridge is required;
- whether methods perform SQL writes, mutate global state or need a WinForms thread;
- transaction, audit and side effect behavior of approval and document methods.

## Adapter consequence

The typed Web boundary may now use a metadata informed adapter contract with
normalized result states Success, Rejected, Expired, Forbidden, Unavailable,
Timeout and Unknown. It must not expose Tool types, Connector.Password,
arbitrary permission fields or raw database handles to the browser. Issue 19
remains BLOCKED until an isolated runtime or source test proves behavior and
selects direct load versus private bridge deployment.
