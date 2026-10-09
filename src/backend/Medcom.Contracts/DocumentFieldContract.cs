namespace Medcom.Contracts;

public sealed record DocumentFieldDefinition(string Column,string JsonPath,string SqlType,
    bool Nullable,string JsonType,string? Format,string? ListJsonPath);
public sealed record DocumentFieldTable(string Table,IReadOnlyList<DocumentFieldDefinition> Fields);
public sealed record DocumentFieldContract(int ContractVersion,string Kind,
    DocumentFieldTable Header,DocumentFieldTable Lines);
