using System.Collections;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using Medcom.TargetInspect;

namespace Medcom.TargetInspect.Tests;

// Entirely synthetic provider. This fixture cannot create a real connection or execute SQL.
internal sealed class RecordingDbConnection : DbConnection
{
    internal const string Canary = "SYNTHETIC_PRIVATE_CANARY_7b7e0c";
    private ConnectionState state;
    public List<RecordedCommand> Commands { get; } = [];
    public Dictionary<string, DataTable[]> Results { get; } = new(StringComparer.Ordinal);
    public string? Fault { get; set; }
    public string? FaultStatement { get; set; }
    public bool DisposalFails { get; set; }
    public int OpenCalls { get; private set; }
    public int DisposeCalls { get; private set; }
    public int TransactionCalls { get; private set; }
    public int MutationCalls { get; private set; }
    public int ReaderDisposeCalls { get; private set; }
    public int CommandDisposeCalls { get; private set; }

    public RecordingDbConnection()
    {
        Results.Add(InspectionSql.Environment, [Table(6, [1, 0, 1, 1, 1, 1])]);
        foreach (var sql in new[] { InspectionSql.Columns, InspectionSql.Keys, InspectionSql.Safety })
            Results.Add(sql, [Table(2, InspectionSql.Tables.Select(name => new object[] { name, 0 }).ToArray())]);
        Results.Add(InspectionSql.PurchaseForeignKey, [Table(1, [0])]);
        Results.Add(InspectionSql.Definitions, [Table(3, InspectionRunner.ExpectedDefinitions
            .Select(pair => new object[] { pair.Key, pair.Value, 0 }).ToArray())]);
        Results.Add(InspectionSql.Defaults, [Table(3,
            ["WebInboundRequestCommandJournalV1.CreatedAtUtc", "(sysutcdatetime())", 0],
            ["IV_InboundRequestLogTbl.UserAutoID", "(newid())", 0],
            ["IV_InboundRequestLogTbl.ThoiGian", "(getdate())", 0])]);
        Results.Add(InspectionSql.Binding, [Table(1, [0])]);
        Results.Add(InspectionSql.ServerTriggers, [Table(1, [0])]);
        Results.Add(InspectionSql.InboundEnvironment, [Table(2, InspectionSql.InboundEnvironmentChecks.Select(name => new object[] { name, 0 }).ToArray())]);
        Results.Add(InspectionSql.InboundMarker, [Table(2, InspectionSql.InboundMarkerChecks.Select(name => new object[] { name, 0 }).ToArray())]);
        Results.Add(InspectionSql.InboundMarkerDefinition, [Table(2, ["(SingletonId=1 AND SchemaVersion=1)", 0])]);
        Results.Add(InspectionSql.InboundBindingRows, [Table(5, [(byte)1, 1,
            Guid.Parse("22222222-2222-2222-2222-222222222222"), "synthetic-inbound-tenant", "synthetic-inbound-company"])]);
    }

    public static DataTable Table(int width, params object[][] rows)
    {
        var result = new DataTable();
        for (var index = 0; index < width; index++) result.Columns.Add("Column" + index, typeof(object));
        foreach (var row in rows) result.Rows.Add(row);
        return result;
    }

    [AllowNull] public override string ConnectionString { get; set; } = Canary;
    public override string Database => Canary;
    public override string DataSource => Canary;
    public override string ServerVersion => Canary;
    public override ConnectionState State => state;
    public override void ChangeDatabase(string databaseName) => throw new NotSupportedException(Canary);
    public override void Close() => state = ConnectionState.Closed;
    public override void Open() => throw new NotSupportedException("Only the async recording path is permitted.");
    public override Task OpenAsync(CancellationToken cancellationToken)
    {
        OpenCalls++;
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfRequested("open", null);
        state = ConnectionState.Open;
        return Task.CompletedTask;
    }

    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
    {
        TransactionCalls++;
        throw new NotSupportedException("An inspection must never begin a transaction.");
    }

