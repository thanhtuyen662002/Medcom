namespace Medcom.Application.Transfers;

public enum TransferEntityKind
{
    Request,
    Batch
}

public enum TransferEffectKind
{
    ContentSynchronization,
    StatusTransition
}

public sealed record TransferEffectContract(
    TransferEffectKind Kind,
    IReadOnlySet<int> AllowedPostStatuses,
    bool RequiresAtomicLegacyLog = true);

public sealed record TransferActionDefinition(
    string Id,
    string FormId,
    string ControlId,
    string MenuId,
    TransferEntityKind Entity,
    string Procedure,
    string BeforeCheckProcedure,
    IReadOnlySet<int> AllowedSourceStatuses,
    TransferEffectContract Effect);

public static class TransferActionCatalog
{
    private static readonly TransferEffectContract Synchronize =
        new(TransferEffectKind.ContentSynchronization, new HashSet<int>());
    private static readonly TransferEffectContract To10 = Statuses(10);
    private static readonly TransferEffectContract To20 = Statuses(20);
    private static readonly TransferEffectContract To30 = Statuses(30);
    private static readonly TransferEffectContract To40 = Statuses(40);
    private static readonly TransferEffectContract To60 = Statuses(60);
    private static readonly TransferEffectContract To70 = Statuses(70);
    private static readonly TransferEffectContract To100 = Statuses(100);
    private static readonly TransferEffectContract To120Or130 = Statuses(120, 130);
    private static readonly TransferEffectContract ReturnTransitions = Statuses(10, 21, 41, 61);
    private static readonly TransferEffectContract SubmitTransitions = Statuses(20, 40);

    public static IReadOnlyList<TransferActionDefinition> All { get; } =
    [
        Batch("IV_InternalTransferAccountingFrm", "ExecSQLWithParaButtonCtl", "07010150",
            "IV_InternalTransfer_BatchAccountingConfirmStp", Set(60, 61), To70),
        Batch("IV_InternalTransferAccountingFrm", "ExecSQLWithParaButtonCtl_1", "07010150",
            "IV_InternalTransfer_BatchQuickRejectStp", Set(60, 61), ReturnTransitions),
        Batch("IV_InternalTransferAccountingFrm", "ExecSQLWithParaButtonCtl_2", "07010150",
            "IV_InternalTransfer_BatchUpdateStatusStp", Set(60, 61), ReturnTransitions),
        Batch("IV_InternalTransferBatchFrm", "ExecSQLWithParaButtonCtl", "07010120",
            "IV_InternalTransfer_BatchSyncRequestsStp", Set(0, 10, 25, 45), Synchronize),
        Batch("IV_InternalTransferBatchFrm", "ExecSQLWithParaButtonCtl_1", "07010120",
            "IV_InternalTransfer_BatchSubmitStp", Set(0, 10, 25, 45), SubmitTransitions),
        Request("IV_InternalTransferPMFrm", "ExecSQLWithParaButtonCtl", "07010110",
            "IV_InternalTransfer_RequestPMConfirmStp", Set(10), To20),
        Request("IV_InternalTransferPMFrm", "ExecSQLWithParaButtonCtl_1", "07010110",
            "IV_InternalTransfer_RequestPMReturnStp", Set(10), To30),
        Request("IV_InternalTransferRequestFrm", "ExecSQLWithParaButtonCtl", "07010100",
            "IV_InternalTransfer_RequestSendPMStp", Set(0, 30), To10),
        Batch("IV_InternalTransferSAFrm", "ExecSQLWithParaButtonCtl", "07010140",
            "IV_InternalTransfer_BatchSAApproveStp", Set(40, 41), To60),
        Batch("IV_InternalTransferSAFrm", "ExecSQLWithParaButtonCtl_1", "07010140",
            "IV_InternalTransfer_BatchQuickRejectStp", Set(40, 41), ReturnTransitions),
        Batch("IV_InternalTransferSAFrm", "ExecSQLWithParaButtonCtl_2", "07010140",
            "IV_InternalTransfer_BatchUpdateStatusStp", Set(40, 41), ReturnTransitions),
        Batch("IV_InternalTransferTechFrm", "ExecSQLWithParaButtonCtl", "07010130",
            "IV_InternalTransfer_BatchTechConfirmStp", Set(20, 21), To40),
        Batch("IV_InternalTransferTechFrm", "ExecSQLWithParaButtonCtl_1", "07010130",
            "IV_InternalTransfer_BatchQuickRejectStp", Set(20, 21), ReturnTransitions),
        Batch("IV_InternalTransferWarehouseInFrm", "ExecSQLWithParaButtonCtl", "07010170",
            "IV_InternalTransfer_BatchReceiveStp", Set(100, 130), To120Or130),
        Batch("IV_InternalTransferWarehouseOutFrm", "ExecSQLWithParaButtonCtl", "07010160",
            "IV_InternalTransfer_BatchDispatchStp", Set(70), To100),
        Batch("IV_InternalTransferWarehouseOutFrm", "ExecSQLWithParaButtonCtl_1", "07010160",
            "IV_InternalTransfer_BatchQuickRejectStp", Set(70), ReturnTransitions),
        Batch("IV_InternalTransferWarehouseOutFrm", "ExecSQLWithParaButtonCtl_2", "07010160",
            "IV_InternalTransfer_BatchUpdateStatusStp", Set(70), ReturnTransitions)
    ];

    private static readonly IReadOnlyDictionary<string, TransferActionDefinition> ById =
        All.ToDictionary(action => action.Id, StringComparer.Ordinal);

    public static bool TryGet(string? id, out TransferActionDefinition definition)
    {
        definition = null!;
        return id is not null && ById.TryGetValue(id, out definition!);
    }

    private static TransferActionDefinition Request(string form, string control, string menu,
        string procedure, IReadOnlySet<int> statuses, TransferEffectContract effect) =>
        Create(form, control, menu, TransferEntityKind.Request, procedure,
            form == "IV_InternalTransferRequestFrm"
                ? "IV_InternalTransfer_RequestCheckBeforeUpdateStp"
                : "IV_InternalTransfer_RequestPMCheckBeforeUpdateStp",
            statuses, effect);

    private static TransferActionDefinition Batch(string form, string control, string menu,
        string procedure, IReadOnlySet<int> statuses, TransferEffectContract effect) =>
        Create(form, control, menu, TransferEntityKind.Batch, procedure,
            "IV_InternalTransfer_BatchCheckBeforeUpdateStp", statuses, effect);

    private static TransferActionDefinition Create(string form, string control, string menu,
        TransferEntityKind entity, string procedure, string beforeCheck,
        IReadOnlySet<int> statuses, TransferEffectContract effect) =>
        new($"{form}:{control}", form, control, menu, entity, procedure, beforeCheck, statuses, effect);

    private static IReadOnlySet<int> Set(params int[] values) => new HashSet<int>(values);
    private static TransferEffectContract Statuses(params int[] values) =>
        new(TransferEffectKind.StatusTransition, Set(values));
}
