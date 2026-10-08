using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

// These inspect the same SQL builders used by production. They do not execute SQL Server.
public sealed class SqlDocumentBranchScopeTests
{
    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,20,20)] [InlineData(DocumentKind.PurchaseOrders,20,21)]
    [InlineData(DocumentKind.PurchaseOrders,50,50)] [InlineData(DocumentKind.PurchaseOrders,50,51)]
    [InlineData(DocumentKind.PurchaseOrders,100,100)] [InlineData(DocumentKind.PurchaseOrders,100,101)]
    [InlineData(DocumentKind.InboundRequests,20,21)] [InlineData(DocumentKind.InboundRequests,50,51)]
    [InlineData(DocumentKind.InboundRequests,100,101)]
    public async Task Actual_paged_reader_preserves_precision_order_and_lookahead_without_enrichment_fanout(DocumentKind kind,int size,int count)
    {
        var display=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
        display.Items.Add(("ITEM","current","Historical disabled item","base unit",true));
        for(var i=0;i<count;i++)display.Stored.Add(("DOC",$"ROW{i}","ITEM","persisted"));
        var user=new LegacyUser("qa-user","Synthetic","synthetic-hash",false,"qa-group",true,
            ["purchase-orders.read","inbound-requests.read"],["BR"]);
        var company=new LegacyCompany("T","C","Synthetic");
        var identity=new AuthoritativeIdentity(user.Username,"T","C","Synthetic","Synthetic",1,
            user.Capabilities!,LegacyIdentityAuthority.Stamp(user),["BR"]);
        DbDataReader Read(DbCommand c)
        {
            if(ItemDisplayRecordingSource.Matches(c.CommandText))return display.Read(c);
            if(c.CommandText==SqlLegacyBranchScope.NativeUserText)
            {var t=InboundModel.Table(("U",typeof(string)),("P",typeof(string)),("D",typeof(bool)),("G",typeof(string)),("GD",typeof(bool)),("B",typeof(string)));
             t.Rows.Add(user.Username,user.StoredHash,false,user.GroupId,false,"BR");return t.CreateDataReader();}
            if(c.CommandText==SqlLegacyBranchScope.RestrictedText)
            {var t=InboundModel.Table(("BranchID",typeof(string)));t.Rows.Add("BR");return t.CreateDataReader();}
            Assert.Equal("DOC",c.Parameters["@document"].Value);Assert.Equal(size+1,c.Parameters["@take"].Value);
            var rows=InboundModel.Table(("Doc",typeof(string)),("Date",typeof(DateTime)),("Branch",typeof(string)),("Status",typeof(int)),("Lock",typeof(bool)),
                ("Row",typeof(string)),("Item",typeof(string)),("Q1",typeof(string)),("Q2",typeof(string)),("Q3",typeof(string)),("Q4",typeof(string)),("Name",typeof(string)),("StatusRows",typeof(long)));
            for(var i=0;i<Math.Min(count,size+1);i++)rows.Rows.Add("DOC",new DateTime(2026,10,1),"BR",1,DBNull.Value,$"ROW{i}","ITEM",
                "999999999999999999999999.1234",DBNull.Value,DBNull.Value,DBNull.Value,"Synthetic status",1L);
            return rows.CreateDataReader();
        }
        var service=new SqlDocumentReader(company,()=>new DisplayConnection(Read),(_,_)=>Task.FromResult<LegacyUser?>(user));
        var result=await service.ReadDetailAsync(identity,kind,new("DOC",1,size),default);
        Assert.Equal(DocumentOutcome.Success,result.Outcome);var detail=result.Detail!;
        Assert.Equal(count>size,detail.HasMore);Assert.Equal(Math.Min(size,count),detail.ItemDisplayContext!.Lines.Count);
        Assert.Equal(kind==DocumentKind.PurchaseOrders?"purchase-orders":"inbound-requests",detail.ItemDisplayContext.Kind);
        if(kind==DocumentKind.PurchaseOrders)Assert.All(detail.PurchaseOrderLines,line=>Assert.Equal("999999999999999999999999.1234",line.Quantity));
        else Assert.All(detail.InboundRequestLines,line=>Assert.Equal("999999999999999999999999.1234",line.SetQuantityByDocument));
        Assert.All(detail.ItemDisplayContext.Lines,line=>Assert.Equal(kind==DocumentKind.PurchaseOrders?"current":"persisted",line.ManufacturerItemCode));
        Assert.Equal(size,detail.ItemDisplayContext.PageSize);Assert.Equal(1,detail.ItemDisplayContext.Page);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,"")] [InlineData(DocumentKind.InboundRequests,"")]
    [InlineData(DocumentKind.PurchaseOrders,"bad\0key")] [InlineData(DocumentKind.InboundRequests,"bad\0key")]
    [InlineData(DocumentKind.PurchaseOrders,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    [InlineData(DocumentKind.InboundRequests,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    public async Task Actual_paged_reader_keeps_historical_unqualified_ItemID_and_original_authorized_cardinality(DocumentKind kind,string itemId)
    {
        const int size=20,count=2;
        var display=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
        display.Items.Add(("ITEM","current","Historical disabled item","base unit",true));
        for(var i=0;i<count;i++)display.Stored.Add(("DOC",$"ROW{i}","ITEM","persisted"));
        var user=new LegacyUser("qa-user","Synthetic","synthetic-hash",false,"qa-group",true,
            ["purchase-orders.read","inbound-requests.read"],["BR"]);
        var company=new LegacyCompany("T","C","Synthetic");
        var identity=new AuthoritativeIdentity(user.Username,"T","C","Synthetic","Synthetic",1,
            user.Capabilities!,LegacyIdentityAuthority.Stamp(user),["BR"]);
        DbDataReader Read(DbCommand c)
        {
            if(ItemDisplayRecordingSource.Matches(c.CommandText))return display.Read(c);
            if(c.CommandText==SqlLegacyBranchScope.NativeUserText)
            {var t=InboundModel.Table(("U",typeof(string)),("P",typeof(string)),("D",typeof(bool)),("G",typeof(string)),("GD",typeof(bool)),("B",typeof(string)));
             t.Rows.Add(user.Username,user.StoredHash,false,user.GroupId,false,"BR");return t.CreateDataReader();}
            if(c.CommandText==SqlLegacyBranchScope.RestrictedText)
            {var t=InboundModel.Table(("BranchID",typeof(string)));t.Rows.Add("BR");return t.CreateDataReader();}
            Assert.Equal("DOC",c.Parameters["@document"].Value);Assert.Equal(size+1,c.Parameters["@take"].Value);
            var rows=InboundModel.Table(("Doc",typeof(string)),("Date",typeof(DateTime)),("Branch",typeof(string)),("Status",typeof(int)),("Lock",typeof(bool)),
                ("Row",typeof(string)),("Item",typeof(string)),("Q1",typeof(string)),("Q2",typeof(string)),("Q3",typeof(string)),("Q4",typeof(string)),("Name",typeof(string)),("StatusRows",typeof(long)));
            for(var i=0;i<Math.Min(count,size+1);i++)rows.Rows.Add("DOC",new DateTime(2026,10,1),"BR",1,DBNull.Value,$"ROW{i}",i==0?itemId:"ITEM",
                "999999999999999999999999.1234",DBNull.Value,DBNull.Value,DBNull.Value,"Synthetic status",1L);
            return rows.CreateDataReader();
        }
        var service=new SqlDocumentReader(company,()=>new DisplayConnection(Read),(_,_)=>Task.FromResult<LegacyUser?>(user));
        var result=await service.ReadDetailAsync(identity,kind,new("DOC",1,size),default);
        Assert.Equal(DocumentOutcome.Success,result.Outcome);var detail=result.Detail!;
        Assert.Equal(count>size,detail.HasMore);Assert.Equal(Math.Min(size,count),detail.ItemDisplayContext!.Lines.Count);
        Assert.Equal(kind==DocumentKind.PurchaseOrders?"purchase-orders":"inbound-requests",detail.ItemDisplayContext.Kind);
        if(kind==DocumentKind.PurchaseOrders)Assert.All(detail.PurchaseOrderLines,line=>Assert.Equal("999999999999999999999999.1234",line.Quantity));
        else Assert.All(detail.InboundRequestLines,line=>Assert.Equal("999999999999999999999999.1234",line.SetQuantityByDocument));
        var original=kind==DocumentKind.PurchaseOrders
            ? detail.PurchaseOrderLines.Select(line=>(line.LineId,line.ItemId)).ToArray()
            : detail.InboundRequestLines.Select(line=>(line.LineId,line.ItemId)).ToArray();
        Assert.Equal(2,original.Length);Assert.Equal(("ROW0",itemId),original[0]);Assert.Equal(("ROW1","ITEM"),original[1]);
        Assert.Equal(original,detail.ItemDisplayContext.Lines.Select(line=>(line.LineId,line.ItemId)).ToArray());
        var unknown=detail.ItemDisplayContext.Lines[0];Assert.Equal("unavailable",unknown.ReferenceState);
        Assert.Equal("unavailable",unknown.ManufacturerCodeSource);Assert.Null(unknown.ManufacturerItemCode);Assert.Null(unknown.ItemName);Assert.Null(unknown.Unit);
        Assert.Equal(kind==DocumentKind.PurchaseOrders?"current":"persisted",detail.ItemDisplayContext.Lines[1].ManufacturerItemCode);
        var projection=Assert.Single(display.Commands,c=>c.CommandText.Contains("item-display:rows",StringComparison.Ordinal));
        Assert.Equal(DBNull.Value,projection.Parameters["@item0"].Value);
        Assert.Equal(size,detail.ItemDisplayContext.PageSize);Assert.Equal(1,detail.ItemDisplayContext.Page);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,"")] [InlineData(DocumentKind.InboundRequests,"")]
    [InlineData(DocumentKind.PurchaseOrders,"bad\0key")] [InlineData(DocumentKind.InboundRequests,"bad\0key")]
    [InlineData(DocumentKind.PurchaseOrders,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    [InlineData(DocumentKind.InboundRequests,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    [InlineData(DocumentKind.PurchaseOrders,"SAME")] [InlineData(DocumentKind.InboundRequests,"SAME")]
    [InlineData(DocumentKind.PurchaseOrders,"ROW0")] [InlineData(DocumentKind.InboundRequests,"ROW0")]
    [InlineData(DocumentKind.PurchaseOrders,"unpaired-high")] [InlineData(DocumentKind.InboundRequests,"unpaired-high")]
    [InlineData(DocumentKind.PurchaseOrders,"unpaired-low")] [InlineData(DocumentKind.InboundRequests,"unpaired-low")]
    [InlineData(DocumentKind.PurchaseOrders,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    [InlineData(DocumentKind.InboundRequests,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    public async Task Actual_paged_reader_preserves_original_unsafe_or_duplicate_row_bindings_and_ordinary_controls(DocumentKind kind,string lineIdCase)
    {
        // Attribute strings cross metadata/xUnit transport; construct lone UTF-16 units here.
        var lineId=lineIdCase switch
        {
            "unpaired-high" => new string((char)0xD800,1),
            "unpaired-low" => new string((char)0xDFFF,1),
            _ => lineIdCase
        };
        if(lineIdCase is "unpaired-high" or "unpaired-low")
        {
            Assert.Equal(1,lineId.Length);
            Assert.Equal(lineIdCase=="unpaired-high"?0xD800:0xDFFF,(int)lineId[0]);
            Assert.True(char.IsSurrogate(lineId[0]));
        }
        const int size=20,count=2;
        var display=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
        display.Items.Add(("ITEM","current","Historical disabled item","base unit",true));
        for(var i=0;i<count;i++)display.Stored.Add(("DOC",$"ROW{i}","ITEM","persisted"));
        var user=new LegacyUser("qa-user","Synthetic","synthetic-hash",false,"qa-group",true,
            ["purchase-orders.read","inbound-requests.read"],["BR"]);
        var company=new LegacyCompany("T","C","Synthetic");
        var identity=new AuthoritativeIdentity(user.Username,"T","C","Synthetic","Synthetic",1,
            user.Capabilities!,LegacyIdentityAuthority.Stamp(user),["BR"]);
        DbDataReader Read(DbCommand c)
        {
            if(ItemDisplayRecordingSource.Matches(c.CommandText))return display.Read(c);
            if(c.CommandText==SqlLegacyBranchScope.NativeUserText)
            {var t=InboundModel.Table(("U",typeof(string)),("P",typeof(string)),("D",typeof(bool)),("G",typeof(string)),("GD",typeof(bool)),("B",typeof(string)));
             t.Rows.Add(user.Username,user.StoredHash,false,user.GroupId,false,"BR");return t.CreateDataReader();}
            if(c.CommandText==SqlLegacyBranchScope.RestrictedText)
            {var t=InboundModel.Table(("BranchID",typeof(string)));t.Rows.Add("BR");return t.CreateDataReader();}
            Assert.Equal("DOC",c.Parameters["@document"].Value);Assert.Equal(size+1,c.Parameters["@take"].Value);
            var rows=InboundModel.Table(("Doc",typeof(string)),("Date",typeof(DateTime)),("Branch",typeof(string)),("Status",typeof(int)),("Lock",typeof(bool)),
                ("Row",typeof(string)),("Item",typeof(string)),("Q1",typeof(string)),("Q2",typeof(string)),("Q3",typeof(string)),("Q4",typeof(string)),("Name",typeof(string)),("StatusRows",typeof(long)));
            for(var i=0;i<Math.Min(count,size+1);i++)rows.Rows.Add("DOC",new DateTime(2026,10,1),"BR",1,DBNull.Value,i==0?lineId:lineId=="SAME"?"SAME":$"ROW{i}","ITEM",
                "999999999999999999999999.1234",DBNull.Value,DBNull.Value,DBNull.Value,"Synthetic status",1L);
            return rows.CreateDataReader();
        }
        var service=new SqlDocumentReader(company,()=>new DisplayConnection(Read),(_,_)=>Task.FromResult<LegacyUser?>(user));
        var result=await service.ReadDetailAsync(identity,kind,new("DOC",1,size),default);
        Assert.Equal(DocumentOutcome.Success,result.Outcome);var detail=result.Detail!;
        Assert.Equal(count>size,detail.HasMore);Assert.Equal(size,detail.PageSize);Assert.Equal(1,detail.Page);
        var original=kind==DocumentKind.PurchaseOrders
            ? detail.PurchaseOrderLines.Select(line=>(line.LineId,line.ItemId)).ToArray()
            : detail.InboundRequestLines.Select(line=>(line.LineId,line.ItemId)).ToArray();
        Assert.Equal(2,original.Length);Assert.Equal((lineId,"ITEM"),original[0]);
        Assert.Equal((lineId=="SAME"?"SAME":"ROW1","ITEM"),original[1]);
        if(kind==DocumentKind.PurchaseOrders)Assert.All(detail.PurchaseOrderLines,line=>Assert.Equal("999999999999999999999999.1234",line.Quantity));
        else Assert.All(detail.InboundRequestLines,line=>Assert.Equal("999999999999999999999999.1234",line.SetQuantityByDocument));
        if(lineId=="ROW0")
        {Assert.Equal(2,detail.ItemDisplayContext!.Lines.Count);Assert.Equal("available",detail.ItemDisplayContext.Lines[0].ReferenceState);}
        else {Assert.Null(detail.ItemDisplayContext);Assert.Empty(display.Commands);}

    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders)] [InlineData(DocumentKind.InboundRequests)]
    public void Both_document_shapes_keep_explicit_exact_branch_scope_and_native_rights(DocumentKind kind)
    {
        foreach (var sql in new[] { SqlDocumentReader.ListSql(kind, 2), SqlDocumentReader.DetailSql(kind, 2) })
        {
            Assert.Contains("DATALENGTH(@branch0)", sql);
            Assert.Contains("DATALENGTH(@branch1)", sql);
            Assert.Contains("CONVERT(varbinary(max),CONVERT(nvarchar(max),D.BranchID))", sql);
            Assert.Contains("U.BranchID IS NULL OR DATALENGTH(U.BranchID)=0", sql);
            Assert.Contains("U.[Disable]=0 AND G.IsDisable=0", sql);
            Assert.Contains("@storedHash", sql);
            Assert.Contains("M.MenuID=@menu AND M.FormName=@form", sql);
            Assert.Contains("M.isDisable=0", sql);
            Assert.Contains("@skip", sql); Assert.Contains("@take", sql);
            Assert.DoesNotContain("BranchID IN", sql);
            Assert.DoesNotContain("LTRIM", sql);
            Assert.DoesNotContain("RTRIM", sql);
        }
        Assert.Contains("D.DocumentID=@document", SqlDocumentReader.DetailSql(kind, 2));
        Assert.Contains("C.DocumentID=D.DocumentID", SqlDocumentReader.DetailSql(kind, 2));
    }

    [Theory]
    [InlineData(0)] [InlineData(201)]
    public void Empty_or_overflow_derived_scope_cannot_build_document_sql(int count)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SqlDocumentReader.ListSql(DocumentKind.PurchaseOrders, count));
        Assert.Throws<ArgumentOutOfRangeException>(() => SqlDocumentReader.DetailSql(DocumentKind.InboundRequests, count));
    }
}
