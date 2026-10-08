namespace Medcom.Infrastructure.Configuration;

// Fixed configuration catalog only. No business table is selected, no stored
// Source/KeyValue/Para text is returned or executed, and callers cannot supply SQL.
public static class ErpConfigurationProbeSql
{
    public const int MaximumRows = 128;
    public const int MaximumBodyBytes = 65536;
    public sealed record Plan(string Id, string Text, string ShapeText, string ShapeDiagnosticsText, IReadOnlyList<string> Identifiers,
        IReadOnlyList<string> Flags, IReadOnlyList<string> Fingerprints)
    {
        public bool HasSource => Fingerprints.Contains("Source", StringComparer.Ordinal);
    }

    private static readonly IReadOnlyDictionary<string,IReadOnlyDictionary<string,string>> Shapes =
        new Dictionary<string,IReadOnlyDictionary<string,string>>(StringComparer.Ordinal)
        {
            ["SY_Menu"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["MenuID"] = "('MenuID','varchar',50,0)",
                ["VN"] = "('VN','nvarchar',400,0)",
                ["EN"] = "('EN','nvarchar',400,1)",
                ["CH"] = "('CH','nvarchar',400,1)",
                ["MenuType"] = "('MenuType','int',4,0)",
                ["IconIndex"] = "('IconIndex','int',4,1)",
                ["FormName"] = "('FormName','varchar',100,1)",
                ["Parent"] = "('Parent','varchar',50,1)",
                ["isBeginGroup"] = "('isBeginGroup','bit',1,0)",
                ["isDisable"] = "('isDisable','bit',1,0)",
                ["isBold"] = "('isBold','bit',1,0)",
                ["isNotCheckPermission"] = "('isNotCheckPermission','bit',1,1)",
                ["Para"] = "('Para','varchar',50,1)",
                ["ReportPara"] = "('ReportPara','nvarchar',400,1)",
                ["SubReportPara"] = "('SubReportPara','nvarchar',400,1)",
                ["MenuKey"] = "('MenuKey','varchar',100,1)",
                ["ShortKey"] = "('ShortKey','varchar',50,1)",
                ["ShowDialog"] = "('ShowDialog','bit',1,1)",
                ["Filter"] = "('Filter','nvarchar',300,1)",
            },
            ["SY_FrmLstTbl"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["FormID"] = "('FormID','varchar',100,0)",
                ["FormType"] = "('FormType','varchar',50,1)",
                ["CaptionVN"] = "('CaptionVN','nvarchar',200,0)",
                ["CaptionEN"] = "('CaptionEN','nvarchar',200,1)",
                ["TableName"] = "('TableName','varchar',100,1)",
                ["PrimaryKey"] = "('PrimaryKey','varchar',100,1)",
                ["HideColumnArr"] = "('HideColumnArr','varchar',-1,1)",
                ["SummaryColumnArr"] = "('SummaryColumnArr','varchar',200,1)",
                ["AddNewColumnArr"] = "('AddNewColumnArr','varchar',-1,1)",
                ["FilterEx"] = "('FilterEx','nvarchar',100,1)",
                ["LockColumnArr"] = "('LockColumnArr','varchar',100,1)",
                ["TableDetail"] = "('TableDetail','varchar',50,1)",
                ["TableDetailLeftJoinField"] = "('TableDetailLeftJoinField','varchar',100,1)",
                ["TableDetailSelectFrom"] = "('TableDetailSelectFrom','varchar',500,1)",
                ["TableDetail2"] = "('TableDetail2','varchar',50,1)",
                ["TableDetail2LeftJoinField"] = "('TableDetail2LeftJoinField','varchar',100,1)",
                ["TableDetail2SelectFrom"] = "('TableDetail2SelectFrom','varchar',500,1)",
                ["Filter"] = "('Filter','nvarchar',200,1)",
                ["PrimaryKeyFormat"] = "('PrimaryKeyFormat','nvarchar',500,1)",
                ["PrimaryKeyLen"] = "('PrimaryKeyLen','int',4,1)",
                ["DefaultColumnArr"] = "('DefaultColumnArr','varchar',250,1)",
                ["CaptionCH"] = "('CaptionCH','nvarchar',400,1)",
                ["EditorColumnArr"] = "('EditorColumnArr','varchar',-1,1)",
            },
            ["SY_FrmCfg"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["UserAutoID"] = "('UserAutoID','varchar',50,0)",
                ["FID"] = "('FID','varchar',250,1)",
                ["KeyID"] = "('KeyID','varchar',50,0)",
                ["SubID"] = "('SubID','varchar',50,1)",
                ["KeyValue"] = "('KeyValue','nvarchar',-1,1)",
                ["SubValue"] = "('SubValue','nvarchar',-1,1)",
                ["VDate"] = "('VDate','datetime',8,1)",
                ["PFID"] = "('PFID','varchar',250,1)",
            },
            ["SY_FrmDrdwTbl"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["UserAutoID"] = "('UserAutoID','varchar',40,0)",
                ["FormID"] = "('FormID','varchar',250,1)",
                ["GridName"] = "('GridName','varchar',100,1)",
                ["ColumnID"] = "('ColumnID','varchar',50,0)",
                ["ValueColumn"] = "('ValueColumn','varchar',50,1)",
                ["DisplayColumn"] = "('DisplayColumn','varchar',50,1)",
                ["ColumnArr"] = "('ColumnArr','varchar',500,1)",
                ["WidthArr"] = "('WidthArr','varchar',500,1)",
                ["Source"] = "('Source','nvarchar',-1,1)",
                ["LinkColumn"] = "('LinkColumn','varchar',500,1)",
                ["DisableAddNew"] = "('DisableAddNew','bit',1,1)",
                ["ParaArr"] = "('ParaArr','varchar',200,1)",
                ["ParaRequireArr"] = "('ParaRequireArr','varchar',100,1)",
                ["Type"] = "('Type','varchar',10,1)",
                ["KeepValue"] = "('KeepValue','bit',1,1)",
                ["SummaryFieldArr"] = "('SummaryFieldArr','varchar',100,1)",
                ["IsMultiSelect"] = "('IsMultiSelect','bit',1,1)",
                ["IsNotInList"] = "('IsNotInList','bit',1,1)",
                ["IsDisable"] = "('IsDisable','bit',1,1)",
                ["ColumnName_Filter"] = "('ColumnName_Filter','varchar',50,1)",
                ["ColumnValue_Filter"] = "('ColumnValue_Filter','varchar',50,1)",
                ["OnlyValue_Filter"] = "('OnlyValue_Filter','varchar',50,1)",
                ["ManualSQLSearch"] = "('ManualSQLSearch','bit',1,1)",
                ["ManualSQLOrderBy"] = "('ManualSQLOrderBy','varchar',50,1)",
                ["DefaultValue"] = "('DefaultValue','nvarchar',200,1)",
                ["IsReload"] = "('IsReload','bit',1,0)",
                ["EditableColumns"] = "('EditableColumns','varchar',250,1)",
                ["Caption"] = "('Caption','nvarchar',300,1)",
                ["isLock"] = "('isLock','bit',1,0)",
                ["isInvisible"] = "('isInvisible','bit',1,0)",
                ["isWordWrap"] = "('isWordWrap','bit',1,0)",
                ["isMultiValue"] = "('isMultiValue','bit',1,0)",
                ["GroupCaption"] = "('GroupCaption','nvarchar',500,1)",
                ["WordWrapArr"] = "('WordWrapArr','varchar',250,1)",
                ["GroupColumnArr"] = "('GroupColumnArr','varchar',100,1)",
                ["DisplayMember2"] = "('DisplayMember2','varchar',50,1)",
                ["TreeViewColumn"] = "('TreeViewColumn','varchar',50,1)",
                ["TreeViewColumnParent"] = "('TreeViewColumnParent','varchar',50,1)",
                ["ReloadType"] = "('ReloadType','int',4,1)",
                ["EditType"] = "('EditType','int',4,1)",
                ["DefaultValueSQL"] = "('DefaultValueSQL','nvarchar',500,1)",
                ["TriggerOnOpenForm"] = "('TriggerOnOpenForm','bit',1,1)",
            },
            ["SY_FrmOptBtnTbl"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["UserAutoID"] = "('UserAutoID','varchar',40,0)",
                ["FormID"] = "('FormID','varchar',250,1)",
                ["KeyID"] = "('KeyID','varchar',100,0)",
                ["GridName"] = "('GridName','varchar',100,1)",
                ["Caption"] = "('Caption','nvarchar',300,0)",
                ["Width"] = "('Width','int',4,1)",
                ["Action"] = "('Action','varchar',100,1)",
                ["Source"] = "('Source','varchar',200,1)",
                ["WhereStr"] = "('WhereStr','nvarchar',200,1)",
                ["Para"] = "('Para','varchar',100,1)",
                ["RequireFieldArr"] = "('RequireFieldArr','varchar',100,1)",
                ["BeforeAction"] = "('BeforeAction','varchar',50,1)",
                ["AfterAction"] = "('AfterAction','varchar',50,1)",
                ["EnableStatus"] = "('EnableStatus','varchar',50,1)",
                ["ReturnMasterField"] = "('ReturnMasterField','varchar',-1,1)",
                ["ReturnDetailField"] = "('ReturnDetailField','varchar',-1,1)",
                ["RefTable"] = "('RefTable','varchar',100,1)",
                ["RefCompareField"] = "('RefCompareField','varchar',100,1)",
                ["RefDisplayField"] = "('RefDisplayField','varchar',100,1)",
                ["RefDisplayField2"] = "('RefDisplayField2','varchar',100,1)",
                ["MasterHiddenField"] = "('MasterHiddenField','varchar',500,1)",
                ["DetailHiddenField"] = "('DetailHiddenField','varchar',500,1)",
                ["IsDisable"] = "('IsDisable','bit',1,0)",
                ["IsMultiSelect"] = "('IsMultiSelect','bit',1,1)",
                ["IsRecordCompare"] = "('IsRecordCompare','bit',1,0)",
                ["RefCompareField2"] = "('RefCompareField2','varchar',100,1)",
                ["HiddenFieldList"] = "('HiddenFieldList','varchar',250,1)",
            },
            ["SY_FrmMstActTbl"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["UserAutoID"] = "('UserAutoID','varchar',40,0)",
                ["FormID"] = "('FormID','varchar',250,1)",
                ["MaterAction"] = "('MaterAction','varchar',50,1)",
                ["Action"] = "('Action','varchar',50,1)",
                ["Source"] = "('Source','nvarchar',400,1)",
                ["Para"] = "('Para','varchar',100,1)",
                ["ColumnID"] = "('ColumnID','varchar',50,0)",
                ["TargetValue"] = "('TargetValue','nvarchar',200,1)",
                ["TargetValue2"] = "('TargetValue2','nvarchar',200,1)",
                ["TargetColumn"] = "('TargetColumn','varchar',250,1)",
                ["TargetColumn2"] = "('TargetColumn2','varchar',250,1)",
                ["MsgID"] = "('MsgID','varchar',50,1)",
                ["IsDisable"] = "('IsDisable','bit',1,0)",
                ["ActType"] = "('ActType','varchar',100,1)",
                ["Oderby"] = "('Oderby','int',4,1)",
                ["isLockScreen"] = "('isLockScreen','bit',1,1)",
                ["ColumnIDArr"] = "('ColumnIDArr','varchar',500,1)",
            },
            ["SY_FrmGrdActTbl"] = new Dictionary<string,string>(StringComparer.Ordinal)
            {
                ["UserAutoID"] = "('UserAutoID','varchar',40,0)",
                ["FormID"] = "('FormID','varchar',250,1)",
                ["GridName"] = "('GridName','varchar',100,0)",
                ["ColumnID"] = "('ColumnID','varchar',50,0)",
                ["Action"] = "('Action','varchar',50,1)",
                ["Source"] = "('Source','nvarchar',-1,1)",
                ["Para"] = "('Para','varchar',100,1)",
                ["TargetValue"] = "('TargetValue','nvarchar',200,1)",
                ["TargetValue2"] = "('TargetValue2','nvarchar',200,1)",
                ["TargetColumn"] = "('TargetColumn','varchar',250,1)",
                ["TargetColumn2"] = "('TargetColumn2','varchar',250,1)",
                ["MsgID"] = "('MsgID','varchar',50,1)",
                ["IsDisable"] = "('IsDisable','bit',1,0)",
                ["ActType"] = "('ActType','varchar',100,1)",
                ["Oderby"] = "('Oderby','int',4,1)",
            },
        };

