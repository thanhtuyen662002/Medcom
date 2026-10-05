using System.Globalization;
using Medcom.Application.Transfers;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class TransferStateSnapshotTests
{
    [Fact]
    public void Caller_mutation_cannot_change_snapshot_or_exposed_lines()
    {
        var input = I06Fixtures.Lines;
        var state = I06Fixtures.State(lines: input);
        var token = state.StateEqualityToken;
        input[0] = input[0] with { RequestedQuantity = 900m };
        Assert.Equal(5m, state.Details[0].RequestedQuantity);
        Assert.Equal(token, state.StateEqualityToken);
        var exposed = Assert.IsAssignableFrom<IList<TransferRequestDetailState>>(state.Details);
        Assert.True(exposed.IsReadOnly);
        Assert.Throws<NotSupportedException>(() => exposed[0] = input[0]);
    }

    [Fact]
    public void Ordering_decimal_trailing_zero_and_culture_do_not_change_equality()
    {
        var first = I06Fixtures.State();
        var oldCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            var lines = I06Fixtures.Lines.Reverse().Select(line => line with
                { RequestedQuantity = line.DetailId == "D1" ? 5.0000m : line.RequestedQuantity });
            Assert.Equal(first.StateEqualityToken, I06Fixtures.State(lines: lines).StateEqualityToken);
        }
        finally { CultureInfo.CurrentCulture = oldCulture; }
    }

    [Theory]
    [InlineData("status")]
    [InlineData("assignment")]
    [InlineData("branch")]
    [InlineData("lock")]
    [InlineData("date")]
    [InlineData("detail-qty")]
    [InlineData("detail-item")]
    [InlineData("null-to-zero")]
    [InlineData("detail-add")]
    public void Selected_state_change_is_visible_in_token(string change)
    {
        var head = I06Fixtures.Head;
        var lines = I06Fixtures.Lines.ToList();
        switch (change)
        {
            case "status": head = head with { Status = 30 }; break;
            case "assignment": head = head with { AssignedPm = "other.pm" }; break;
            case "branch": head = head with { BranchId = "OTHER" }; break;
            case "lock": head = head with { IsLocked = true }; break;
            case "date": head = head with { UpdatedAt = null }; break;
            case "detail-qty": lines[0] = lines[0] with { RequestedQuantity = 6m }; break;
            case "detail-item": lines[0] = lines[0] with { ItemId = "OTHER" }; break;
            case "null-to-zero": lines[1] = lines[1] with { ApprovedQuantity = 0m }; break;
            default: lines.Add(new("D3", "REQ-1", "ITEM-3", 1m, null)); break;
        }
        Assert.NotEqual(I06Fixtures.State().StateEqualityToken, I06Fixtures.State(head, lines).StateEqualityToken);
    }

    [Fact]
    public void State_token_is_scoped_and_does_not_claim_monotonic_history()
    {
        Assert.True(TransferStateSnapshot.TryCreate("other", "company", I06Fixtures.Head, I06Fixtures.Lines, out var other));
        Assert.NotEqual(I06Fixtures.State().StateEqualityToken, other!.StateEqualityToken);
        var before = I06Fixtures.State();
        var changed = I06Fixtures.State(I06Fixtures.Head with { Status = 30 });
        var restored = I06Fixtures.State();
        Assert.NotEqual(before.StateEqualityToken, changed.StateEqualityToken);
        Assert.Equal(before.StateEqualityToken, restored.StateEqualityToken); // Explicit ABA limitation.
    }

    [Theory]
    [InlineData("different-document")]
    [InlineData("duplicate")]
    [InlineData("alias")]
    [InlineData("precision")]
    [InlineData("identifier")]
    public void Invalid_or_ambiguous_details_cannot_be_fingerprinted(string change)
    {
        var lines = I06Fixtures.Lines;
        lines[1] = change switch
        {
            "different-document" => lines[1] with { DocumentKey = "REQ-2" },
            "duplicate" => lines[1] with { DetailId = "D1" },
            "alias" => lines[1] with { DetailId = "d1" },
            "precision" => lines[1] with { RequestedQuantity = 1.00001m },
            _ => lines[1] with { DetailId = "\ud800" }
        };
        Assert.False(TransferStateSnapshot.TryCreate("tenant", "company", I06Fixtures.Head, lines, out _));
    }

    [Fact]
    public void Oversized_details_long_key_and_invalid_sql_date_fail_closed()
    {
        var oversized = Enumerable.Range(1, 1001).Select(i => new TransferRequestDetailState(
            "D" + i.ToString(CultureInfo.InvariantCulture), "REQ-1", "ITEM", 1m, null));
        Assert.False(TransferStateSnapshot.TryCreate("tenant", "company", I06Fixtures.Head, oversized, out _));
        Assert.False(TransferStateSnapshot.TryCreate("tenant", "company", I06Fixtures.Head with
            { DocumentKey = new string('r', 31) }, [], out _));
        Assert.False(TransferStateSnapshot.TryCreate("tenant", "company", I06Fixtures.Head with
            { UpdatedAt = new DateTime(1700, 1, 1) }, [], out _));
    }
}
