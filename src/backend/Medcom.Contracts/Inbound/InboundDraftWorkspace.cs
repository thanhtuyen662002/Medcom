namespace Medcom.Contracts.Inbound;

// I21 envelopes only. I15's document/command/receipt contracts are unchanged.
public sealed record InboundDraftAccessView(bool CanRead, bool CanSave, bool CanSend,
    bool Available, int MaxCommandBytes);

public sealed record InboundDraftWorkspace(string? ScopeKey, InboundDraftAccessView Access,
    InboundDraftReadResult Data);

public sealed record InboundDraftCommandResponse(string? ScopeKey, InboundDraftResult Data);