    protected override DbCommand CreateDbCommand() => new RecordingCommand(this);
    public override ValueTask DisposeAsync()
    {
        DisposeCalls++;
        state = ConnectionState.Closed;
        if (DisposalFails) throw new InvalidOperationException(Canary);
        GC.SuppressFinalize(this);
        return ValueTask.CompletedTask;
    }

    private void ThrowIfRequested(string point, string? statement)
    {
        if (FaultStatement is not null && FaultStatement != statement) return;
        if (Fault == point) throw new InvalidOperationException(Canary);
        if (Fault == point + "-cancel") throw new OperationCanceledException(Canary);
    }

    private sealed class RecordingCommand(RecordingDbConnection owner) : DbCommand
    {
        private readonly RecordingParameters parameters = new();
        [AllowNull] public override string CommandText { get; set; } = "";
        public override int CommandTimeout { get; set; }
        public override CommandType CommandType { get; set; }
        public override bool DesignTimeVisible { get; set; }
        public override UpdateRowSource UpdatedRowSource { get; set; }
        protected override DbConnection? DbConnection { get; set; } = owner;
        protected override DbTransaction? DbTransaction { get; set; }
        protected override DbParameterCollection DbParameterCollection => parameters;
        public override void Cancel() { }
        public override void Prepare() => throw new NotSupportedException();
        protected override DbParameter CreateDbParameter() => new RecordingParameter();
        public override int ExecuteNonQuery()
        {
            owner.MutationCalls++;
            throw new NotSupportedException("An inspection must never execute a non-query.");
        }
        public override object? ExecuteScalar() => throw new NotSupportedException();
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => throw new NotSupportedException();
        protected override Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            owner.Commands.Add(new(CommandText, CommandType, CommandTimeout, DbTransaction is not null,
                parameters.Cast<DbParameter>().Select(p => new RecordedParameter(p.ParameterName, p.DbType, p.Size, p.Value)).ToArray()));
            owner.ThrowIfRequested("execute", CommandText);
            if (!owner.Results.TryGetValue(CommandText, out var tables))
                throw new InvalidOperationException("An unrecognized command was attempted.");
            return Task.FromResult<DbDataReader>(new RecordingReader(owner, CommandText, new DataTableReader(tables)));
        }
        public override ValueTask DisposeAsync()
        {
            owner.CommandDisposeCalls++;
            owner.ThrowIfRequested("command-dispose", CommandText);
            GC.SuppressFinalize(this);
            return ValueTask.CompletedTask;
        }
    }

    private sealed class RecordingReader(RecordingDbConnection owner, string statement, DbDataReader inner) : DbDataReader
    {
        public override int Depth => inner.Depth;
        public override int FieldCount => inner.FieldCount;
        public override bool HasRows => inner.HasRows;
        public override bool IsClosed => inner.IsClosed;
        public override int RecordsAffected => inner.RecordsAffected;
        public override object this[int ordinal] => inner[ordinal];
        public override object this[string name] => inner[name];
        public override bool GetBoolean(int ordinal) => inner.GetBoolean(ordinal);
        public override byte GetByte(int ordinal) => inner.GetByte(ordinal);
        public override long GetBytes(int ordinal, long dataOffset, byte[]? buffer, int bufferOffset, int length)
            => inner.GetBytes(ordinal, dataOffset, buffer, bufferOffset, length);
        public override char GetChar(int ordinal) => inner.GetChar(ordinal);
        public override long GetChars(int ordinal, long dataOffset, char[]? buffer, int bufferOffset, int length)
            => inner.GetChars(ordinal, dataOffset, buffer, bufferOffset, length);
        public override string GetDataTypeName(int ordinal) => inner.GetDataTypeName(ordinal);
        public override DateTime GetDateTime(int ordinal) => inner.GetDateTime(ordinal);
        public override decimal GetDecimal(int ordinal) => inner.GetDecimal(ordinal);
        public override double GetDouble(int ordinal) => inner.GetDouble(ordinal);
        public override Type GetFieldType(int ordinal) => inner.GetFieldType(ordinal);
        public override float GetFloat(int ordinal) => inner.GetFloat(ordinal);
        public override Guid GetGuid(int ordinal) => inner.GetGuid(ordinal);
        public override short GetInt16(int ordinal) => inner.GetInt16(ordinal);
        public override int GetInt32(int ordinal) => inner.GetInt32(ordinal);
        public override long GetInt64(int ordinal) => inner.GetInt64(ordinal);
        public override string GetName(int ordinal) => inner.GetName(ordinal);
        public override int GetOrdinal(string name) => inner.GetOrdinal(name);
        public override string GetString(int ordinal) => inner.GetString(ordinal);
        public override object GetValue(int ordinal) => inner.GetValue(ordinal);
        public override int GetValues(object[] values) => inner.GetValues(values);
        public override bool IsDBNull(int ordinal) => inner.IsDBNull(ordinal);
        public override IEnumerator GetEnumerator() => ((IEnumerable)inner).GetEnumerator();
        public override bool NextResult() => inner.NextResult();
        public override bool Read() => inner.Read();
        public override Task<bool> ReadAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            owner.ThrowIfRequested("read", statement);
            return inner.ReadAsync(cancellationToken);
        }
        public override Task<bool> NextResultAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            owner.ThrowIfRequested("next-result", statement);
            return inner.NextResultAsync(cancellationToken);
        }
        public override async ValueTask DisposeAsync()
        {
            owner.ReaderDisposeCalls++;
            await inner.DisposeAsync();
            owner.ThrowIfRequested("reader-dispose", statement);
            GC.SuppressFinalize(this);
        }
    }

    private sealed class RecordingParameter : DbParameter
    {
        public override DbType DbType { get; set; }
        public override ParameterDirection Direction { get; set; } = ParameterDirection.Input;
        public override bool IsNullable { get; set; }
        [AllowNull] public override string ParameterName { get; set; } = "";
        [AllowNull] public override string SourceColumn { get; set; } = "";
        public override object? Value { get; set; }
        public override bool SourceColumnNullMapping { get; set; }
        public override int Size { get; set; }
        public override void ResetDbType() => DbType = DbType.Object;
    }

    private sealed class RecordingParameters : DbParameterCollection
    {
        private readonly List<DbParameter> items = [];
        public override int Count => items.Count;
        public override object SyncRoot => this;
        public override int Add(object value) { items.Add((DbParameter)value); return items.Count - 1; }
        public override void AddRange(Array values) { foreach (var value in values) Add(value!); }
        public override void Clear() => items.Clear();
        public override bool Contains(object value) => items.Contains((DbParameter)value);
        public override bool Contains(string value) => IndexOf(value) >= 0;
        public override void CopyTo(Array array, int index) => ((ICollection)items).CopyTo(array, index);
        public override IEnumerator GetEnumerator() => items.GetEnumerator();
        public override int IndexOf(object value) => items.IndexOf((DbParameter)value);
        public override int IndexOf(string parameterName) => items.FindIndex(p => p.ParameterName == parameterName);
        public override void Insert(int index, object value) => items.Insert(index, (DbParameter)value);
        public override void Remove(object value) => items.Remove((DbParameter)value);
        public override void RemoveAt(int index) => items.RemoveAt(index);
        public override void RemoveAt(string parameterName) => RemoveAt(IndexOf(parameterName));
        protected override DbParameter GetParameter(int index) => items[index];
        protected override DbParameter GetParameter(string parameterName) => items[IndexOf(parameterName)];
        protected override void SetParameter(int index, DbParameter value) => items[index] = value;
        protected override void SetParameter(string parameterName, DbParameter value) => items[IndexOf(parameterName)] = value;
    }
}

internal sealed record RecordedCommand(string Text, CommandType Type, int Timeout, bool HasTransaction, IReadOnlyList<RecordedParameter> Parameters);
internal sealed record RecordedParameter(string Name, DbType Type, int Size, object? Value);
