using System.Data;
using Medcom.Application.Transfers;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Transfers;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PmReturnSqlCommandTests
{
    [Fact]
    public void Plan_preserves_source_procedure_types_lengths_and_exact_values()
    {
        var prepared = I06Fixtures.Prepare();
        var plan = PmReturnSqlCommandFactory.CreatePlan(prepared);
        Assert.Equal("dbo.IV_InternalTransfer_RequestPMReturnStp", plan.Procedure);
        Assert.Equal(PmReturnSqlCommandFactory.SourceProcedureSha256, PmReturnPreparation.Action.ProcedureSha256);
        Assert.Equal(CommandType.StoredProcedure, plan.CommandType);
        Assert.Equal(IsolationLevel.Serializable, plan.RequiredIsolationLevel);
        Assert.Collection(plan.Parameters,
            key => { Assert.Equal("@DocumentID", key.Name); Assert.Equal(SqlDbType.VarChar, key.Type); Assert.Equal(30, key.Size); Assert.Equal("REQ-1", key.Value); },
            actor => { Assert.Equal("@User", actor.Name); Assert.Equal(SqlDbType.VarChar, actor.Type); Assert.Equal(100, actor.Size); Assert.Equal("pm.one", actor.Value); },
            reason => { Assert.Equal("@Reason", reason.Name); Assert.Equal(SqlDbType.NVarChar, reason.Type); Assert.Equal(-1, reason.Size); Assert.Equal(I06Fixtures.Reason, reason.Value); });
    }

    [Fact]
    public void Plan_parameters_cannot_be_replaced_after_admission()
    {
        var plan = PmReturnSqlCommandFactory.CreatePlan(I06Fixtures.Prepare());
        var parameters = Assert.IsAssignableFrom<IList<PmReturnSqlParameter>>(plan.Parameters);
        Assert.True(parameters.IsReadOnly);
        Assert.Throws<NotSupportedException>(() => parameters[0] = new("@DocumentID", SqlDbType.VarChar, 30, "OTHER"));
        Assert.Empty(typeof(PmReturnSqlCommandPlan).GetConstructors());
    }

    [Fact]
    public async Task Missing_transaction_never_opens_a_connection_or_builds_executable_command()
    {
        var plan = PmReturnSqlCommandFactory.CreatePlan(I06Fixtures.Prepare());
        Assert.Throws<ArgumentNullException>(() => plan.CreateCommand(null!));
        var reader = new SqlPmReturnAuthorityReader(new LegacyCompany("tenant", "company", "Synthetic"));
        await Assert.ThrowsAsync<ArgumentNullException>(() => reader.ReadAsync(null!, I06Fixtures.Identity(), "REQ-1"));
        Assert.Throws<ArgumentNullException>(() => PmReturnSqlCommandFactory.CreatePlan(null!));
    }

    [Fact]
    public void Binding_requires_concrete_caller_owned_sql_transaction()
    {
        var bind = typeof(PmReturnSqlCommandPlan).GetMethod(nameof(PmReturnSqlCommandPlan.CreateCommand))!;
        Assert.Equal(typeof(SqlTransaction), Assert.Single(bind.GetParameters()).ParameterType);
        var read = typeof(SqlPmReturnAuthorityReader).GetMethod(nameof(SqlPmReturnAuthorityReader.ReadAsync))!;
        Assert.Equal(typeof(SqlTransaction), read.GetParameters()[0].ParameterType);
        Assert.Equal(typeof(SqlCommand), bind.ReturnType);
        // A successful live transaction binding and its lock ownership require real SQL acceptance.
    }
}
