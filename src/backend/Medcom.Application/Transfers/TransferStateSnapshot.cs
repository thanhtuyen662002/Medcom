using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Medcom.Application.Transfers;

// Technical state only. Passwords, credential stamps and free-text notes are not state-token inputs.
public sealed record TransferRequestHeadState(string DocumentKey, string BranchId,
    string FromBranchId, string ToBranchId, string SalesUser, string? AssignedPm,
    int Status, bool IsLocked, DateTime? UpdatedAt);

public sealed record TransferRequestDetailState(string DetailId, string DocumentKey,
    string ItemId, decimal RequestedQuantity, decimal? ApprovedQuantity);

public sealed class TransferStateSnapshot
{
    public const int MaximumDetails = 1000;
    private const decimal MaximumQuantity = 999999999999999999999999.9999m;

    private TransferStateSnapshot(string tenantId, string companyId, TransferRequestHeadState head,
        TransferRequestDetailState[] details)
    {
        TenantId = tenantId;
        CompanyId = companyId;
        Head = head;
        Details = Array.AsReadOnly(details);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        TransferFingerprintFields.Append(hash, "Medcom.PmReturn.StateEquality.v1");
        foreach (var value in new[] { tenantId, companyId, head.DocumentKey, head.BranchId,
            head.FromBranchId, head.ToBranchId, head.SalesUser, head.AssignedPm })
            TransferFingerprintFields.Append(hash, value);
        TransferFingerprintFields.Append(hash, head.Status.ToString(CultureInfo.InvariantCulture));
        TransferFingerprintFields.Append(hash, head.IsLocked ? "1" : "0");
        // SQL datetime has no time-zone offset. Preserve its ticks; do not invent UTC conversion.
        TransferFingerprintFields.Append(hash, head.UpdatedAt?.Ticks.ToString(CultureInfo.InvariantCulture));
        TransferFingerprintFields.Append(hash, details.Length.ToString(CultureInfo.InvariantCulture));
        foreach (var line in details)
        {
            TransferFingerprintFields.Append(hash, line.DetailId);
            TransferFingerprintFields.Append(hash, line.DocumentKey);
            TransferFingerprintFields.Append(hash, line.ItemId);
            TransferFingerprintFields.Append(hash, line.RequestedQuantity.ToString("G29", CultureInfo.InvariantCulture));
            TransferFingerprintFields.Append(hash, line.ApprovedQuantity?.ToString("G29", CultureInfo.InvariantCulture));
        }
        StateEqualityToken = "pmr-state-v1:" + Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
    }

    public string TenantId { get; }
    public string CompanyId { get; }
    public TransferRequestHeadState Head { get; }
    public IReadOnlyList<TransferRequestDetailState> Details { get; }
    // Equality of selected technical fields only; neither a monotonic version nor ABA/stale-UI proof.
    public string StateEqualityToken { get; }

    public static bool TryCreate(string? tenantId, string? companyId, TransferRequestHeadState? head,
        IEnumerable<TransferRequestDetailState>? details, out TransferStateSnapshot? snapshot)
    {
        snapshot = null;
        if (!ValidIdentifier(tenantId, 100) || !ValidIdentifier(companyId, 100) || head is null || details is null
            || !LosslessAnsiValue.TryCreate(head.DocumentKey, 30, out _)
            || !LosslessAnsiValue.TryCreate(head.BranchId, 50, out _)
            || !LosslessAnsiValue.TryCreate(head.FromBranchId, 50, out _)
            || !LosslessAnsiValue.TryCreate(head.ToBranchId, 50, out _)
            || !LosslessAnsiValue.TryCreate(head.SalesUser, 100, out _)
            || (head.AssignedPm is not null && !LosslessAnsiValue.TryCreate(head.AssignedPm, 100, out _))
            || head.UpdatedAt is { Year: < 1753 }) return false;

        var copy = new List<TransferRequestDetailState>();
        var identifiers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            foreach (var line in details)
            {
                if (copy.Count >= MaximumDetails || line is null || !ValidIdentifier(line.DetailId, 50)
                    || !ValidIdentifier(line.ItemId, 50) || line.DocumentKey != head.DocumentKey
                    || !identifiers.Add(line.DetailId) || !RepresentableQuantity(line.RequestedQuantity)
                    || (line.ApprovedQuantity is decimal approved && !RepresentableQuantity(approved))) return false;
                copy.Add(line with { });
            }
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            return false;
        }
        snapshot = new(tenantId!, companyId!, head with { },
            copy.OrderBy(line => line.DetailId, StringComparer.Ordinal).ToArray());
        return true;
    }

    internal static bool ValidIdentifier(string? value, int maximumLength) =>
        value is { Length: > 0 } && value.Length <= maximumLength && value == value.Trim()
        && ValidUnicode(value) && value.IsNormalized(NormalizationForm.FormC)
        && !value.EnumerateRunes().Any(rune => Rune.GetUnicodeCategory(rune) is
            UnicodeCategory.Control or UnicodeCategory.Format);

    internal static bool ValidUnicode(string value)
    {
        for (var index = 0; index < value.Length; index++)
        {
            if (char.IsHighSurrogate(value[index]))
            {
                if (++index == value.Length || !char.IsLowSurrogate(value[index])) return false;
            }
            else if (char.IsLowSurrogate(value[index])) return false;
        }
        return true;
    }

    private static bool RepresentableQuantity(decimal value) =>
        value is >= -MaximumQuantity and <= MaximumQuantity && decimal.Round(value, 4) == value;
}

internal static class TransferFingerprintFields
{
    internal static void Append(IncrementalHash hash, string? value)
    {
        Span<byte> length = stackalloc byte[4];
        if (value is null)
        {
            BinaryPrimitives.WriteInt32LittleEndian(length, -1);
            hash.AppendData(length);
            return;
        }
        var bytes = Encoding.UTF8.GetBytes(value);
        BinaryPrimitives.WriteInt32LittleEndian(length, bytes.Length);
        hash.AppendData(length);
        hash.AppendData(bytes);
    }
}
