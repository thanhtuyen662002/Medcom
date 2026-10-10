using System.Data;
using System.Globalization;
using Medcom.Application;

namespace Medcom.Api.Tests;

// Recording-fixture extension for the additional source columns. Existing custody/branch/item assertions remain intact.
internal static class FullDocumentRows
{
    internal static DataTable Complete(DataTable table,DocumentKind kind,bool detail,bool nulls=false)
    {
        var header=kind==DocumentKind.PurchaseOrders?OrderHeader:InboundHeader;
        var lines=kind==DocumentKind.PurchaseOrders?OrderLine:InboundLine;
        var start=table.Columns.Count;
        foreach(var c in header)table.Columns.Add("H"+Array.IndexOf(header,c),c.Type);
        if(detail)foreach(var c in lines)table.Columns.Add("F"+Array.IndexOf(lines,c),c.Type);
        foreach(DataRow row in table.Rows)
        {
            for(var i=0;i<header.Length;i++)row[start+i]=Value(header[i],row,false,nulls);
            if(detail)for(var i=0;i<lines.Length;i++)row[start+header.Length+i]=row.IsNull(5)?DBNull.Value:Value(lines[i],row,true,nulls);
        }
        return table;
    }
    private static object Value((string Name,Type Type,bool Nullable,string SqlType) c,DataRow row,bool line,bool nulls)
    {
        if(nulls&&c.Nullable)return DBNull.Value;
        if(c.Name=="DocumentID")return row[0];
        if(c.Name=="BranchID")return row[2];
        if(c.Name=="StatusID")return row[3];
        if(c.Name=="UserAutoID")return row[5];
        if(c.Name=="ItemID")return row[6];
        if(c.Name=="isLock")return row.IsNull(4)?false:row[4];
        if(c.SqlType=="datetime")return ((DateTime)row[1]).AddHours(12).AddMinutes(34).AddSeconds(56).AddMilliseconds(997).ToString("yyyy-MM-ddTHH:mm:ss.fff",CultureInfo.InvariantCulture);
        if(c.SqlType.StartsWith("decimal",StringComparison.Ordinal))return c.Name is "Quantity" or "SetQuantityByDocument"?row[7]:c.SqlType switch
        {
            "decimal(28, 0)"=>"1234567890123456789012345678",
            "decimal(28, 2)"=>"12345678901234567890123456.78",
            "decimal(28, 4)"=>"123456789012345678901234.1234",
            "decimal(28, 10)"=>"123456789012345678.1234567890",
            "decimal(18, 2)"=>"1234567890123456.78",
            _=>"123456789012345678"
        };
        if(c.Type==typeof(double))return 0.125d;
        if(c.Type==typeof(bool))return false;
        if(c.Type==typeof(int))return 1;
        return "Giá trị "+c.Name+" ' % _ ~ [ 保留";
    }
    internal static readonly (string Name,Type Type,bool Nullable,string SqlType)[] OrderHeader = [
        ("DocumentID",typeof(string),false,"varchar"),
        ("DocumentDate",typeof(string),false,"datetime"),
        ("ObjectID",typeof(string),false,"varchar"),
        ("Memo",typeof(string),true,"nvarchar"),
        ("Notes",typeof(string),true,"nvarchar"),
        ("DeliverDate",typeof(string),true,"datetime"),
        ("CurrencyID",typeof(string),false,"varchar"),
        ("RateExchange",typeof(double),false,"float"),
        ("BaseTotal",typeof(string),true,"decimal(28, 0)"),
        ("SearchField",typeof(string),true,"nvarchar"),
        ("isLock",typeof(bool),false,"bit"),
        ("UserCreate",typeof(string),true,"varchar"),
        ("UserUpdate",typeof(string),true,"varchar"),
        ("DateUpdate",typeof(string),true,"datetime"),
        ("DateCreate",typeof(string),true,"datetime"),
        ("LinkID",typeof(string),true,"varchar"),
        ("ContractID",typeof(string),true,"nvarchar"),
        ("StatusID",typeof(int),true,"int"),
        ("BranchID",typeof(string),false,"varchar")];
    internal static readonly (string Name,Type Type,bool Nullable,string SqlType)[] InboundHeader = [
        ("DocumentID",typeof(string),false,"varchar"),
        ("DocumentDate",typeof(string),false,"datetime"),
        ("OrderNumber",typeof(string),false,"nvarchar"),
        ("BranchID",typeof(string),true,"varchar"),
        ("InvoiceNo",typeof(string),false,"nvarchar"),
        ("DeclarationNumber",typeof(string),true,"varchar"),
        ("DeparturePoint",typeof(string),false,"nvarchar"),
        ("DestinationPoint",typeof(string),false,"nvarchar"),
        ("IsRain",typeof(bool),true,"bit"),
        ("OrderTypeID",typeof(string),false,"nvarchar"),
        ("ObjectID",typeof(string),true,"varchar"),
        ("TotalPalletQuantityByDocument",typeof(string),true,"decimal(18, 0)"),
        ("TotalBarrelQuantityByDocument",typeof(string),true,"decimal(18, 0)"),
        ("TotalPalletQuantityByReal",typeof(string),true,"decimal(18, 0)"),
        ("TotalBarrelQuantityByReal",typeof(string),true,"decimal(18, 0)"),
        ("ExcessPackageQuantity",typeof(string),true,"decimal(18, 0)"),
        ("LackOfPackageQuantity",typeof(string),true,"decimal(18, 0)"),
        ("DamagedPackageQuantity",typeof(string),true,"decimal(18, 0)"),
        ("PackageTypeID",typeof(string),true,"nvarchar"),
        ("IsDamageOutsidePackage",typeof(bool),true,"bit"),
        ("DamageDescription",typeof(string),true,"nvarchar"),
        ("DamageInsideStatusID",typeof(string),true,"nvarchar"),
        ("LocationDamageDetectedID",typeof(string),true,"nvarchar"),
        ("LocationDamageDescription",typeof(string),true,"nvarchar"),
        ("ResultDesciption",typeof(string),true,"nvarchar"),
        ("TotalQuantityInboundResult",typeof(string),true,"decimal(18, 0)"),
        ("GoodAwaitingInboundResult",typeof(string),true,"decimal(18, 0)"),
        ("ResultNote",typeof(string),true,"nvarchar"),
        ("DatetimeRecorded",typeof(string),true,"datetime"),
        ("StatusID",typeof(int),false,"int"),
        ("CurrencyID",typeof(string),true,"varchar"),
        ("RateExchange",typeof(string),true,"decimal(28, 10)"),
        ("ImageURL",typeof(string),true,"varchar"),
        ("BBKCUrl",typeof(string),true,"varchar"),
        ("Notes",typeof(string),true,"nvarchar"),
        ("SendTo",typeof(string),true,"nvarchar"),
        ("QRPrintType",typeof(string),false,"varchar"),
        ("LinkID",typeof(string),true,"varchar")];
    internal static readonly (string Name,Type Type,bool Nullable,string SqlType)[] OrderLine = [
        ("UserAutoID",typeof(string),false,"varchar"),
        ("DocumentID",typeof(string),false,"varchar"),
        ("ItemID",typeof(string),false,"nvarchar"),
        ("Quantity",typeof(string),true,"decimal(28, 2)"),
        ("UnitPrice",typeof(string),true,"decimal(28, 4)"),
        ("SourceAmount",typeof(string),true,"decimal(18, 2)"),
        ("Amount",typeof(string),true,"decimal(28, 0)"),
        ("Notes",typeof(string),true,"nvarchar"),
        ("Quantity2",typeof(string),true,"decimal(28, 4)"),
        ("Property",typeof(string),true,"nvarchar"),
        ("Property2",typeof(string),true,"nvarchar"),
        ("ParentID",typeof(string),true,"varchar")];
    internal static readonly (string Name,Type Type,bool Nullable,string SqlType)[] InboundLine = [
        ("UserAutoID",typeof(string),false,"varchar"),
        ("DocumentID",typeof(string),false,"varchar"),
        ("ContractID",typeof(string),true,"nvarchar"),
        ("ItemID",typeof(string),false,"varchar"),
        ("HangSX",typeof(string),true,"nvarchar"),
        ("UnitFactor",typeof(double),true,"float"),
        ("Unit2",typeof(string),true,"nvarchar"),
        ("Additional",typeof(bool),true,"bit"),
        ("LotNumberByDocument",typeof(string),true,"nvarchar"),
        ("SetQuantityByDocument",typeof(string),true,"decimal(18, 0)"),
        ("BarrelQuantityByDocument",typeof(string),true,"decimal(18, 0)"),
        ("ExpireDateByDocument",typeof(string),true,"datetime"),
        ("LotNumberByReal",typeof(string),true,"nvarchar"),
        ("SetQuantityByReal",typeof(string),true,"decimal(18, 0)"),
        ("BarrelQuantityByReal",typeof(string),true,"decimal(18, 0)"),
        ("ExpireDateByReal",typeof(string),true,"datetime"),
        ("SourceAmount",typeof(string),true,"decimal(18, 0)"),
        ("UnitPrice",typeof(string),true,"decimal(18, 0)"),
        ("Amount",typeof(string),true,"decimal(18, 0)"),
        ("RandomTestQuantity",typeof(string),true,"decimal(18, 0)"),
        ("TestStatus",typeof(string),true,"nvarchar"),
        ("NoPalletNote",typeof(string),true,"nvarchar"),
        ("PalletNote",typeof(string),true,"nvarchar"),
        ("CheckerNote",typeof(string),true,"nvarchar"),
        ("ItemCode",typeof(string),true,"nvarchar"),
        ("ParentID",typeof(string),true,"varchar")];
}
