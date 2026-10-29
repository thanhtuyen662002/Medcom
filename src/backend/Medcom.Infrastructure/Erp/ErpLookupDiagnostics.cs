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
        return new(clock.GetUtcNow(), items.Length, items.Where(item => item.Status != "ok").ToArray());
    }

    internal static ErpLookupCheckItem Compare(ErpScreenDescription screen, ErpLookupDefinition lookup, IReadOnlyList<LiveRow> live)
    {
        var rows = live.Where(row => row.Form == screen.FormId && row.Column == lookup.Field && row.Grid == lookup.Grid).ToArray();
        if (rows.Length != 1) return new(screen.Id, lookup.Id, rows.Length == 0 ? "missing" : "duplicate", []);
        var row = rows[0]; var mismatches = new List<ErpLookupMismatch>();
        void Check(string field, string? expected, string? actual) { if (expected != actual) mismatches.Add(new(field, expected, actual)); }
        Check("ValueColumn", lookup.ValueField, row.Value);
        Check("DisplayColumn", lookup.DisplayField, row.Display);
        Check("ParaArr", lookup.Parameters, row.Parameters);
        Check("ParaRequireArr", lookup.RequiredParameters, row.Required);
        Check("IsDisable", "False", row.Disabled.ToString());
        Check("IsMultiSelect", lookup.MultiSelect.ToString(), row.MultiSelect.ToString());
        Check("LinkColumn", lookup.LinkedFields, row.Linked);
        if (ErpScreenCatalog.IsWorkflow(screen.Id)) Check("IsNotInList", lookup.AllowUnlisted.ToString(), row.NotInList.ToString());
        // Not refused by itself, but a changed query can change the columns the Web reads.
        Check("SourceHash", lookup.SourceHash, row.SourceHash);
        return new(screen.Id, lookup.Id, mismatches.Count == 0 ? "ok" : "changed", mismatches);
    }
}
