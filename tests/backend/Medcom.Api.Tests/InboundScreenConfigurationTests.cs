using System.Data;
using System.Text.Json;
using Medcom.Application;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Medcom.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class InboundScreenConfigurationTests
{
    private const string CurrentHash="8f28068831ebda75b4e87c751c65fd6b08ce45f6e32770cac0e42215e43efaa1";

    [Theory]
    [InlineData("current")] [InlineData("old")] [InlineData("unknown")]
    [InlineData("missing")] [InlineData("extra")] [InlineData("duplicate")] [InlineData("null")]
    public async Task Offline_source_audit_detects_inbound_configuration_drift_without_gating_runtime(string mutation)
    {
        var metadata=ErpScreenCatalog.Metadata("inbound-requests");
        Assert.Equal(CurrentHash,metadata.GetProperty("buttons").EnumerateArray()
            .Single(b=>b.GetProperty("operation").GetString()=="send-warehouse").GetProperty("checkSha256Utf16LE").GetString());
        var table=new DataTable();
        foreach(var name in new[]{"KeyID","SubID","SubValue","Hash"})table.Columns.Add(name,typeof(string));
        table.Columns.Add("IsNull",typeof(int));
        foreach(var row in metadata.GetProperty("configuration").EnumerateArray())
            table.Rows.Add(row.GetProperty("key").GetString(),row.GetProperty("control").GetString(),
                row.GetProperty("property").GetString(),row.GetProperty("sha256Utf16LE").GetString(),row.GetProperty("valueIsNull").GetBoolean()?1:0);
        Assert.Equal(184,table.Rows.Count);
        var guard=Assert.Single(table.Rows.Cast<DataRow>(),r=>(string)r[0]=="LYS1"&&(string)r[1]=="ExecSQLWithParaButtonCtl_1"&&(string)r[2]=="CS4");
        Assert.Equal(CurrentHash,guard[3]);
        if(mutation=="old")guard[3]="0e2167a49fd1cfb83055dd108b5636ca5fa9a1730b9c2e95cdb38914c1ccaf94";
        if(mutation=="unknown")guard[3]=new string('a',64);
        if(mutation=="null")guard[4]=1;
        if(mutation=="missing")table.Rows.Remove(guard);
        if(mutation=="duplicate")table.Rows.Add(guard.ItemArray);
        if(mutation=="extra")table.Rows.Add("UNKNOWN","UNKNOWN","CS4",CurrentHash,0);
        using var connection=new DisplayConnection(command=>
        {
            Assert.Equal("IV_InboundRequestFrm",command.Parameters["@form"].Value);
            return table.CreateDataReader();
        });
        connection.Open();using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        var verify=()=>SqlErpScreenCommands.VerifyScreenConfiguration(transaction,ErpSqlPlan.Get("inbound-requests")!,default);
        if(mutation=="current")await verify();else await Assert.ThrowsAnyAsync<Exception>(verify);
    }

    [Theory]
    [InlineData(ErpReadStage.Session,false)] [InlineData(ErpReadStage.OpenConnection,false)]
    [InlineData(ErpReadStage.OpenConnection,true)]
    public async Task Read_failure_diagnostics_do_not_expose_private_values_or_change_the_result(ErpReadStage stage,bool brokenLogger)
    {
        var events=new List<ErpReadDiagnostic>();
        var identity=new AuthoritativeIdentity("PRIVATE_ACTOR","T","C","C","PRIVATE_NAME",1,[],BranchIds:["B1"]);
        var reader=new SqlErpScreenReader(new("T","C","C"),
            ()=>throw new InvalidOperationException("SELECT PRIVATE_SQL; password=PRIVATE_SECRET"),
            _=>stage==ErpReadStage.Session?throw new TimeoutException("PRIVATE_SESSION"):Task.FromResult<AuthoritativeIdentity?>(identity),
            _=>Task.FromResult<AuthoritativeIdentity?>(identity),
            value=>{events.Add(value);if(brokenLogger)throw new InvalidOperationException("PRIVATE_LOGGER");});
        var result=await reader.Run<object>("inbound-requests","B1",(_,_,_,_)=>throw new InvalidOperationException("Unexpected read"),default);
        Assert.Equal(ErpReadOutcome.Unavailable,result.Outcome);
        var observed=Assert.Single(events);Assert.Equal(stage,observed.Stage);
        Assert.Equal("inbound-requests",observed.Module);Assert.True(observed.ElapsedMilliseconds>=0);
        Assert.Null(observed.ProviderErrorNumber);
        Assert.Equal(stage==ErpReadStage.Session?ErpReadException.Timeout:ErpReadException.InvalidOperation,observed.ExceptionKind);
        Assert.DoesNotContain("PRIVATE_",JsonSerializer.Serialize(observed));
    }

    [Fact]
    public void Server_log_includes_correlation_and_stage_without_an_exception_object()
    {
        var logger=new ReadLog();var context=new DefaultHttpContext{TraceIdentifier="synthetic-correlation"};
        ApiHost.LogErpReadUnavailable(logger,context,new("inbound-requests",ErpReadStage.ScreenConfiguration,ErpReadException.Other,null,15));
        var entry=Assert.Single(logger.Entries);Assert.Equal(LogLevel.Warning,entry.Level);
        Assert.Equal(1003,entry.Event.Id);Assert.Null(entry.Exception);
        Assert.Contains("synthetic-correlation",entry.Message);Assert.Contains("ScreenConfiguration",entry.Message);
    }
    private sealed class ReadLog:ILogger
    {
        public readonly List<(LogLevel Level,EventId Event,Exception? Exception,string Message)> Entries=[];
        public IDisposable? BeginScope<TState>(TState state) where TState:notnull=>null;
        public bool IsEnabled(LogLevel level)=>true;
        public void Log<TState>(LogLevel level,EventId eventId,TState state,Exception? exception,Func<TState,Exception?,string> formatter)
            =>Entries.Add((level,eventId,exception,formatter(state,exception)));
    }
}
