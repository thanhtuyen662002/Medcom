using Medcom.Contracts;
namespace Medcom.Application;

public enum ErpReadOutcome { Success, Invalid, Denied, NotFound, Unavailable, Cancelled }
public sealed record ErpReadResult<T>(ErpReadOutcome Outcome,T? Value=default,string? Code=null);
public interface IErpScreenService
{
    Task<ErpReadResult<ErpDocumentPage>> ListAsync(string module,ErpPageQuery query,CancellationToken token);
    Task<ErpReadResult<ErpDocumentDetail>> DetailAsync(string module,string branch,string document,int page,int size,CancellationToken token);
    Task<ErpReadResult<IReadOnlyList<ErpActionState>>> ActionsAsync(string module,string branch,string? document,CancellationToken token);
    Task<ErpReadResult<ErpContractInfo>> ContractAsync(string module,string branch,string document,CancellationToken token);
    Task<ErpReadResult<ErpChoicePage>> OptionsAsync(string module,ErpLookupQuery query,CancellationToken token);
    Task<ErpReadResult<ErpChoicePage>> PmOptionsAsync(string module,ErpPmLookupQuery query,CancellationToken token);
    Task<ErpReadResult<ErpDraftSelection>> SelectionAsync(string module,ErpSelectionRequest request,CancellationToken token);
    Task<ErpReadResult<ErpDraftSelection>> PasteAsync(string module,ErpPasteRequest request,CancellationToken token);
    Task<ErpCommandResult> CreateAsync(string module,ErpCreateRequest request,CancellationToken token);
    Task<ErpCommandResult> SaveAsync(string module,ErpSaveRequest request,CancellationToken token);
    Task<ErpCommandResult> DeleteAsync(string module,ErpDeleteRequest request,CancellationToken token);
    Task<ErpCommandResult> ActionAsync(string module,string action,ErpActionRequest request,CancellationToken token);
    Task<ErpCommandResult> ScanAsync(string module,string action,ErpScanRequest request,CancellationToken token);
    Task<ErpReadResult<ErpCommandObservation>> ObserveAsync(string module,ErpCommandLookupRequest request,CancellationToken token);
}
public sealed class UnavailableErpScreenService:IErpScreenService
{
    private static Task<ErpReadResult<T>> Read<T>()=>Task.FromResult(new ErpReadResult<T>(ErpReadOutcome.Unavailable,Code:"erp_runtime_unavailable"));
    private static Task<ErpCommandResult> Write()=>Task.FromResult(new ErpCommandResult(ErpCommandOutcome.QualificationRequired,"erp_write_unqualified"));
    public Task<ErpReadResult<ErpDocumentPage>> ListAsync(string module,ErpPageQuery query,CancellationToken token)=>Read<ErpDocumentPage>();
    public Task<ErpReadResult<ErpDocumentDetail>> DetailAsync(string module,string branch,string document,int page,int size,CancellationToken token)=>Read<ErpDocumentDetail>();
    public Task<ErpReadResult<IReadOnlyList<ErpActionState>>> ActionsAsync(string module,string branch,string? document,CancellationToken token)=>Read<IReadOnlyList<ErpActionState>>();
    public Task<ErpReadResult<ErpContractInfo>> ContractAsync(string module,string branch,string document,CancellationToken token)=>Read<ErpContractInfo>();
    public Task<ErpReadResult<ErpChoicePage>> OptionsAsync(string module,ErpLookupQuery query,CancellationToken token)=>Read<ErpChoicePage>();
    public Task<ErpReadResult<ErpChoicePage>> PmOptionsAsync(string module,ErpPmLookupQuery query,CancellationToken token)=>Read<ErpChoicePage>();
    public Task<ErpReadResult<ErpDraftSelection>> SelectionAsync(string module,ErpSelectionRequest request,CancellationToken token)=>Read<ErpDraftSelection>();
    public Task<ErpReadResult<ErpDraftSelection>> PasteAsync(string module,ErpPasteRequest request,CancellationToken token)=>Read<ErpDraftSelection>();
    public Task<ErpCommandResult> CreateAsync(string module,ErpCreateRequest request,CancellationToken token)=>Write();
    public Task<ErpCommandResult> SaveAsync(string module,ErpSaveRequest request,CancellationToken token)=>Write();
    public Task<ErpCommandResult> DeleteAsync(string module,ErpDeleteRequest request,CancellationToken token)=>Write();
    public Task<ErpCommandResult> ActionAsync(string module,string action,ErpActionRequest request,CancellationToken token)=>Write();
    public Task<ErpCommandResult> ScanAsync(string module,string action,ErpScanRequest request,CancellationToken token)=>Write();
    public Task<ErpReadResult<ErpCommandObservation>> ObserveAsync(string module,ErpCommandLookupRequest request,CancellationToken token)=>Read<ErpCommandObservation>();
}
