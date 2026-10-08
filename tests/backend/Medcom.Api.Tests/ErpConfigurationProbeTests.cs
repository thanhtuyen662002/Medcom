using System.Text.Json;
using Medcom.Api;
using Medcom.Infrastructure.Configuration;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpConfigurationProbeTests
{
    private const string Connection = "Server=synthetic.invalid,1433;Database=Fixture;User ID=synthetic;Password=secret-value;Encrypt=True;TrustServerCertificate=False";
    private static readonly ErpConfigurationProbe.Target Purchase = new("purchase", "05011", "AP_PurposeRequestListFrm");

    [Fact]
    public async Task Exact_cli_opt_in_rejects_extra_arguments_without_host_or_credentials()
    {
        Assert.False(ErpConfigurationProbe.IsRequested([]));
        Assert.False(ErpConfigurationProbe.IsRequested(["--probe-erp-configuration=true"]));
        Assert.True(ErpConfigurationProbe.IsRequested([ErpConfigurationProbe.Switch, "purchase"]));
        foreach (var args in new[] { new[] { ErpConfigurationProbe.Switch },
                     new[] { ErpConfigurationProbe.Switch, "arbitrary-table" },
                     new[] { ErpConfigurationProbe.Switch, "purchase", "Password=secret-value" } })
        {
            using var output = new StringWriter();
            Assert.Equal(2, await ErpConfigurationProbe.RunAsync(args, output));
            Assert.DoesNotContain("secret-value", output.ToString());
            Assert.Contains("invalid_arguments", output.ToString());
        }
    }

    [Theory]
    [InlineData("purchase", "05011", "AP_PurposeRequestListFrm")]
    [InlineData("inbound", "07011", "IV_InboundRequestFrm")]
    public async Task Fixed_area_filters_preserve_TLS_and_flags_and_return_configuration_not_acceptance(string area,string menu,string form)
    {
        using var config = Config(); config["Legacy:Enabled"] = "false";
        using var output = new StringWriter(); var session = new Session();
        Assert.Equal(0, await ErpConfigurationProbe.RunCoreAsync(area, config, output, () => session));
        var connection = new SqlConnectionStringBuilder(session.Connection);
        Assert.True(session.Disposed); Assert.Equal(7, session.Calls); Assert.Equal(menu,session.Menu); Assert.Equal(form,session.Form);
        Assert.Equal(SqlConnectionEncryptOption.Mandatory, connection.Encrypt); Assert.False(connection.TrustServerCertificate);
        Assert.False(connection.Pooling); Assert.Equal(0,connection.ConnectRetryCount); Assert.Equal(10,connection.ConnectTimeout);
        Assert.Equal("false",config["Legacy:Enabled"]); Assert.Null(config["Medcom:SqlDevelopmentTestTls:Enabled"]);
        using var json=JsonDocument.Parse(output.ToString());
        Assert.True(json.RootElement.GetProperty("readOnly").GetBoolean());
        Assert.False(json.RootElement.GetProperty("runtimeAccepted").GetBoolean());
        Assert.False(json.RootElement.GetProperty("inheritanceResolved").GetBoolean());
        Assert.False(json.RootElement.GetProperty("mappingComplete").GetBoolean());
        Assert.Equal("observed_unresolved",json.RootElement.GetProperty("state").GetString());
        Assert.Equal(7,json.RootElement.GetProperty("groups").GetArrayLength());
        AssertSafe(output.ToString());
    }

    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("malformed")]
    [InlineData("Server=synthetic.invalid;Database=Fixture;User ID=synthetic;Password=;Encrypt=True")]
    [InlineData("Server=synthetic.invalid;Database=Fixture;Integrated Security=True;Encrypt=True")]
    [InlineData("Server=synthetic.invalid;Database=Fixture;User ID=synthetic;Password=secret-value;Encrypt=False")]
    [InlineData("Server=synthetic.invalid;Database=Fixture;User ID=synthetic;Password=secret-value;Encrypt=True;TrustServerCertificate=True")]
    public async Task Invalid_configuration_never_constructs_session(string? value)
    {
        using var config = Config(value); using var output=new StringWriter(); var called=false;
        Assert.NotEqual(0, await ErpConfigurationProbe.RunCoreAsync("purchase",config,output,()=>{called=true;return new Session();}));
        Assert.False(called);AssertSafe(output.ToString());
    }

    [Theory]
    [InlineData("read", "partial")] [InlineData("open", "unavailable")]
    [InlineData("dispose", "unavailable")] [InlineData("cancel", "unavailable")]
    public async Task Errors_are_redacted_and_cleanup_failure_never_reports_success(string fault,string state)
    {
        using var config=Config();using var output=new StringWriter();var session=new Session{Fault=fault};
        Assert.Equal(3,await ErpConfigurationProbe.RunCoreAsync("purchase",config,output,()=>session));
        Assert.True(session.Disposed);AssertSafe(output.ToString());
        using var json=JsonDocument.Parse(output.ToString());Assert.Equal(state,json.RootElement.GetProperty("state").GetString());
    }

    [Fact]
    public async Task Shape_mismatch_reports_only_bounded_selected_column_diagnostics()
    {
        using var config=Config();using var output=new StringWriter();var session=new Session{Fault="shape"};
        Assert.Equal(3,await ErpConfigurationProbe.RunCoreAsync("purchase",config,output,()=>session));
        Assert.Contains("shape_mismatch",output.ToString());Assert.Contains("observedLength",output.ToString());
        Assert.Contains("MenuID",output.ToString());AssertSafe(output.ToString());Assert.True(session.Disposed);
        foreach(var plan in ErpConfigurationProbeSql.Plans)
        {
            Assert.StartsWith("SELECT TOP (65) E.Col AS ColumnName",plan.ShapeDiagnosticsText);
            Assert.Contains("OBJECT_ID(N'dbo.",plan.ShapeDiagnosticsText);
            Assert.Contains("N'U')",plan.ShapeDiagnosticsText);
            Assert.DoesNotContain("SELECT *",plan.ShapeDiagnosticsText);
        }
    }

    [Fact]
    public async Task Broken_output_is_nonzero_and_not_retried()
    {
        using var config=Config();using var output=new BrokenWriter();var session=new Session();
        Assert.Equal(4,await ErpConfigurationProbe.RunCoreAsync("purchase",config,output,()=>session));
        Assert.Equal(1,output.Attempts);Assert.True(session.Disposed);
    }

    [Theory]
    [InlineData(0,"missing")] [InlineData(128,"observed")] [InlineData(129,"truncated")]
    public void Row_limit_uses_a_sentinel_and_never_returns_a_truncated_subset(int count,string state)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="configuration");
        var rows=Enumerable.Range(0,count).Select(_=>Row(plan,Purchase)).ToArray();
        var result=ErpConfigurationProbe.Project(plan,rows,Purchase);
        Assert.Equal(state,result.State);Assert.Equal(count==128?128:0,result.Rows.Count);
    }

    [Theory]
    [InlineData("menu")] [InlineData("form")]
    public void Multiple_primary_binding_rows_are_ambiguous(string id)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id==id);var row=Row(plan,Purchase);
        var result=ErpConfigurationProbe.Project(plan,[row,row],Purchase);
        Assert.Equal("ambiguous",result.State);Assert.Empty(result.Rows);
    }

    [Fact]
    public void Changed_menu_form_is_reported_as_a_technical_observation_without_following_it()
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="menu");var row=Row(plan,Purchase);row[1]="DifferentVerifiedLookingForm";
        var result=ErpConfigurationProbe.Project(plan,[row],Purchase);
        Assert.Equal("binding_mismatch",result.State);
        Assert.Equal("DifferentVerifiedLookingForm",Assert.Single(result.Rows).Identifiers["FormName"]);
    }

    [Theory]
    [InlineData("AP_PurposeRequestListFrm ")] [InlineData("ap_purposerequestlistfrm")]
    [InlineData("IV_InboundRequestFrm")] [InlineData("secret-value; SELECT *")]
    public void Returned_scope_must_match_exactly(string form)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);row[0]=form;
        var result=ErpConfigurationProbe.Project(plan,[row],Purchase);
        Assert.Equal("scope_mismatch",result.State);Assert.Empty(result.Rows);
    }

    [Theory]
    [InlineData("secret-value; SELECT password")] [InlineData("field\ncredential")]
    [InlineData("[Field]")] [InlineData("")]
    public void Invalid_technical_strings_are_suppressed_not_echoed(string value)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);row[1]=value;
        var result=ErpConfigurationProbe.Project(plan,[row],Purchase);var mapping=Assert.Single(result.Rows);
        Assert.Null(mapping.Identifiers["GridName"]);Assert.False(mapping.ProjectionValid);
        if(value.Length>0)Assert.DoesNotContain(value,JsonSerializer.Serialize(mapping));
    }

    [Theory]
    [InlineData("width")] [InlineData("flag")] [InlineData("length")] [InlineData("digest")]
    public void Malformed_results_fail_closed(string mutation)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);
        var fingerprint=plan.Identifiers.Count+plan.Flags.Count;
        if(mutation=="width")row=row[..^1];
        if(mutation=="flag")row[plan.Identifiers.Count]="secret-value";
        if(mutation=="length")row[fingerprint]=-1L;
        if(mutation=="digest"){row[fingerprint]=2L;row[fingerprint+1]="secret-value";}
        var result=ErpConfigurationProbe.Project(plan,[row],Purchase);
        Assert.Equal("malformed",result.State);Assert.Empty(result.Rows);
    }

    [Fact]
    public void Null_empty_and_oversized_bodies_stay_distinct_without_returning_a_body()
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="configuration");var row=Row(plan,Purchase);
        var i=plan.Identifiers.Count;row[i]=0L;row[i+1]=new string('A',64);row[i+2]=65537L;row[i+3]=null;
        var mapping=Assert.Single(ErpConfigurationProbe.Project(plan,[row],Purchase).Rows);
        Assert.Equal("fingerprinted",mapping.Fingerprints["KeyValue"].State);
        Assert.Equal("oversized",mapping.Fingerprints["SubValue"].State);Assert.False(mapping.ProjectionValid);
        var nullMapping=Assert.Single(ErpConfigurationProbe.Project(plan,[Row(plan,Purchase)],Purchase).Rows);
        Assert.Equal("null",nullMapping.Fingerprints["KeyValue"].State);
    }

    [Fact]
    public void Only_known_source_fingerprints_receive_a_recognized_source_table()
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);
        var i=plan.Identifiers.Count+plan.Flags.Count;row[i]=70L;
        row[i+1]="83B4D2F350A6DC45B9840BC7AC4ED14AAE86106088210A6846FCE8ACE0003125";
        Assert.Equal("dbo.AP_PurposePurchaseTbl",Assert.Single(ErpConfigurationProbe.Project(plan,[row],Purchase).Rows).RecognizedSourceTable);
        row[i+1]=new string('B',64);
        Assert.Null(Assert.Single(ErpConfigurationProbe.Project(plan,[row],Purchase).Rows).RecognizedSourceTable);
    }

    [Theory]
    [InlineData("dbo","ConfiguredLookup","P")]
    [InlineData("dbo","ConfiguredView","V")]
    [InlineData("inventory","ConfiguredTable","U")]
    public void Resolved_source_objects_emit_only_canonical_technical_metadata(string schema,string name,string type)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);
        row[^3]=schema;row[^2]=name;row[^1]=type;
        var mapped=Assert.Single(ErpConfigurationProbe.Project(plan,[row],Purchase).Rows);
        Assert.Equal("resolved_identifier",mapped.SourceReferenceState);
        Assert.Equal(new ErpConfigurationProbe.SourceObjectReference(schema,name,type),mapped.SourceObject);
    }

    [Theory]
    [InlineData("dbo","secret-value;SELECT","P")]
    [InlineData("other.database","Proc","P")]
    [InlineData("dbo","Proc","Password")]
    [InlineData(null,"Proc","P")]
    [InlineData("dbo","Proc","SN")]
    [InlineData("dbo","Proc ","P")]
    [InlineData("dbo","#Proc","P")]
    [InlineData("dbo","[Proc]","P")]
    public void Malformed_source_object_projection_is_never_echoed(string? schema,string name,string type)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);
        row[^3]=schema;row[^2]=name;row[^1]=type;
        var result=ErpConfigurationProbe.Project(plan,[row],Purchase);
        Assert.Equal("malformed",result.State);Assert.Empty(result.Rows);
    }

    [Theory]
    [InlineData(128,true)] [InlineData(129,false)]
    public void Source_object_component_width_is_never_truncated(int width,bool valid)
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");var row=Row(plan,Purchase);
        row[^3]="dbo";row[^2]=new string('A',width);row[^1]="P";
        var result=ErpConfigurationProbe.Project(plan,[row],Purchase);
        Assert.Equal(valid?"observed":"malformed",result.State);
        if(valid)Assert.Equal(width,Assert.Single(result.Rows).SourceObject!.Name.Length);
        else Assert.Empty(result.Rows);
    }

    [Fact]
    public void Source_resolution_is_metadata_only_guarded_two_part_and_unknown_is_explicit()
    {
        var plan=ErpConfigurationProbeSql.Plans.Single(p=>p.Id=="dropdowns");
        Assert.DoesNotContain("OBJECT_ID(Q.QualifiedSource)",plan.Text);
        Assert.Contains("CONVERT(varbinary(max),S.name)=CONVERT(varbinary(max),PARSENAME(Q.QualifiedSource,2))",plan.Text);
        Assert.Contains("CONVERT(varbinary(max),O.name)=CONVERT(varbinary(max),PARSENAME(Q.QualifiedSource,1))",plan.Text);
        Assert.Contains("O.type IN ('U','V','P','PC','FN','IF','TF','FS','FT')",plan.Text);
        Assert.Contains("LEFT JOIN sys.objects",plan.Text);Assert.Contains("LEFT JOIN sys.schemas",plan.Text);
        Assert.Contains("NOT LIKE N'%[^A-Za-z0-9_.]%'",plan.Text);
        Assert.Contains("BETWEEN 6 AND 514",plan.Text);Assert.Contains("BETWEEN 1 AND 128",plan.Text);
        Assert.Contains("LEN(REPLACE(",plan.Text);Assert.Contains("N'.',N''))=1",plan.Text);
        var mapped=Assert.Single(ErpConfigurationProbe.Project(plan,[Row(plan,Purchase)],Purchase).Rows);
        Assert.Equal("unresolved",mapped.SourceReferenceState);Assert.Null(mapped.SourceObject);
    }

    [Fact]
    public void Query_catalog_is_fixed_read_only_bounded_and_never_selects_business_or_account_rows()
    {
        Assert.Equal(new[]{"menu","form","configuration","dropdowns","buttons","master_actions","grid_actions"},ErpConfigurationProbeSql.Plans.Select(p=>p.Id));
        foreach(var plan in ErpConfigurationProbeSql.Plans)
        {
            Assert.StartsWith("SELECT TOP (129) ",plan.Text);Assert.Contains("FROM dbo.[SY_",plan.Text);
            Assert.Contains("N'U') IS NOT NULL",plan.ShapeText);
            Assert.Contains("sys.columns",plan.ShapeText);Assert.Contains("T.is_user_defined<>0",plan.ShapeText);
            Assert.Contains("C.is_identity<>0 OR C.is_computed<>0",plan.ShapeText);
            Assert.Contains("CONVERT(varbinary(max),@",plan.Text);Assert.Contains("LEFT(CONVERT(nvarchar(max)",plan.Text);
            foreach(var forbidden in new[]{"SELECT *","EXEC ","INSERT ","UPDATE ","DELETE ","MERGE ","COMMIT","SY_User","AP_PurchaseRequestTbl]","IV_InboundRequestTbl]"})
                Assert.DoesNotContain(forbidden,plan.Text,StringComparison.OrdinalIgnoreCase);
            foreach(var body in plan.Fingerprints)
            {Assert.Contains($"DATALENGTH(B.[{body}])",plan.Text);Assert.Contains($"AS [{body}Sha256]",plan.Text);}
        }
    }

    private static ConfigurationManager Config(string? connection=Connection)
    {var config=new ConfigurationManager();config["ConnectionStrings:Medcom"]=connection;return config;}
    private static void AssertSafe(string output)
    {foreach(var value in new[]{"secret-value","synthetic.invalid","Fixture","Password=","private-row"})Assert.DoesNotContain(value,output);}
    private static object?[] Row(ErpConfigurationProbeSql.Plan plan,ErpConfigurationProbe.Target target)
    {
        return plan.Identifiers.Select(name=>(object?)(name switch
        {"MenuID"=>target.Menu,"FormID" or "FID" or "FormName"=>target.Form,"PFID"=>null,_=>"Field"}))
            .Concat(plan.Flags.Select(_=>(object?)false)).Concat(plan.Fingerprints.SelectMany(_=>new object?[]{null,null}))
            .Concat(plan.HasSource ? new object?[]{null,null,null} : []).ToArray();
    }
    private sealed class Session:ErpConfigurationProbe.ISession
    {
        public string Connection="",Menu="",Form="";public int Calls;public bool Disposed;public string? Fault;
        public Task OpenAsync(string connectionString,CancellationToken token)
        {Connection=connectionString;Assert.True(token.CanBeCanceled);if(Fault=="open")throw new IOException("secret-value private-row");return Task.CompletedTask;}
        public Task<IReadOnlyList<object?[]>> ReadAsync(ErpConfigurationProbeSql.Plan plan,string menu,string form,CancellationToken token)
        {
            Calls++;Menu=menu;Form=form;
            if(Fault=="shape")throw new ErpConfigurationProbe.ShapeMismatchException([new(plan.Identifiers[0],"nvarchar",100,true,false,false,false)]);
            if(Fault=="cancel")throw new OperationCanceledException("secret-value");
            if(Fault=="read")throw new IOException("secret-value private-row");
            return Task.FromResult<IReadOnlyList<object?[]>>([Row(plan,new(form==Purchase.Form?"purchase":"inbound",menu,form))]);
        }
        public ValueTask DisposeAsync(){Disposed=true;if(Fault=="dispose")throw new IOException("secret-value");return ValueTask.CompletedTask;}
    }
    private sealed class BrokenWriter:StringWriter
    {public int Attempts;public override Task WriteLineAsync(string? value){Attempts++;throw new IOException("secret-value");}}
}
