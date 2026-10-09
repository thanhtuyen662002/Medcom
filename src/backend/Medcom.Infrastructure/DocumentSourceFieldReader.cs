using System.Data.Common;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

// Fixed source-reviewed projections, never identifiers or field lists from an HTTP request.
internal static class DocumentSourceFieldReader
{
    internal const string PurchaseOrderHeaderFieldsProjection = "D.[DocumentID] AS H0,CONVERT(varchar(23),D.[DocumentDate],126) AS H1,D.[ObjectID] AS H2,D.[Memo] AS H3,D.[Notes] AS H4,CONVERT(varchar(23),D.[DeliverDate],126) AS H5,D.[CurrencyID] AS H6,D.[RateExchange] AS H7,CONVERT(varchar(64),D.[BaseTotal]) AS H8,D.[SearchField] AS H9,D.[isLock] AS H10,D.[UserCreate] AS H11,D.[UserUpdate] AS H12,CONVERT(varchar(23),D.[DateUpdate],126) AS H13,CONVERT(varchar(23),D.[DateCreate],126) AS H14,D.[LinkID] AS H15,D.[ContractID] AS H16,D.[StatusID] AS H17,D.[BranchID] AS H18";
    internal static PurchaseOrderHeaderFields ReadPurchaseOrderHeaderFields(DbDataReader reader,int start) => new(
        RequiredText(reader,start+0),
        RequiredDate(reader,start+1),
        RequiredText(reader,start+2),
        Text(reader,start+3),
        Text(reader,start+4),
        Date(reader,start+5),
        RequiredText(reader,start+6),
        RequiredFloat(reader,start+7),
        Text(reader,start+8),
        Text(reader,start+9),
        RequiredBoolean(reader,start+10),
        Text(reader,start+11),
        Text(reader,start+12),
        Date(reader,start+13),
        Date(reader,start+14),
        Text(reader,start+15),
        Text(reader,start+16),
        Integer(reader,start+17),
        RequiredText(reader,start+18));
    internal const string PurchaseOrderLineFieldsProjection = "C.[UserAutoID] AS F0,C.[DocumentID] AS F1,C.[ItemID] AS F2,CONVERT(varchar(64),C.[Quantity]) AS F3,CONVERT(varchar(64),C.[UnitPrice]) AS F4,CONVERT(varchar(64),C.[SourceAmount]) AS F5,CONVERT(varchar(64),C.[Amount]) AS F6,C.[Notes] AS F7,CONVERT(varchar(64),C.[Quantity2]) AS F8,C.[Property] AS F9,C.[Property2] AS F10,C.[ParentID] AS F11";
    internal static PurchaseOrderLineFields ReadPurchaseOrderLineFields(DbDataReader reader,int start) => new(
        RequiredText(reader,start+0),
        RequiredText(reader,start+1),
        RequiredText(reader,start+2),
        Text(reader,start+3),
        Text(reader,start+4),
        Text(reader,start+5),
        Text(reader,start+6),
        Text(reader,start+7),
        Text(reader,start+8),
        Text(reader,start+9),
        Text(reader,start+10),
        Text(reader,start+11));
    internal const string InboundRequestHeaderFieldsProjection = "D.[DocumentID] AS H0,CONVERT(varchar(23),D.[DocumentDate],126) AS H1,D.[OrderNumber] AS H2,D.[BranchID] AS H3,D.[InvoiceNo] AS H4,D.[DeclarationNumber] AS H5,D.[DeparturePoint] AS H6,D.[DestinationPoint] AS H7,D.[IsRain] AS H8,D.[OrderTypeID] AS H9,D.[ObjectID] AS H10,CONVERT(varchar(64),D.[TotalPalletQuantityByDocument]) AS H11,CONVERT(varchar(64),D.[TotalBarrelQuantityByDocument]) AS H12,CONVERT(varchar(64),D.[TotalPalletQuantityByReal]) AS H13,CONVERT(varchar(64),D.[TotalBarrelQuantityByReal]) AS H14,CONVERT(varchar(64),D.[ExcessPackageQuantity]) AS H15,CONVERT(varchar(64),D.[LackOfPackageQuantity]) AS H16,CONVERT(varchar(64),D.[DamagedPackageQuantity]) AS H17,D.[PackageTypeID] AS H18,D.[IsDamageOutsidePackage] AS H19,D.[DamageDescription] AS H20,D.[DamageInsideStatusID] AS H21,D.[LocationDamageDetectedID] AS H22,D.[LocationDamageDescription] AS H23,D.[ResultDesciption] AS H24,CONVERT(varchar(64),D.[TotalQuantityInboundResult]) AS H25,CONVERT(varchar(64),D.[GoodAwaitingInboundResult]) AS H26,D.[ResultNote] AS H27,CONVERT(varchar(23),D.[DatetimeRecorded],126) AS H28,D.[StatusID] AS H29,D.[CurrencyID] AS H30,CONVERT(varchar(64),D.[RateExchange]) AS H31,D.[ImageURL] AS H32,D.[BBKCUrl] AS H33,D.[Notes] AS H34,D.[SendTo] AS H35,D.[QRPrintType] AS H36";
    internal static InboundRequestHeaderFields ReadInboundRequestHeaderFields(DbDataReader reader,int start) => new(
        RequiredText(reader,start+0),
        RequiredDate(reader,start+1),
        RequiredText(reader,start+2),
        Text(reader,start+3),
        RequiredText(reader,start+4),
        Text(reader,start+5),
        RequiredText(reader,start+6),
        RequiredText(reader,start+7),
        Boolean(reader,start+8),
        RequiredText(reader,start+9),
        Text(reader,start+10),
        Text(reader,start+11),
        Text(reader,start+12),
        Text(reader,start+13),
        Text(reader,start+14),
        Text(reader,start+15),
        Text(reader,start+16),
        Text(reader,start+17),
        Text(reader,start+18),
        Boolean(reader,start+19),
        Text(reader,start+20),
        Text(reader,start+21),
        Text(reader,start+22),
        Text(reader,start+23),
        Text(reader,start+24),
        Text(reader,start+25),
        Text(reader,start+26),
        Text(reader,start+27),
        Date(reader,start+28),
        RequiredInteger(reader,start+29),
        Text(reader,start+30),
        Text(reader,start+31),
        Text(reader,start+32),
        Text(reader,start+33),
        Text(reader,start+34),
        Text(reader,start+35),
        RequiredText(reader,start+36));
    internal const string InboundRequestLineFieldsProjection = "C.[UserAutoID] AS F0,C.[DocumentID] AS F1,C.[ContractID] AS F2,C.[ItemID] AS F3,C.[HangSX] AS F4,C.[UnitFactor] AS F5,C.[Unit2] AS F6,C.[Additional] AS F7,C.[LotNumberByDocument] AS F8,CONVERT(varchar(64),C.[SetQuantityByDocument]) AS F9,CONVERT(varchar(64),C.[BarrelQuantityByDocument]) AS F10,CONVERT(varchar(23),C.[ExpireDateByDocument],126) AS F11,C.[LotNumberByReal] AS F12,CONVERT(varchar(64),C.[SetQuantityByReal]) AS F13,CONVERT(varchar(64),C.[BarrelQuantityByReal]) AS F14,CONVERT(varchar(23),C.[ExpireDateByReal],126) AS F15,CONVERT(varchar(64),C.[SourceAmount]) AS F16,CONVERT(varchar(64),C.[UnitPrice]) AS F17,CONVERT(varchar(64),C.[Amount]) AS F18,CONVERT(varchar(64),C.[RandomTestQuantity]) AS F19,C.[TestStatus] AS F20,C.[NoPalletNote] AS F21,C.[PalletNote] AS F22,C.[CheckerNote] AS F23,C.[ItemCode] AS F24";
    internal static InboundRequestLineFields ReadInboundRequestLineFields(DbDataReader reader,int start) => new(
        RequiredText(reader,start+0),
        RequiredText(reader,start+1),
        Text(reader,start+2),
        RequiredText(reader,start+3),
        Text(reader,start+4),
        Float(reader,start+5),
        Text(reader,start+6),
        Boolean(reader,start+7),
        Text(reader,start+8),
        Text(reader,start+9),
        Text(reader,start+10),
        Date(reader,start+11),
        Text(reader,start+12),
        Text(reader,start+13),
        Text(reader,start+14),
        Date(reader,start+15),
        Text(reader,start+16),
        Text(reader,start+17),
        Text(reader,start+18),
        Text(reader,start+19),
        Text(reader,start+20),
        Text(reader,start+21),
        Text(reader,start+22),
        Text(reader,start+23),
        Text(reader,start+24));
    // SQL style 126 omits the fractional component when milliseconds are zero.
    // Normalize only its two documented SQL datetime shapes, without timezone inference.
    private static readonly string[] DateFormats=["yyyy-MM-dd'T'HH:mm:ss","yyyy-MM-dd'T'HH:mm:ss.fff"];
    private static string RequiredDate(DbDataReader r,int i) => Date(r,i)??throw new InvalidOperationException("Missing source field.");
    private static string? Date(DbDataReader r,int i)
    {
        if(r.IsDBNull(i))return null;
        return DateTime.TryParseExact(r.GetString(i),DateFormats,System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None,out var value)
            ? value.ToString("yyyy-MM-ddTHH:mm:ss.fff",System.Globalization.CultureInfo.InvariantCulture)
            : throw new InvalidOperationException("Invalid source date.");
    }
    private static string RequiredText(DbDataReader r,int i) => Text(r,i)??throw new InvalidOperationException("Missing source field.");
    private static bool RequiredBoolean(DbDataReader r,int i) => Boolean(r,i)??throw new InvalidOperationException("Missing source field.");
    private static int RequiredInteger(DbDataReader r,int i) => Integer(r,i)??throw new InvalidOperationException("Missing source field.");
    private static double RequiredFloat(DbDataReader r,int i) => Float(r,i)??throw new InvalidOperationException("Missing source field.");
    private static string? Text(DbDataReader r,int i) => r.IsDBNull(i)?null:r.GetString(i);
    private static bool? Boolean(DbDataReader r,int i) => r.IsDBNull(i)?null:r.GetBoolean(i);
    private static int? Integer(DbDataReader r,int i) => r.IsDBNull(i)?null:r.GetInt32(i);
    private static double? Float(DbDataReader r,int i)
    {
        if(r.IsDBNull(i))return null;
        var value=r.GetDouble(i);
        return double.IsFinite(value)?value:throw new InvalidOperationException("Invalid source number.");
    }
}
