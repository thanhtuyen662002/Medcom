using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json.Nodes;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class StatusColorAndBatchTests
{
    [Theory]
    [InlineData("-65536","#FF0000")] [InlineData("-16777216","#000000")] [InlineData("-1","#FFFFFF")]
    [InlineData("0","#000000")] [InlineData("2147418112","#FF0000")]
    [InlineData(null,null)] [InlineData("bad",null)] [InlineData("4294967295",null)]
    public void Source_integer_RGB_channels_become_opaque_CSS_including_zero_text_color(string? raw,string? expected)
        =>Assert.Equal(expected,FeDisplayProjection.StatusColor(raw));

    [Fact]
    public async Task Nullable_native_integer_colors_travel_with_status_names_and_never_leak_for_duplicate_IDs()
    {
        var binding=ApiReferenceCatalog.Get("status:purchase-requests")!;
        Assert.Equal(new[]{"ForeColor","BackColor"},binding.Extras);
        var table=StatusTable();table.Rows.Add(0,1,"Nháp",-65536,-1);table.Rows.Add(1,2,"Chờ duyệt",DBNull.Value,DBNull.Value);
        table.Rows.Add(2,3,"Duplicate one",-1,-1);table.Rows.Add(2,3,"Duplicate two",-65536,-65536);
        var keys=Enumerable.Range(1,4).Select(i=>new ReferenceKey(binding.Id,i.ToString(CultureInfo.InvariantCulture))).ToArray();
        using var connection=new DisplayConnection(_=>table.CreateDataReader());connection.Open();using var tx=connection.BeginTransaction(IsolationLevel.Serializable);
        var values=await SqlReferenceData.ReadBatch(tx,binding,keys,default);
        var rows=JsonNode.Parse("""{"rows":[{"statusId":1},{"statusId":2},{"statusId":3},{"statusId":4}]}""")!;
        FeDisplayProjection.Apply(rows,"purchase-requests",values);
        Assert.Equal("#FF0000",rows["rows"]![0]!["statusForeColor"]!.GetValue<string>());
        Assert.Equal("#FFFFFF",rows["rows"]![0]!["statusBackColor"]!.GetValue<string>());
        Assert.Equal("Nháp",rows["rows"]![0]!["statusName"]!.GetValue<string>());
        foreach(var i in new[]{1,2,3}){Assert.Null(rows["rows"]![i]!["statusForeColor"]);Assert.Null(rows["rows"]![i]!["statusBackColor"]);}
        Assert.Equal("ambiguous",rows["rows"]![2]!["statusReferenceState"]!.GetValue<string>());
        var detail=JsonNode.Parse("""{"data":{"header":{"documentId":"QA-DOC"},"statusId":1,"stateToken":"unchanged"}}""")!;
        FeDisplayProjection.Apply(detail,"purchase-requests",values);
        var flat=CanonicalResponseProjection.Normalize(detail,"/api/erp/purchase-requests/detail");
        Assert.Null(flat["data"]!["statusForeColor"]);Assert.Equal("#FF0000",flat["data"]!["header"]!["statusForeColor"]!.GetValue<string>());
    }
    [Theory]
    [InlineData("valid")] [InlineData("missing")] [InlineData("extra")] [InlineData("wrong-key")] [InlineData("wrong-shape")]
    public async Task Mixed_reference_queries_use_one_exchange_and_fence_every_result(string defect)
    {
        var item=ApiReferenceCatalog.Get("item")!;var status=ApiReferenceCatalog.Get("status:purchase-orders")!;var calls=0;
        using var connection=new DisplayConnection(command=>
        {
            calls++;Assert.Equal(2,command.Parameters.Count);Assert.Equal("I",command.Parameters["@b0_k0"].Value);
            Assert.Equal(1,command.Parameters["@b1_k0"].Value);Assert.Equal(DbType.Int32,command.Parameters["@b1_k0"].DbType);
            Assert.Equal(DbType.String,command.Parameters["@b0_k0"].DbType);Assert.Contains("@b1_k0",command.CommandText);
            var a=StringTable();a.Rows.Add(0,"I","Tên hàng","CODE","Cái");
            var b=StatusTable();b.Rows.Add(0,defect=="wrong-key"?9:1,"Nháp",-1,DBNull.Value);
            if(defect=="wrong-shape")b.Columns.RemoveAt(4);
            return new DataTableReader(defect=="missing"?[a]:defect=="extra"?[a,b,a.Clone()]:[a,b]);
        });
        connection.Open();using var tx=connection.BeginTransaction(IsolationLevel.Serializable);
        var queries=new[]{(item,new[]{new ReferenceKey("item","I")}),(status,new[]{new ReferenceKey(status.Id,"1")})};
        if(defect=="valid")
        {
            var result=await SqlReferenceData.ReadBatches(tx,queries,default);Assert.Equal(2,result.Count);
            Assert.Equal("CODE",result[new("item","I")].Extra["ItemCode"]);Assert.Equal("-1",result[new(status.Id,"1")].Extra["ForeColor"]);
        }
        else await Assert.ThrowsAsync<InvalidOperationException>(()=>SqlReferenceData.ReadBatches(tx,queries,default));
        Assert.Equal(1,calls);
    }
    [Theory]
    [InlineData("duplicate")] [InlineData("too-many")] [InlineData("wrong-binding")]
    public async Task Reference_batch_bounds_are_checked_before_SQL(string defect)
    {
        var item=ApiReferenceCatalog.Get("item")!;
        var keys=defect=="too-many"?Enumerable.Range(0,1001).Select(i=>new ReferenceKey("item",i.ToString())).ToArray()
            :new[]{new ReferenceKey(defect=="wrong-binding"?"branch":"item","I"),new ReferenceKey("item","I")};
        using var connection=new DisplayConnection(_=>throw new InvalidOperationException("Must not query"));connection.Open();using var tx=connection.BeginTransaction();
        await Assert.ThrowsAsync<InvalidOperationException>(()=>SqlReferenceData.ReadBatches(tx,keys.Chunk(100).Select(k=>(item,k)).ToArray(),default));
    }
    private static DataTable StatusTable()
    {var t=new DataTable();t.Columns.Add("ordinal",typeof(int));t.Columns.Add("id",typeof(int));t.Columns.Add("name",typeof(string));t.Columns.Add("fore",typeof(int));t.Columns.Add("back",typeof(int));return t;}
    private static DataTable StringTable()
    {var t=new DataTable();t.Columns.Add("ordinal",typeof(int));foreach(var n in new[]{"id","name","code","unit"})t.Columns.Add(n,typeof(string));return t;}
}
