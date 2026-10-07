using System.Data;
using System.Text.Json;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure.Inbound;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class InboundDraftSqlTests
{

    [Fact]
    public void Qualification_plans_are_fixed_SELECTs_and_include_catalog_safety_predicates()
    {
        var plans=typeof(InboundDraftSql).GetFields(System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic)
            .Where(field=>field.Name.StartsWith("Target",StringComparison.Ordinal)).ToDictionary(field=>field.Name,field=>(string)field.GetRawConstantValue()!);
        Assert.Equal(6,plans.Count);
        Assert.All(plans.Values,sql=>
        {
            Assert.Contains("SELECT",sql);
            Assert.DoesNotContain("CREATE ",sql);Assert.DoesNotContain("ALTER ",sql);Assert.DoesNotContain("INSERT ",sql);
            Assert.DoesNotContain("UPDATE ",sql);Assert.DoesNotContain("DELETE ",sql);Assert.DoesNotContain("EXEC",sql);
            Assert.DoesNotContain("Purchase",sql);
        });
        var columns=plans["TargetColumnsText"];
        foreach(var field in new[]{"max_length","is_nullable","precision","scale","collation_name","is_user_defined",
            "is_identity","is_computed","generated_always_type","is_hidden","encryption_type","default_object_id"})Assert.Contains(field,columns);
        foreach(var field in new[]{"is_primary_key","key_ordinal","is_unique","is_disabled","has_filter","is_descending_key","ignore_dup_key"})
            Assert.Contains(field,plans["TargetKeysText"]);
        foreach(var field in new[]{"sys.triggers","sys.security_predicates","durability","sys.check_constraints","sys.default_constraints"})
            Assert.Contains(field,plans["TargetTablesText"]);
        Assert.Contains("XACT_STATE()",plans["TargetEnvironmentText"]);Assert.Contains("@@TRANCOUNT=1",plans["TargetEnvironmentText"]);
        Assert.Contains("is_not_trusted",plans["TargetDefinitionsText"]);Assert.Contains("OBJECT_NAME(C.parent_object_id)",plans["TargetDefinitionsText"]);
        Assert.Contains("TOP(2)",plans["TargetBindingText"]);Assert.Contains("WITH(HOLDLOCK)",plans["TargetBindingText"]);
        Assert.DoesNotContain("WHERE",plans["TargetBindingText"]);
    }
    [Fact]
    public void Real_SqlClient_parameters_keep_source_decimal_types_without_a_database_connection()
    {
        using var command=new SqlCommand();
        InboundDraftSql.Add(command,"@quantity",DbType.Decimal,999999999999999999m,0,18,0);
        InboundDraftSql.Add(command,"@rate",DbType.Decimal,1.1234567890m,0,28,10);
        var quantity=Assert.IsType<SqlParameter>(command.Parameters["@quantity"]);
        Assert.Equal(SqlDbType.Decimal,quantity.SqlDbType);Assert.Equal((byte)18,quantity.Precision);Assert.Equal((byte)0,quantity.Scale);
        Assert.Equal(999999999999999999m,quantity.Value);
        var rate=Assert.IsType<SqlParameter>(command.Parameters["@rate"]);
        Assert.Equal((byte)28,rate.Precision);Assert.Equal((byte)10,rate.Scale);
        Assert.Null(command.Connection);
    }
    [Fact]
    public void Fixed_header_parameters_preserve_untrusted_unicode_and_omit_source_defaults()
    {
        var model=new InboundModel(); using var connection=new InboundConnection(model);connection.Open();
        using var transaction=connection.BeginTransaction();
        const string untrusted="' ; DELETE dbo.Anything; --";
        var h=InboundModel.Header with{InvoiceNo=untrusted,Notes="Ghi chú thử nghiệm"};
        using var save=InboundDraftSql.Header(transaction,"SYNTHETIC",h,false);
        Assert.DoesNotContain(untrusted,save.CommandText);
        Assert.Equal(untrusted,save.Parameters["@invoice"].Value);
        Assert.Equal(DbType.String,save.Parameters["@invoice"].DbType);
        Assert.Equal(50,save.Parameters["@invoice"].Size);
        Assert.Equal((byte)28,save.Parameters["@rate"].Precision);
        Assert.Equal((byte)10,save.Parameters["@rate"].Scale);
        Assert.Same(transaction,save.Transaction);
        Assert.DoesNotContain("QRPrintType",save.CommandText);
        Assert.DoesNotContain("SET StatusID",save.CommandText);
        using var create=InboundDraftSql.Header(transaction,"SYNTHETIC",h,true);
        Assert.Contains("@notes,0)",create.CommandText);
        Assert.DoesNotContain("QRPrintType",create.CommandText);
    }

    [Fact]
    public void Detail_and_send_plans_have_exact_types_scoped_predicates_and_no_cost_or_readonly_writes()
    {
        var model=new InboundModel(); using var c=new InboundConnection(model);c.Open();using var tx=c.BeginTransaction();
        using var detail=InboundDraftSql.Detail(tx,"SYNTHETIC","ROW",InboundModel.Detail,1m,false);
        Assert.Equal((byte)18,detail.Parameters["@set"].Precision);
        Assert.Equal((byte)0,detail.Parameters["@set"].Scale);
        Assert.Equal(DbType.AnsiString,detail.Parameters["@row"].DbType);
        Assert.Contains("WHERE UserAutoID=@row AND DocumentID=@document",detail.CommandText);
        Assert.DoesNotContain("PalletNote",detail.CommandText);
        Assert.DoesNotContain("ByReal",detail.CommandText);
        using var send=InboundDraftSql.Send(tx,"SYNTHETIC","BR-A");
        using var log=InboundDraftSql.LegacyLog(tx,"SYNTHETIC","sample-user","note");
        Assert.Contains("SET StatusID=2",send.CommandText);
        Assert.Contains("StatusID IN (0,1)",send.CommandText);
        Assert.DoesNotContain("StatusID=10",send.CommandText);
        Assert.Equal(200,log.Parameters["@note"].Size);
        Assert.Equal(50,log.Parameters["@actor"].Size);
        Assert.DoesNotContain("ThoiGian",log.CommandText);
        Assert.DoesNotContain("CTCPTbl",detail.CommandText+send.CommandText+log.CommandText);
    }

    [Fact]
    public void Wire_decimals_remain_strings_and_unknown_or_locked_fields_are_rejected()
    {
        var detail=InboundModel.Detail with{SetQuantityByDocument=999999999999999999m};
        var json=JsonSerializer.Serialize(detail);
        Assert.Contains("\"SetQuantityByDocument\":\"999999999999999999\"",json);
        Assert.Equal(detail,JsonSerializer.Deserialize<InboundDraftDetailUpsert>(json));
        Assert.Throws<JsonException>(()=>JsonSerializer.Deserialize<InboundDraftDetailUpsert>(json.Replace("}",",\"PalletNote\":\"forged\"}")));
        var command=InboundModel.Create();
        var commandJson=JsonSerializer.Serialize(command);
        Assert.Throws<JsonException>(()=>JsonSerializer.Deserialize<InboundDraftCommand>(commandJson[..^1]+",\"StatusID\":10}"));
    }

    [Theory]
    [InlineData("fraction")] [InlineData("overflow")] [InlineData("price")] [InlineData("rate")]
    [InlineData("surrogate")] [InlineData("date")] [InlineData("duplicate")]
    public void Unsupported_precision_identity_and_encoding_are_not_silently_coerced(string bad)
    {
        var request=InboundModel.Create();
        request=bad switch
        {
            "fraction"=>request with{DetailUpserts=[InboundModel.Detail with{RowId=null,ClientLineId=Guid.NewGuid(),SetQuantityByDocument=1.1m}]},
            "overflow"=>request with{DetailUpserts=[InboundModel.Detail with{RowId=null,ClientLineId=Guid.NewGuid(),SetQuantityByDocument=1000000000000000000m}]},
            "price"=>request with{DetailUpserts=[InboundModel.Detail with{RowId=null,ClientLineId=Guid.NewGuid(),UnitPrice=1.1m}]},
            "rate"=>request with{Header=InboundModel.Header with{RateExchange=1.00000000001m}},
            "surrogate"=>request with{Header=InboundModel.Header with{Notes="\ud800"}},
            "date"=>request with{Header=InboundModel.Header with{DocumentDate=DateTime.MinValue}},
            "duplicate"=>request with{DetailUpserts=[request.DetailUpserts![0],request.DetailUpserts[0]]},
            _=>throw new InvalidOperationException()
        };
        Assert.Equal(InboundDraftOutcome.InvalidInput,InboundDraftValidation.Check(request));
    }
}
