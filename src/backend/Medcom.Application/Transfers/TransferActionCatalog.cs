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
    string ProcedureSha256,
    string BeforeCheckProcedure,
    IReadOnlySet<int> AllowedSourceStatuses,
    TransferEffectContract Effect);

public static class TransferActionCatalog
{
    private static readonly IReadOnlyDictionary<string, string> ProcedureFingerprints =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["IV_InternalTransfer_BatchAccountingConfirmStp"] = "7dc5691b93ae5df73db326da515cb327164eb824c066f5296748b7239ca6274c",
            ["IV_InternalTransfer_BatchQuickRejectStp"] = "7ba4627386c6b271030faf102cb50428457321033670ef05a1aafc4cd891fb17",
            ["IV_InternalTransfer_BatchUpdateStatusStp"] = "23c92e14134ec6f9bed2810d13e8ddb65222ff7f972b71d9e160c573875a6c3b",
            ["IV_InternalTransfer_BatchSyncRequestsStp"] = "fde4d476d04e6f3533c63dafd769ab80c3c425b4dc33bc4d316cffbe39162a51",
            ["IV_InternalTransfer_BatchSubmitStp"] = "425597ca604f57dcf18e8be03a288ec946e892c620a60e372e085bf985fccde6",
            ["IV_InternalTransfer_RequestPMConfirmStp"] = "6ed96f40bb53ec1ba950b21040e01bff6536d004e30ede93b988a91d783321da",
            ["IV_InternalTransfer_RequestPMReturnStp"] = "a7225b1ed64667ca16b8edeb7216009d9b1d9ad4d8bd85c289eb8db7e802fb49",
            ["IV_InternalTransfer_RequestSendPMStp"] = "a1f9a927c556de3fb81b0711de794487d2af22def3ce136afac78bf38bb6573d",
            ["IV_InternalTransfer_BatchSAApproveStp"] = "cff101d5a9c4c8140c8ab1105311d6f39e3a0248dd6385053a563e0dcad0c5be",
            ["IV_InternalTransfer_BatchTechConfirmStp"] = "c118013ba92ba5e3249b4fa679a78d86b57449d55aad05bc556899c6ba655239",
            ["IV_InternalTransfer_BatchReceiveStp"] = "3514fa7d2f090fb44c0516d0d0cb808a439d89fd962b6999c42b432c76983392",
            ["IV_InternalTransfer_BatchDispatchStp"] = "dc44a89aa84561dcc3e62233d1ba6c1cceba11586d5ce0806ce9902a6d128381"
        };

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
        new($"{form}:{control}", form, control, menu, entity, procedure,
            ProcedureFingerprints[procedure], beforeCheck, statuses, effect);

    private static IReadOnlySet<int> Set(params int[] values) => new HashSet<int>(values);
    private static TransferEffectContract Statuses(params int[] values) =>
        new(TransferEffectKind.StatusTransition, Set(values));
}