    public static IReadOnlyList<Plan> Plans { get; } = Array.AsReadOnly(new[]
    {
        Build("menu", "SY_Menu", "MenuID", "@menu",
            ["MenuID", "FormName", "Parent"], ["isDisable"], ["Para", "Filter"]),
        Build("form", "SY_FrmLstTbl", "FormID", "@form",
            ["FormID", "FormType", "TableName", "PrimaryKey", "TableDetail", "TableDetail2"], [],
            ["TableDetailSelectFrom", "TableDetail2SelectFrom", "PrimaryKeyFormat"]),
        Build("configuration", "SY_FrmCfg", "FID", "@form",
            ["FID", "KeyID", "SubID", "PFID"], [], ["KeyValue", "SubValue"]),
        Build("dropdowns", "SY_FrmDrdwTbl", "FormID", "@form",
            ["FormID", "GridName", "ColumnID", "ValueColumn", "DisplayColumn", "Type"],
            ["IsDisable", "DisableAddNew", "IsMultiSelect", "IsNotInList", "isLock", "isInvisible"],
            ["Source", "LinkColumn", "ParaArr", "ParaRequireArr", "DefaultValue", "DefaultValueSQL"]),
        Build("buttons", "SY_FrmOptBtnTbl", "FormID", "@form",
            ["FormID", "KeyID", "GridName", "Action", "BeforeAction", "AfterAction", "RefTable", "RefCompareField", "RefDisplayField"],
            ["IsDisable", "IsMultiSelect"], ["Source", "Para", "WhereStr", "EnableStatus", "RequireFieldArr"]),
        Build("master_actions", "SY_FrmMstActTbl", "FormID", "@form",
            ["FormID", "MaterAction", "Action", "ColumnID", "TargetColumn", "ActType"],
            ["IsDisable"], ["Source", "Para", "TargetValue", "TargetValue2"]),
        Build("grid_actions", "SY_FrmGrdActTbl", "FormID", "@form",
            ["FormID", "GridName", "ColumnID", "Action", "TargetColumn", "ActType"],
            ["IsDisable"], ["Source", "Para", "TargetValue", "TargetValue2"])
    });

