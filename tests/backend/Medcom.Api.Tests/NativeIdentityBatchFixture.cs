using System.Data;
using System.Data.Common;
using Medcom.Infrastructure;

namespace Medcom.Api.Tests;

// Compose the existing branch, alias and revocation scenarios in fixed TDS result order.
internal static class NativeIdentityBatchFixture
{
    internal static DbDataReader Read(DbCommand command, Func<DbCommand, DbDataReader> read)
    {
        if (command.CommandText != SqlNativeIdentity.Text && command.CommandText != SqlNativeIdentity.ErpText)
            throw new InvalidOperationException("Unexpected fixture batch.");
        var original = command.CommandText;
        var tables = new List<DataTable>();
        try
        {
            if (original == SqlNativeIdentity.ErpText) Append(SqlNativeIdentity.ErpUserText);
            var nativeIndex = tables.Count;
            Append(SqlLegacyBranchScope.NativeUserText);
            var native = tables[nativeIndex].Rows.Count == 0 || tables[nativeIndex].Columns.Count != 6 || tables[nativeIndex].Rows[0].IsNull(5)
                ? null : tables[nativeIndex].Rows[0][5] as string;
            if (SqlLegacyBranchScope.NativeAll(native))
            {
                Append(SqlLegacyBranchScope.CatalogShapeText);
                Append(SqlLegacyBranchScope.CatalogText);
            }
            else Append(SqlLegacyBranchScope.RestrictedText);
            return new DataTableReader(tables.ToArray());
        }
        finally { command.CommandText = original; }

        void Append(string sql)
        {
            command.CommandText = sql;
            using var reader = read(command);
            do
            {
                var table = new DataTable();
                for (var i = 0; i < reader.FieldCount; i++) table.Columns.Add("c" + i, reader.GetFieldType(i));
                while (reader.Read())
                {
                    var row = new object[reader.FieldCount]; reader.GetValues(row); table.Rows.Add(row);
                }
                tables.Add(table);
            } while (reader.NextResult());
        }
    }
}
