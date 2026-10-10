namespace Medcom.Contracts;
public sealed record ErpContractInfo(string DocumentId,string ContractId,IReadOnlyDictionary<string,object?> Fields);