    // Only the hard-coded calls above reach this builder. It is not a general query API.
    private static Plan Build(string id, string table, string selector, string parameter,
        string[] identifiers, string[] flags, string[] fingerprints)
    {
        var columns = identifiers.Select(name => $"LEFT(CONVERT(nvarchar(max),B.[{name}]),251) AS [{name}]")
            .Concat(flags.Select(name => $"B.[{name}]"))
            .Concat(fingerprints.SelectMany(name => new[]
            {
                $"CONVERT(bigint,DATALENGTH(B.[{name}])) AS [{name}Bytes]",
                $"CASE WHEN DATALENGTH(B.[{name}])<={MaximumBodyBytes} THEN CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),B.[{name}])),2) END AS [{name}Sha256]"
            }));
        // Binary Unicode equality excludes padded/case aliases. 129 is a sentinel,
        // never silently truncate to the first 128 or claim complete metadata.
        var hasSource = fingerprints.Contains("Source", StringComparer.Ordinal);
        var joins = "";
        if (hasSource)
        {
            // Only a same-database, two-part, unquoted ASCII schema.object name can
            // reach exact catalog-name joins. Configured SQL text is never interpreted.
            var source = "CONVERT(nvarchar(max),B.[Source])";
            var dot = $"CHARINDEX(N'.',{source})";
            var guard = $"DATALENGTH({source}) BETWEEN 6 AND 514 "
                + $"AND {source} COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-Za-z0-9_.]%' "
                + $"AND LEN({source})-LEN(REPLACE({source},N'.',N''))=1 "
                + $"AND {dot} BETWEEN 2 AND 129 AND LEN({source})-{dot} BETWEEN 1 AND 128 "
                + $"AND LEFT({source},1) COLLATE Latin1_General_100_BIN2 LIKE N'[A-Za-z_]' "
                + $"AND SUBSTRING({source},{dot}+1,1) COLLATE Latin1_General_100_BIN2 LIKE N'[A-Za-z_]'";
            joins = $" OUTER APPLY (SELECT CASE WHEN {guard} THEN {source} END AS QualifiedSource) Q "
                + "LEFT JOIN sys.schemas S ON CONVERT(varbinary(max),S.name)=CONVERT(varbinary(max),PARSENAME(Q.QualifiedSource,2)) "
                + "LEFT JOIN sys.objects O ON O.schema_id=S.schema_id "
                + "AND CONVERT(varbinary(max),O.name)=CONVERT(varbinary(max),PARSENAME(Q.QualifiedSource,1)) "
                + "AND O.type IN ('U','V','P','PC','FN','IF','TF','FS','FT') ";
            columns = columns.Concat(new[] { "CASE WHEN O.object_id IS NOT NULL THEN S.name END AS SourceSchema", "O.name AS SourceObject", "RTRIM(O.type) AS SourceObjectType" });
        }
        var sql = $"SELECT TOP ({MaximumRows + 1}) {string.Join(",", columns)} FROM dbo.[{table}] B " + joins
            + $"WHERE CONVERT(varbinary(max),CONVERT(nvarchar(max),B.[{selector}]))=CONVERT(varbinary(max),{parameter});";
        var expected = string.Join(",", identifiers.Concat(flags).Concat(fingerprints).Select(name => Shapes[table][name]));
        var differences = $"FROM (VALUES {expected}) E(Col,Typ,Len,Nullable) "
            + $"LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID(N'dbo.{table}',N'U') "
            + "AND CONVERT(varbinary(max),C.name)=CONVERT(varbinary(max),CONVERT(nvarchar(max),E.Col)) "
            + "LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id "
            + "WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0 OR C.max_length<>E.Len "
            + "OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0";
        var shape = $"SELECT CONVERT(int,CASE WHEN OBJECT_ID(N'dbo.{table}',N'U') IS NOT NULL "
            + $"AND NOT EXISTS (SELECT 1 {differences}) THEN 1 ELSE 0 END) AS ShapeOk;";
        // Selected-column metadata only. Custom alias names are suppressed, while
        // the custom-type flag still explains why the fixed contract is unavailable.
        var diagnostic = "SELECT TOP (65) E.Col AS ColumnName,CASE WHEN T.is_user_defined=0 THEN T.name END AS ObservedType,"
            + "CONVERT(int,C.max_length) AS ObservedLength,C.is_nullable AS ObservedNullable,"
            + "C.is_identity AS ObservedIdentity,C.is_computed AS ObservedComputed,T.is_user_defined AS CustomType "
            + differences + ";";
        return new(id, sql, shape, diagnostic, Array.AsReadOnly(identifiers), Array.AsReadOnly(flags), Array.AsReadOnly(fingerprints));
    }
}
