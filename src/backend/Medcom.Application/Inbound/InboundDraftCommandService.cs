using System.Data.SqlTypes;
using Medcom.Contracts.Inbound;

namespace Medcom.Application.Inbound;

public interface IInboundDraftCommandService
{
    Task<InboundDraftResult> ExecuteAsync(InboundDraftCommand request, CancellationToken token = default);
    Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest, CancellationToken token = default);
    Task<InboundDraftReadResult> ReadAsync(string documentId, CancellationToken token = default);
}

public static class InboundDraftValidation
{
    public const string MenuId = "07011";
    public const string FormId = "IV_InboundRequestFrm";
    public const int MaximumDetails = 500;

    public static InboundDraftOutcome? Check(InboundDraftCommand? request)
    {
        if (request is null || request.OperationId == Guid.Empty || !Enum.IsDefined(request.Action))
            return InboundDraftOutcome.InvalidInput;
        if (request.CostChanges is { Count: > 0 }) return InboundDraftOutcome.UnsupportedCostEdits;
        if (!Text(request.Note, 200)) return InboundDraftOutcome.InvalidInput;
        if (request.Action == InboundDraftAction.Create)
        {
            if (request.DocumentId is not null || request.ExpectedStateEqualityToken is not null)
                return InboundDraftOutcome.InvalidInput;
        }
        else if (!Ansi(request.DocumentId, 50) || !StateToken(request.ExpectedStateEqualityToken))
            return InboundDraftOutcome.InvalidInput;
        if (request.Action == InboundDraftAction.SendToWarehouse)
            return request.Header is not null || request.DetailUpserts is { Count: > 0 }
                || request.RemovedDetailIds is { Count: > 0 } ? InboundDraftOutcome.InvalidInput : null;
        if (request.Note is not null || request.Header is not { } h || !Header(h))
            return InboundDraftOutcome.InvalidInput;
        var upserts = request.DetailUpserts ?? [];
        var removed = request.RemovedDetailIds ?? [];
        if (upserts.Count > MaximumDetails || removed.Count > MaximumDetails
            || request.Action == InboundDraftAction.Create && removed.Count != 0)
            return InboundDraftOutcome.InvalidInput;
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var clients = new HashSet<Guid>();
        foreach (var row in upserts)
        {
            if (row is null || !Ansi(row.ItemId, 50) || !Text(row.LotNumberByDocument, 50)
                || !Number(row.SetQuantityByDocument, 18, 0) || !Number(row.BarrelQuantityByDocument, 18, 0)
                || !Date(row.ExpireDateByDocument) || !Number(row.UnitPrice, 18, 0))
                return InboundDraftOutcome.InvalidInput;
            if (row.RowId is null)
            {
                if (row.ClientLineId is null || row.ClientLineId == Guid.Empty || !clients.Add(row.ClientLineId.Value))
                    return InboundDraftOutcome.InvalidInput;
            }
            else if (request.Action == InboundDraftAction.Create || row.ClientLineId is not null
                || !Ansi(row.RowId, 50) || !keys.Add(row.RowId)) return InboundDraftOutcome.InvalidInput;
        }
        foreach (var id in removed)
            if (!Ansi(id, 50) || !keys.Add(id)) return InboundDraftOutcome.InvalidInput;
        return null;
    }

    public static bool Header(InboundDraftHeader h) => Date(h.DocumentDate)
        && Text(h.OrderNumber, 50, true) && Text(h.InvoiceNo, 50, true)
        && Text(h.DeparturePoint, 100, true) && Text(h.DestinationPoint, 100, true)
        && Text(h.OrderTypeId, 50, true) && Ansi(h.BranchId, 50)
        && (h.ObjectId is null || Ansi(h.ObjectId, 50))
        && (h.CurrencyId is null || Ansi(h.CurrencyId, 3))
        && Number(h.RateExchange, 28, 10) && Text(h.Notes, 500);

    // Conservative lossless varchar profile, shared with the existing fixed command boundary.
    public static bool Ansi(string? value, int width) => !string.IsNullOrWhiteSpace(value)
        && value.Length <= width && value.All(c => c is >= ' ' and <= '~');
    public static bool StateToken(string? value) => value is { Length: 64 }
        && value.All(c => c is >= '0' and <= '9' or >= 'A' and <= 'F');
    public static bool Text(string? value, int width, bool required = false)
    {
        if (value is null) return !required;
        if (value.Length > width || value.Contains('\0')) return false;
        for (var i = 0; i < value.Length; i++)
            if (char.IsSurrogate(value[i]))
            {
                if (!char.IsHighSurrogate(value[i]) || ++i == value.Length || !char.IsLowSurrogate(value[i])) return false;
            }
        return true;
    }
    public static bool Number(decimal? value, int precision, int scale)
    {
        if (value is null) return true;
        decimal limit = 1;
        for (var i = 0; i < precision - scale; i++) limit *= 10;
        return value > -limit && value < limit && decimal.Round(value.Value, scale) == value;
    }
    public static bool Date(DateTime? value)
    {
        if (value is null) return true;
        try { return new SqlDateTime(value.Value).Value.Ticks == value.Value.Ticks; }
        catch (SqlTypeException) { return false; }
    }
}
