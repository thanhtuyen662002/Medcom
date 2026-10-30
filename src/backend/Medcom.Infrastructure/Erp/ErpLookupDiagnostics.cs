using System.Data;
using System.Data.Common;
using Medcom.Contracts;

namespace Medcom.Infrastructure.Erp;

// Read-only: compares each Web lookup with its live SY_FrmDrdwTbl row the way ErpLookupSql.Source does,
// and names the differing fields. ERP edits a dropdown (e.g. 29/10 dropped the currency picker's rate
// link) without any SQL dependency the drift snapshot could follow.
public sealed class ErpLookupDiagnostics
{
    private readonly Func<DbConnection> connect;
    private readonly TimeProvider clock;
    public ErpLookupDiagnostics(SqlLegacyUserStore store, TimeProvider clock) : this(store.CreateConnection, clock) { }
    internal ErpLookupDiagnostics(Func<DbConnection> connect, TimeProvider clock) { this.connect = connect; this.clock = clock; }

    internal sealed record LiveRow(string Form, string? Grid, string Column, string? Value, string? Display, string? Parameters,
        string? Required, bool Disabled, bool MultiSelect, string? Linked, bool NotInList, string? SourceHash);

    public async Task<ErpLookupCheckReport> RunAsync(CancellationToken token)
    {
        var screens = ErpScreenCatalog.ModuleIds.Select(module => ErpScreenCatalog.Get(module)!).ToArray();
        var forms = screens.Select(screen => screen.FormId).Distinct(StringComparer.Ordinal).ToArray();
        var live = new List<LiveRow>();
        await using (var connection = connect())
        {
            await connection.OpenAsync(token);
            await using var command = connection.CreateCommand();
            command.CommandTimeout = 30;
            command.CommandText = "SELECT FormID,GridName,ColumnID,ValueColumn,DisplayColumn,ParaArr,ParaRequireArr,CONVERT(int,ISNULL(IsDisable,0)),"
                + "CONVERT(int,ISNULL(IsMultiSelect,0)),LinkColumn,CONVERT(int,ISNULL(IsNotInList,0)),"
                + "CONVERT(char(64),HASHBYTES('SHA2_256',CONVERT(nvarchar(max),Source)),2) FROM dbo.SY_FrmDrdwTbl WHERE FormID IN("
                + string.Join(',', forms.Select((_, i) => "@form" + i)) + ");";
            for (var i = 0; i < forms.Length; i++)
            {
                var parameter = command.CreateParameter();
                parameter.ParameterName = "@form" + i; parameter.DbType = DbType.String; parameter.Size = 255; parameter.Value = forms[i];
                command.Parameters.Add(parameter);
            }
            await using var reader = await command.ExecuteReaderAsync(token);
            string? Text(int i) => reader.IsDBNull(i) ? null : reader.GetString(i);
            while (await reader.ReadAsync(token))
                live.Add(new(reader.GetString(0), Text(1), reader.GetString(2), Text(3), Text(4), Text(5), Text(6), reader.GetInt32(7) == 1,
                    reader.GetInt32(8) == 1, Text(9), reader.GetInt32(10) == 1, Text(11)?.Trim().ToLowerInvariant()));
        }
        var items = screens.SelectMany(screen => screen.Lookups.Select(lookup => Compare(screen, lookup, live))).ToArray();
        var formChanges = new List<ErpFormConfigChange>();
        await using (var connection = connect())
        {
            await connection.OpenAsync(token);
            foreach (var screen in screens.Where(screen => ErpScreenCatalog.IsWorkflow(screen.Id)))
            {
                await using var command = connection.CreateCommand();
                command.CommandTimeout = 30;
                command.CommandText = "SELECT KeyID,SubID,SubValue,KeyValue FROM dbo.SY_FrmCfg WHERE FID=@form;";
                var parameter = command.CreateParameter();
                parameter.ParameterName = "@form"; parameter.DbType = DbType.String; parameter.Size = 255; parameter.Value = screen.FormId;
                command.Parameters.Add(parameter);
                var rows = new List<LiveConfig>();
                await using (var reader = await command.ExecuteReaderAsync(token))
                    while (await reader.ReadAsync(token))
                        rows.Add(new(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2),
                            reader.IsDBNull(3) ? null : reader.GetString(3)));
                formChanges.AddRange(CompareForm(screen.Id, ErpScreenCatalog.Metadata(screen.Id), rows));
            }
        }
        return new(clock.GetUtcNow(), items.Length, items.Where(item => item.Status != "ok").ToArray(), formChanges);
    }

    internal sealed record LiveConfig(string Key, string? Control, string? Property, string? Value);

    // Same addressing and hash as SqlErpScreenCommands.VerifyScreenConfiguration (SHA-256 of the UTF-16LE value).
    internal static IEnumerable<ErpFormConfigChange> CompareForm(string module, System.Text.Json.JsonElement metadata, IReadOnlyList<LiveConfig> live)
    {
        static string Address(string? key, string? control, string? property) => System.Text.Json.JsonSerializer.Serialize(new[] { key, control, property });
        static string Hash(string? value) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.Unicode.GetBytes(value ?? ""))).ToLowerInvariant();
        static string? Shown(string? property, string? value) => value is null ? null
            : property is "BT" or "LBEX" || value.Length <= 2 ? value : $"({value.Length} ký tự)";
        var expected = metadata.GetProperty("configuration").EnumerateArray().ToDictionary(row => Address(row.GetProperty("key").GetString(),
            row.GetProperty("control").GetString(), row.GetProperty("property").GetString()), row => row, StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in live)
        {
            // The catalog stores "" for an empty control/property; SY_FrmCfg may hold NULL or "".
            var address = Address(row.Key, row.Control ?? "", row.Property ?? "");
            if (!expected.TryGetValue(address, out var want)) { address = Address(row.Key, row.Control, row.Property); expected.TryGetValue(address, out want); }
            if (want.ValueKind == System.Text.Json.JsonValueKind.Undefined)
            { yield return new(module, row.Key, row.Control, row.Property, "added", null, Shown(row.Property, row.Value)); continue; }
            seen.Add(address);
            if (want.GetProperty("sha256Utf16LE").GetString() != Hash(row.Value) || want.GetProperty("valueIsNull").GetBoolean() != (row.Value is null))
                yield return new(module, row.Key, row.Control, row.Property, "changed",
                    $"({want.GetProperty("characters").GetInt32()} ký tự)", Shown(row.Property, row.Value));
        }
        foreach (var (address, want) in expected.Where(pair => !seen.Contains(pair.Key)))
            yield return new(module, want.GetProperty("key").GetString()!, want.GetProperty("control").GetString(),
                want.GetProperty("property").GetString(), "missing", $"({want.GetProperty("characters").GetInt32()} ký tự)", null);
    }

    internal static ErpLookupCheckItem Compare(ErpScreenDescription screen, ErpLookupDefinition lookup, IReadOnlyList<LiveRow> live)
    {
        var rows = live.Where(row => row.Form == screen.FormId && row.Column == lookup.Field && row.Grid == lookup.Grid).ToArray();
        // The Web never runs a lookup it has disabled, so ERP's row for it cannot break anything.
        if (lookup.Disabled) return new(screen.Id, lookup.Id, "ok", []);
        if (rows.Length > 1) return new(screen.Id, lookup.Id, "duplicate", []);
        if (rows.Length == 0) return new(screen.Id, lookup.Id, "missing", Candidates(screen, lookup, live));
        var row = rows[0]; var mismatches = new List<ErpLookupMismatch>();
        void Check(string field, string? expected, string? actual) { if (expected != actual) mismatches.Add(new(field, expected, actual)); }
        Check("ValueColumn", lookup.ValueField, row.Value);
        Check("DisplayColumn", lookup.DisplayField, row.Display);
        Check("ParaArr", lookup.Parameters, row.Parameters);
        Check("ParaRequireArr", lookup.RequiredParameters, row.Required);
        Check("IsDisable", lookup.Disabled.ToString(), row.Disabled.ToString());
        Check("IsMultiSelect", lookup.MultiSelect.ToString(), row.MultiSelect.ToString());
        Check("LinkColumn", lookup.LinkedFields, row.Linked);
        if (ErpScreenCatalog.IsWorkflow(screen.Id)) Check("IsNotInList", lookup.AllowUnlisted.ToString(), row.NotInList.ToString());
        // Not refused by itself, but a changed query can change the columns the Web reads.
        Check("SourceHash", lookup.SourceHash, row.SourceHash);
        return new(screen.Id, lookup.Id, mismatches.Count == 0 ? "ok" : "changed", mismatches);
    }

    // Where a missing row may have gone: the same column under another grid, or else which grids the form still has
    // (none at all means ERP dropped every dropdown of that form).
    private static ErpLookupMismatch[] Candidates(ErpScreenDescription screen, ErpLookupDefinition lookup, IReadOnlyList<LiveRow> live)
    {
        var form = live.Where(row => row.Form == screen.FormId).ToArray();
        var moved = form.Where(row => row.Column == lookup.Field).Select(row => new ErpLookupMismatch("GridName", lookup.Grid, row.Grid)).ToArray();
        if (moved.Length > 0) return moved;
        var grids = string.Join(';', form.Select(row => row.Grid ?? "").Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal));
        return [new("FormGrids", lookup.Grid, grids)];
    }
}
