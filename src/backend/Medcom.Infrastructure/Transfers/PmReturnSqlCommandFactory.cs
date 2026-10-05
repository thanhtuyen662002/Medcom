using System.Data;
using Medcom.Application.Transfers;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.Transfers;

public sealed record PmReturnSqlParameter(string Name, SqlDbType Type, int Size, string Value);

public sealed class PmReturnSqlCommandPlan
{
    internal PmReturnSqlCommandPlan(string procedure, PmReturnSqlParameter[] parameters)
    {
        Procedure = procedure;
        Parameters = Array.AsReadOnly(parameters);
    }
    public string Procedure { get; }
    public CommandType CommandType => CommandType.StoredProcedure;
    public IsolationLevel RequiredIsolationLevel => IsolationLevel.Serializable;
    public IReadOnlyList<PmReturnSqlParameter> Parameters { get; }

    // Building a command does not execute it. Ownership stays with the caller's transaction.
    public SqlCommand CreateCommand(SqlTransaction transaction)
    {
        var connection = PmReturnTransactionContract.Require(transaction);
        var command = new SqlCommand(Procedure, connection, transaction)
        { CommandType = CommandType.StoredProcedure, CommandTimeout = 15 };
        foreach (var parameter in Parameters)
            command.Parameters.Add(parameter.Name, parameter.Type, parameter.Size).Value = parameter.Value;
        return command;
    }
}

public static class PmReturnSqlCommandFactory
{
    public const string SourceProcedure = "dbo.IV_InternalTransfer_RequestPMReturnStp";
    public const string SourceProcedureSha256 = "a7225b1ed64667ca16b8edeb7216009d9b1d9ad4d8bd85c289eb8db7e802fb49";

    public static PmReturnSqlCommandPlan CreatePlan(PreparedPmReturn prepared)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        var command = prepared.Command;
        if (command.Action.Id != PmReturnPreparation.ActionId
            || command.Action.Procedure != "IV_InternalTransfer_RequestPMReturnStp"
            || command.Action.ProcedureSha256 != SourceProcedureSha256
            || command.Payload is not ReturnByPmPayload payload
            || !LosslessAnsiValue.TryCreate(command.Actor.Value, 50, out _)
            || !LosslessAnsiValue.TryCreate(command.DocumentKey.Value, 30, out _)
            || command.ExpectedRowVersion != prepared.State.StateEqualityToken)
            throw new ArgumentException("A source-matched prepared PM Return command is required.", nameof(prepared));
        return new(SourceProcedure,
        [
            new("@DocumentID", SqlDbType.VarChar, 30, command.DocumentKey.Value),
            // Match the procedure's varchar(100), while admission respects log varchar(50).
            new("@User", SqlDbType.VarChar, 100, command.Actor.Value),
            new("@Reason", SqlDbType.NVarChar, -1, payload.Reason)
        ]);
    }
}
