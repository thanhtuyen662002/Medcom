namespace Medcom.Contracts;

// Fixed, owner-audited SY_FrmCfg T1/SUM bindings, never caller-selected columns.
// Evidence: inventories/backend/20261018/calculated-data-audit.json.
public static class ErpCalculatedFields
{
    public static IReadOnlyList<ErpFieldDefinition> Summary(string module)
    {
        string[] columns = module switch
        {
            "sales-orders" or "sales-order-pm" or "sales-order-sa" => ["Amount", "VATAmount", "TotalAmount"],
            "warehouse-qr" or "sales-qr" or "machine-movements" => ["Quantity"],
            "machine-repairs" => ["Quantity", "LaborAmount", "PartsAmount", "Amount"],
            _ => []
        };
        return Array.AsReadOnly(columns.Select(column => ErpScreenCatalog.Get(module)!.Fields["lines"]
            .Single(field => field.Column == column && !field.Virtual)).ToArray());
    }
}
