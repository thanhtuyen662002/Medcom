using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Medcom.Contracts;
using Medcom.Contracts.Inbound;
using Medcom.Application;

namespace Medcom.Api;

// Public technical contracts only: no service resolution, SQL, settings, identity,
// credentials, grants or deployment attestation. Registration is not availability.
internal static class ApiContractCatalog
{
    internal const string Path = "/api/contracts/openapi.json";
    private static readonly string Document = Build().ToJsonString();
    internal static string Json => Document;

    internal static void Map(WebApplication app) => app.MapGet(Path,
        () => Results.Text(Document, "application/json", System.Text.Encoding.UTF8)).AllowAnonymous();

    internal static JsonObject Build()
    {
        var schemas = new Schemas();
        var paths = new JsonObject();
        schemas.Values["ProblemDetails"] = new JsonObject
        {
            ["type"] = "object", ["additionalProperties"] = true,
            ["properties"] = new JsonObject
            {
                ["type"] = new JsonObject { ["type"] = "string" }, ["title"] = new JsonObject { ["type"] = "string" },
                ["status"] = new JsonObject { ["type"] = "integer" }, ["detail"] = new JsonObject { ["type"] = "string" },
                ["instance"] = new JsonObject { ["type"] = "string" }, ["code"] = new JsonObject { ["type"] = "string" },
                ["correlationId"] = new JsonObject { ["type"] = "string" }
            },
            ["required"] = new JsonArray()
        };
        JsonObject Shape(Type type) => schemas.Shape(type);
        JsonObject Object(params (string Name, JsonObject Schema)[] properties) => new()
        {
            ["type"] = "object", ["additionalProperties"] = false,
            ["properties"] = new JsonObject(properties.Select(p => KeyValuePair.Create<string, JsonNode?>(p.Name, p.Schema))),
            ["required"] = Array(properties.Select(p => p.Name))
        };
        JsonObject Parameter(string name, string location, JsonObject schema, bool required = false) => new()
        { ["name"] = name, ["in"] = location, ["required"] = required, ["schema"] = schema };
        JsonObject String(int? limit = null) => limit is {} n ? new() { ["type"] = "string", ["maxLength"] = n } : new() { ["type"] = "string" };
        JsonObject Number(int maximum, int fallback) => new()
        { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = maximum, ["default"] = fallback };
        JsonArray ListParameters(bool version2,int size,int fallback)
        {
            var parameters = new JsonArray(Parameter("page", "query", Number(1000, 1)),
                Parameter("pageSize", "query", Number(size, fallback)),
                Parameter("search", "query", String(100)), Parameter("branchId", "query", String(50)));
            if(version2)
            {
                JsonObject Date() => new() { ["type"]="string",["format"]="date",["pattern"]="^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
                    ["description"]="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." };
                parameters.Add(Parameter("dateFrom","query",Date()));parameters.Add(Parameter("dateTo","query",Date()));
                parameters.Add(Parameter("statusId","query",new() { ["type"]="integer",["minimum"]=int.MinValue,["maximum"]=int.MaxValue,
                    ["description"]="Exact source StatusID. A filter never authorizes a state change." }));
                parameters.Add(Parameter("sortBy","query",new() { ["type"]="string",["enum"]=Array(["documentDate","documentId","statusId"]),["default"]="documentDate" }));
                parameters.Add(Parameter("sortDirection","query",new() { ["type"]="string",["enum"]=Array(["asc","desc"]),["default"]="desc",
                    ["description"]="Document ID uses binary byte ordering and breaks date/status ties ascending; SQL nulls sort first ascending and last descending. Offset pages are not a cross-request snapshot." }));
            }
            return parameters;
        }
        void Add(string method, string path, string id, JsonObject? response,
            string admission, string? capability = null, bool anonymous = false,
            Type? request = null, JsonArray? parameters = null, int success = 200)
        {
            var security = new JsonObject();
            if (!anonymous) security["SessionCookie"] = new JsonArray();
            if (method == "post")
            {
                security["CsrfToken"] = new JsonArray();
                security["CsrfCookie"] = new JsonArray();
            }
            var responses = new JsonObject
            {
                [success.ToString(System.Globalization.CultureInfo.InvariantCulture)] = response is null
                    ? new JsonObject { ["description"] = success == 204 ? "No content." : "OpenAPI document." }
                    : new JsonObject { ["description"] = success == 503 ? "Business release is not admitted; inspect dependency observations." : "Typed response. Inspect access and outcome; HTTP 200 does not imply a committed write.",
                        ["content"] = new JsonObject { ["application/json"] = new JsonObject { ["schema"] = response } } },
                ["default"] = new JsonObject { ["description"] = "Non-success HTTP status. Do not infer an available operation or committed effect. Infrastructure errors may use another shape.",
                    ["content"] = new JsonObject { ["application/problem+json"] = new JsonObject { ["schema"] = Schemas.Ref("ProblemDetails") } } }
            };
            var operation = new JsonObject
            {
                ["operationId"] = id, ["responses"] = responses,
                ["security"] = security.Count == 0 ? new JsonArray() : new JsonArray(security),
                ["x-medcom-admission"] = admission,
                ["description"] = "Contract of the registered boundary. Live credentials, capability, branch, session scope and provider qualification remain authoritative."
            };
            var responseHeaders = new JsonObject
            {
                ["X-Correlation-ID"] = new JsonObject { ["description"] = "Server-generated request correlation, never client authority.", ["schema"] = String() }
            };
            if (method == "get" && (path == "/api/workspace" || path.StartsWith("/api/documents/", StringComparison.Ordinal)
                || path.StartsWith("/api/v2/", StringComparison.Ordinal) || path.StartsWith("/api/purchase-requests", StringComparison.Ordinal)))
                foreach (var header in new[] { "X-Medcom-Session-Scope", "X-Medcom-Read-Scope" })
                    responseHeaders[header] = new JsonObject { ["description"] = "Opaque current scope of a successful authorized read; invalidate stale data when it changes.", ["schema"] = String() };
            if(method=="get" && DocumentDataProjection.FullPath(path) is {} fullPath)
            {
                const string projection="full";
                operation["x-medcom-data-projection"]=projection;
                operation["x-medcom-full-data-path"]=fullPath;
                responseHeaders[DocumentDataProjection.Header]=new JsonObject
                { ["description"]="Full fields for each record in the bounded page, including nullable properties. Pagination does not reduce the field set.",
                    ["schema"]=new JsonObject { ["type"]="string",["const"]=projection } };
                responseHeaders[DocumentDataProjection.PathHeader]=new JsonObject
                { ["description"]="The registered full-data route used by this response, without identifiers or query strings.",
                    ["schema"]=new JsonObject { ["type"]="string",["const"]=fullPath } };
            }
            responses[success.ToString(System.Globalization.CultureInfo.InvariantCulture)]!["headers"] = responseHeaders;
            if (capability is not null) operation["x-medcom-capability"] = capability;
            if (parameters is not null) operation["parameters"] = parameters;
            if (request is not null) operation["requestBody"] = new JsonObject
            {
                ["required"] = true,
                ["content"] = new JsonObject { ["application/json"] = new JsonObject { ["schema"] = Shape(request) } }
            };
            if (paths[path] is not JsonObject item) paths[path] = item = new();
            item[method] = operation;
        }
        Add("get", "/health/live", "healthLive", Object(("status", new() { ["type"] = "string", ["const"] = "healthy" })), "process-only", anonymous: true);
        Add("get", "/health/ready", "healthReady", Shape(typeof(PlatformHealth)), "business-release-not-admitted", anonymous: true, success: 503);
        Add("get", Path, "openApiContract", null, "static-contract", anonymous: true);
        Add("get", "/api/platform/metadata", "platformMetadata", Object(("contractVersion", new() { ["type"] = "integer", ["const"] = 1 }),
            ("status", new() { ["type"] = "string", ["enum"] = Array(["foundation_only", "read_only_adapter"]) })), "identity-observation", "platform.status");
        Add("get", "/api/auth/csrf", "authCsrf", Object(("token", new() { ["type"] = Array(["string", "null"]) })), "antiforgery-bootstrap", anonymous: true);
        Add("post", "/api/auth/login", "authLogin", Shape(typeof(SessionView)), "legacy-identity-provider-required", anonymous: true, request: typeof(LoginRequest));
        Add("get", "/api/auth/session", "authSession", Shape(typeof(SessionView)), "authenticated-session");
        Add("post", "/api/auth/session/continue", "authContinue", Shape(typeof(SessionView)), "authenticated-explicit-activity");
        Add("post", "/api/auth/logout", "authLogout", null, "authenticated-session", success: 204);
        Add("get", "/api/workspace", "workspace", Shape(typeof(WorkspaceView)), "authenticated-scoped-navigation");
        Add("get", "/api/documents/field-contract", "documentFieldContract", Shape(typeof(DocumentFieldContract)), "module-read-capability-required",
            parameters: new JsonArray(Parameter("kind", "query", new() { ["type"] = "string", ["enum"] = Array(["purchase-orders", "inbound-requests", "purchase-requests"]) }, true)));
        Add("get", "/api/documents/query-contract", "documentQueryContract", Shape(typeof(DocumentQueryContract)), "module-read-capability-required",
            parameters: new JsonArray(Parameter("kind", "query", new() { ["type"] = "string", ["enum"] = Array(["purchase-orders", "inbound-requests", "purchase-requests"]) }, true)));
        foreach (var (kind, header, line, headerName, lineName, maxId) in new[]
        {
            ("purchase-orders", typeof(PurchaseOrderHeaderFields), typeof(PurchaseOrderLineFields), "purchaseOrderHeader", "purchaseOrderLines", 30),
            ("inbound-requests", typeof(InboundRequestHeaderFields), typeof(InboundRequestLineFields), "inboundRequestHeader", "inboundRequestLines", 50)
        })
        foreach (var v2 in new[] { false, true })
        {
            var suffix = kind.Replace("-", "", StringComparison.Ordinal) + (v2 ? "V2" : "Legacy");
            var summary = schemas.Variant(typeof(DocumentSummary), suffix + "Summary", ["purchaseOrderHeader", "inboundRequestHeader"]);
            schemas.Required(summary, headerName, Shape(header));
            var page = schemas.Variant(typeof(DocumentPage), suffix + "Page");
            schemas.Property(page, "rows", new() { ["type"] = "array", ["items"] = Schemas.Ref(summary) });
            var detail = schemas.Variant(typeof(DocumentDetailPage), suffix + "Detail");
            schemas.Property(detail, "document", Schemas.Ref(summary));
            foreach (var (property, type) in new[] { ("purchaseOrderLines", typeof(PurchaseOrderLine)), ("inboundRequestLines", typeof(InboundRequestLine)) })
            {
                var lineSchema = schemas.Variant(type, suffix + property, ["fields"]);
                if (property == lineName) schemas.Required(lineSchema, "fields", Shape(line));
                var collection = new JsonObject { ["type"] = "array", ["items"] = Schemas.Ref(lineSchema) };
                if (property != lineName) collection["maxItems"] = 0;
                schemas.Property(detail, property, collection);
            }
            var path = (v2 ? "/api/v2/documents/" : "/api/documents/") + kind;
            Add("get", path, suffix + "List", Schemas.Ref(page), "qualified-read-provider-required", kind + ".read",
                parameters: ListParameters(v2,100,50));
            Add("get", path + "/detail", suffix + "Detail", Schemas.Ref(detail), "qualified-read-provider-required", kind + ".read",
                parameters: new JsonArray(Parameter("documentId", "query", String(maxId), true), Parameter("page", "query", Number(1000, 1)), Parameter("pageSize", "query", Number(100, 50))));
        }
        foreach (var v2 in new[] { false, true })
        {
            var suffix = v2 ? "V2" : "Legacy";
            var row = schemas.Variant(typeof(PurchaseRequestListRow), "PurchaseRequestRow" + suffix, ["fields"]);
            schemas.Required(row, "fields", Shape(typeof(PurchaseRequestHeaderFields)));
            var page = schemas.Variant(typeof(PurchaseRequestListPage), "PurchaseRequestPage" + suffix);
            schemas.Property(page, "rows", new() { ["type"] = "array", ["items"] = Schemas.Ref(row) });
            var list = schemas.Variant(typeof(PurchaseRequestScopedResponse<PurchaseRequestListPage>), "PurchaseRequestList" + suffix);
            schemas.Property(list, "data", Schemas.Ref(page));
            var read = schemas.Variant(typeof(PurchaseRequestReadback), "PurchaseRequestRead" + suffix, ["sourceFields"]);
            schemas.Required(read, "sourceFields", Shape(typeof(PurchaseRequestSourceFields)));
            var detail = schemas.Variant(typeof(PurchaseRequestScopedResponse<PurchaseRequestReadback>), "PurchaseRequestDetail" + suffix);
            schemas.Property(detail, "data", Schemas.Ref(read));
            var path = v2 ? "/api/v2/purchase-requests" : "/api/purchase-requests";
            Add("get", path, "purchaseRequestList" + suffix, Schemas.Ref(list), "qualified-read-provider-required", "purchase-requests.read",
                parameters: ListParameters(v2,50,20));
            Add("get", path + "/detail", "purchaseRequestDetail" + suffix, Schemas.Ref(detail), "qualified-read-provider-required", "purchase-requests.read",
                parameters: new JsonArray(Parameter("documentId", "query", String(50), true)));
        }
        Add("get", "/api/purchase-requests/workspace", "purchaseRequestWorkspace", Shape(typeof(PurchaseRequestScopedResponse<PurchaseRequestWorkspace>)),
            "writeAvailable-forced-false", "purchase-requests.read");
        Add("get", "/api/purchase-requests/lookup", "purchaseRequestLookup", Shape(typeof(PurchaseRequestScopedResponse<PurchaseRequestLookupPage>)),
            "branches-purposes-currencies-qualified-individually;items-objects-unqualified", "purchase-requests.read",
            parameters: new JsonArray(Parameter("kind", "query", new() { ["type"] = "string", ["enum"] = Array(["branches", "purposes", "currencies", "items", "objects"]) }, true),
                Parameter("page", "query", Number(1000, 1)), Parameter("search", "query", String(100))));
        foreach (var save in new[] { true, false })
        foreach (var lookup in new[] { false, true })
        {
            var action = save ? "save" : "submit";
            var path = "/api/purchase-requests/" + action + (lookup ? "/lookup" : "");
            Add("post", path, "purchaseRequest" + action + (lookup ? "Lookup" : "Command"),
                lookup ? Shape(typeof(PurchaseRequestScopedResponse<PurchaseRequestLookupResult>)) : Shape(typeof(PurchaseRequestScopedResponse<PurchaseRequestCommandResult>)),
                "default-provider-unavailable;target-runtime-acceptance-required", request: save ? typeof(SavePurchaseRequestDraft) : typeof(SubmitPurchaseRequest),
                parameters: new JsonArray(Parameter("Origin", "header", String(), true), Parameter("X-Purchase-Scope", "header", String(), true)));
        }
        Add("get", "/api/inbound-requests/draft", "inboundDraftRead", Shape(typeof(InboundDraftWorkspace)), "default-provider-unavailable;target-runtime-acceptance-required",
            parameters: new JsonArray(Parameter("documentId", "query", String(50), true), Parameter("X-Inbound-Scope", "header", String()),
                Parameter("Origin", "header", String()), Parameter("Sec-Fetch-Site", "header", new() { ["type"] = "string", ["const"] = "same-origin" })));
        foreach (var action in new[] { "save", "send-to-warehouse", "reconcile" })
            Add("post", "/api/inbound-requests/draft/" + action, "inboundDraft" + action.Replace("-", "", StringComparison.Ordinal),
                Shape(typeof(InboundDraftCommandResponse)), "default-provider-unavailable;target-runtime-acceptance-required", request: typeof(InboundDraftCommand),
                parameters: new JsonArray(Parameter("Origin", "header", String(), true), Parameter("X-Inbound-Scope", "header", String(), true)));

        // The manual inbound parser admits optional DTO defaults, decimal strings
        // only, two existing-document actions, and no non-empty cost changes.
        schemas.SetRequired<InboundDraftCommand>(["operationId", "action", "documentId", "expectedStateEqualityToken", "header"]);
        schemas.SetRequired<InboundDraftHeader>(["documentDate", "orderNumber", "invoiceNo", "departurePoint", "destinationPoint", "orderTypeId", "branchId"]);
        schemas.SetRequired<InboundDraftDetailUpsert>(["itemId"]);
        schemas.Property(nameof(InboundDraftCommand), "action", new() { ["type"] = "string", ["enum"] = Array(["Save", "SendToWarehouse"]) });
        schemas.Property(nameof(InboundDraftCommand), "costChanges", new() { ["type"] = Array(["array", "null"]), ["items"] = Shape(typeof(InboundDraftCostInput)), ["maxItems"] = 0 });
        schemas.Property(nameof(PurchaseRequestLineChange), "kind", new() { ["type"] = "string", ["enum"] = Array(["Update", "Remove"]) });
        schemas.Property(nameof(SavePurchaseRequestDraft), "lineChanges", new() { ["type"] = "array", ["items"] = Shape(typeof(PurchaseRequestLineChange)), ["maxItems"] = 500 });
        foreach (var type in new[] { typeof(SavePurchaseRequestDraft), typeof(SubmitPurchaseRequest) })
            schemas.Property(type.Name, "expectedStateToken", new() { ["type"] = "string", ["pattern"] = "^prs1\\.[0-9A-Fa-f]{64}$" });
        schemas.Property(nameof(InboundDraftCommand), "documentId", new() { ["type"] = "string", ["minLength"] = 1, ["maxLength"] = 50 });
        schemas.Property(nameof(InboundDraftCommand), "expectedStateEqualityToken", new() { ["type"] = "string", ["pattern"] = "^[0-9A-F]{64}$" });
        var savePayload = schemas.Variant(typeof(InboundDraftCommand), "InboundDraftSavePayload");
        var sendPayload = schemas.Variant(typeof(InboundDraftCommand), "InboundDraftSendPayload");
        schemas.Property(savePayload, "action", new() { ["type"] = "string", ["const"] = "Save" });
        schemas.Property(savePayload, "header", Shape(typeof(InboundDraftHeader)));
        schemas.Property(savePayload, "note", new() { ["type"] = "null" });
        schemas.Property(sendPayload, "action", new() { ["type"] = "string", ["const"] = "SendToWarehouse" });
        schemas.Property(sendPayload, "header", new() { ["type"] = "null" });
        foreach (var (property, item) in new[] { ("detailUpserts", Shape(typeof(InboundDraftDetailUpsert))), ("removedDetailIds", String()) })
        {
            schemas.Property(savePayload, property, new() { ["type"] = Array(["array", "null"]), ["items"] = item.DeepClone(), ["maxItems"] = 500 });
            schemas.Property(sendPayload, property, new() { ["type"] = Array(["array", "null"]), ["items"] = item.DeepClone(), ["maxItems"] = 0 });
        }
        paths["/api/inbound-requests/draft/save"]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"] = Schemas.Ref(savePayload);
        paths["/api/inbound-requests/draft/send-to-warehouse"]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"] = Schemas.Ref(sendPayload);
        paths["/api/inbound-requests/draft/reconcile"]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"] = new JsonObject { ["oneOf"] = new JsonArray(Schemas.Ref(savePayload), Schemas.Ref(sendPayload)) };
        foreach (var (kind, head, line) in new[] {
            ("purchase-orders", typeof(PurchaseOrderHeaderFields), typeof(PurchaseOrderLineFields)),
            ("inbound-requests", typeof(InboundRequestHeaderFields), typeof(InboundRequestLineFields)),
            ("purchase-requests", typeof(PurchaseRequestHeaderFields), typeof(PurchaseRequestLineFields)) })
        {
            var fields = DocumentFieldCatalog.Get(kind) ?? throw new InvalidOperationException("Missing document field contract.");
            schemas.SourceMetadata(head, fields.Header);
            schemas.SourceMetadata(line, fields.Lines);
        }
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var screen=ErpScreenCatalog.Get(module)!;var path="/api/erp/"+module;var id=module.Replace("-","_",StringComparison.Ordinal);
            const string admission="Current-form source-backed read/CUD contract. Ordinary startup has no qualified write provider. Dedicated target acceptance and private command composition required.";
            var scope=Parameter("X-Medcom-Read-Scope","header",String(64),true);
            var documentParameters=new JsonArray(Parameter("branchId","query",String(50),true),Parameter("documentId","query",String(50),true));
            Add("get",path+"/screen",id+"_screen",Shape(typeof(ErpScopedResponse<ErpScreenDescription>)),admission,module+".read");
            Add("get",path,id+"_list",Shape(typeof(ErpScopedResponse<ErpDocumentPage>)),admission,module+".read",parameters:new JsonArray(
                Parameter("branchId","query",String(50),true),Parameter("page","query",Number(10000,1)),Parameter("pageSize","query",Number(100,20)),
                Parameter("search","query",String(100)),Parameter("dateFrom","query",String(10)),Parameter("dateTo","query",String(10)),Parameter("statusId","query",new(){["type"]="integer"})));
            var detailParameters=(JsonArray)documentParameters.DeepClone();detailParameters.Add(Parameter("page","query",Number(10000,1)));detailParameters.Add(Parameter("pageSize","query",Number(100,20)));
            Add("get",path+"/detail",id+"_detail",Shape(typeof(ErpScopedResponse<ErpDocumentDetail>)),admission,module+".read",parameters:detailParameters);
            var actionParameters=(JsonArray)documentParameters.DeepClone();actionParameters[1]!["required"]=false;
            Add("get",path+"/actions",id+"_actions",Shape(typeof(ErpScopedResponse<IReadOnlyList<ErpActionState>>)),admission,module+".read",parameters:actionParameters);
            if(screen.Actions.Any(action=>action.Operation=="contract-info"))Add("get",path+"/contract-info",id+"_contract_info",
                Shape(typeof(ErpScopedResponse<ErpContractInfo>)),admission,module+".read",parameters:(JsonArray)documentParameters.DeepClone());
            void Post(string suffix,string operation,Type request,Type response)=>Add("post",path+suffix,id+"_"+operation,Shape(response),admission,module+".read",request:request,
                parameters:new JsonArray(scope.DeepClone(),Parameter("Origin","header",String(),true)));
            Post("/options","options",typeof(ErpLookupQuery),typeof(ErpScopedResponse<ErpChoicePage>));
            if(module is "sales-orders" or "internal-transfer-requests")Post("/actions/send-pm/options","pm_options",typeof(ErpPmLookupQuery),typeof(ErpScopedResponse<ErpChoicePage>));
            Post("/commands/lookup","command_lookup",typeof(ErpCommandLookupRequest),typeof(ErpScopedResponse<ErpCommandObservation>));
            if(module is not ("warehouse-qr" or "sales-qr"))
            {
                Post("/selection","selection",typeof(ErpSelectionRequest),typeof(ErpScopedResponse<ErpDraftSelection>));
                Post("/paste/validate","paste_validate",typeof(ErpPasteRequest),typeof(ErpScopedResponse<ErpDraftSelection>));
                Post("/create","create",typeof(ErpCreateRequest),typeof(ErpCommandResult));
                Post("/save","save",typeof(ErpSaveRequest),typeof(ErpCommandResult));Post("/delete","delete",typeof(ErpDeleteRequest),typeof(ErpCommandResult));
                var header=Shape(ErpInputRules.HeaderType(module)!);var line=Shape(ErpInputRules.LineType(module)!);
                paths[path+"/create"]!["post"]!["x-medcom-typed-header"]=header.DeepClone();paths[path+"/create"]!["post"]!["x-medcom-typed-line"]=line.DeepClone();
                paths[path+"/save"]!["post"]!["x-medcom-typed-header"]=header.DeepClone();paths[path+"/save"]!["post"]!["x-medcom-typed-line"]=line.DeepClone();
                var typedHeader=ErpInputRules.HeaderType(module)!;var typedLine=ErpInputRules.LineType(module)!;
                schemas.Values[typedHeader.Name]!["required"]=Array(screen.Fields["header"].Where(f=>f.Writable&&!f.Nullable).Select(f=>f.Name));
                schemas.Values[typedLine.Name]!["required"]=Array(screen.Fields["lines"].Where(f=>f.Writable&&!f.Nullable).Select(f=>f.Name));
                var newLine=schemas.Variant(typeof(ErpNewLine),"Erp_"+id+"_new_line");schemas.Property(newLine,"values",(JsonObject)line.DeepClone());
                var createHeader=(JsonObject)header.DeepClone();
                var dateField=module=="purchase-requests"?"purchaseDate":"documentDate";
                createHeader["required"]=Array([dateField]);
                createHeader["properties"]=new JsonObject{[dateField]=new JsonObject{["type"]="string",
                    ["pattern"]=@"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$",
                    ["description"]="Required when creating a numbered document; ERP calendar date/time, yyyy-MM-ddTHH:mm:ss.fff."}};
                var create=schemas.Variant(typeof(ErpCreateRequest),"Erp_"+id+"_create");schemas.Property(create,"header",createHeader);
                schemas.Property(create,"lines",new(){["type"]="array",["minItems"]=1,["maxItems"]=500,["items"]=Schemas.Ref(newLine)});
                paths[path+"/create"]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"]=Schemas.Ref(create);
                var changes=new JsonArray();
                foreach(var kind in new[]{"Add","Update","Remove"})
                {
                    var change=schemas.Variant(typeof(ErpLineChange),"Erp_"+id+"_line_"+kind.ToLowerInvariant());
                    schemas.Property(change,"kind",new(){["type"]="string",["const"]=kind});
                    schemas.Property(change,"lineId",kind=="Add"?new(){["type"]="null"}:String(50));
                    schemas.Property(change,"clientLineKey",kind=="Add"?String(64):new(){["type"]="null"});
                    schemas.Property(change,"values",kind=="Remove"?new JsonObject{["type"]="null"}:(JsonObject)line.DeepClone());
                    schemas.Values[change]!["required"]=Array(kind=="Add"?["kind","clientLineKey","values"]:kind=="Update"?["kind","lineId","values"]:["kind","lineId"]);
                    changes.Add(Schemas.Ref(change));
                }
                var save=schemas.Variant(typeof(ErpSaveRequest),"Erp_"+id+"_save");schemas.Property(save,"header",(JsonObject)header.DeepClone());
                schemas.Property(save,"lineChanges",new(){["type"]="array",["maxItems"]=500,["items"]=new JsonObject{["oneOf"]=changes}});
                paths[path+"/save"]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"]=Schemas.Ref(save);
                var paste=schemas.Variant(typeof(ErpPasteRequest),"Erp_"+id+"_paste");
                schemas.Property(paste,"rows",new(){["type"]="array",["minItems"]=1,["maxItems"]=500,["items"]=line.DeepClone()});
                paths[path+"/paste/validate"]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"]=Schemas.Ref(paste);
            }
            foreach(var action in screen.Actions.Where(action=>action.Operation is "submit" or "send-purchase-order" or "send-pm" or "recall"))
            {
                Post("/actions/"+action.Operation,action.Operation.Replace("-","_",StringComparison.Ordinal),typeof(ErpActionRequest),typeof(ErpCommandResult));
                paths[path+"/actions/"+action.Operation]!["post"]!["x-medcom-typed-payload"]=action.Operation=="send-pm"
                    ?Shape(module=="sales-orders"?typeof(ErpSendOrderPm):typeof(ErpSendTransferPm)):Object();
                var actionPayload=schemas.Variant(typeof(ErpActionRequest),"Erp_"+id+"_"+action.Operation.Replace('-','_')+"_request");
                schemas.Property(actionPayload,"payload",(JsonObject)paths[path+"/actions/"+action.Operation]!["post"]!["x-medcom-typed-payload"]!.DeepClone());
                paths[path+"/actions/"+action.Operation]!["post"]!["requestBody"]!["content"]!["application/json"]!["schema"]=Schemas.Ref(actionPayload);
            }
            if(module is "warehouse-qr" or "sales-qr")foreach(var scan in new[]{"add","delete"})Post("/qr/"+scan,"scan_"+scan,typeof(ErpScanRequest),typeof(ErpCommandResult));
            var sectionSchemas=new JsonObject();
            foreach(var section in screen.Fields)
            {
                var name="Erp_"+id+"_"+section.Key+"_fields";var properties=new JsonObject();
                foreach(var column in section.Value)
                {
                    var type=column.SqlType switch{"bit"=>"boolean","int" or "tinyint" or "smallint" or "bigint"=>"integer","float" or "real"=>"number",_=>"string"};
                    JsonObject field=new(){["type"]=type};
                    if(column.Nullable)field=new(){["anyOf"]=new JsonArray(field,new JsonObject{["type"]="null"})};
                    field["x-medcom-source-column"]=column.Column;field["x-medcom-sql-type"]=column.SqlType;
                    field["x-medcom-sql-type-arguments"]=column.TypeArguments;field["x-medcom-sql-nullable"]=column.Nullable;field["x-medcom-writable"]=column.Writable;
                    properties[column.Name]=field;
                }
                schemas.Values[name]=new JsonObject{["type"]="object",["additionalProperties"]=false,["properties"]=properties,["required"]=Array(section.Value.Select(column=>column.Name))};
                sectionSchemas[section.Key]=Schemas.Ref(name);
            }
            paths[path+"/detail"]!["get"]!["x-medcom-full-field-sections"]=sectionSchemas;
            paths[path]!["get"]!["x-medcom-full-header"]=sectionSchemas["header"]!.DeepClone();
            var documentRow=schemas.Variant(typeof(ErpDocumentRow),"Erp_"+id+"_document_row");
            schemas.Property(documentRow,"header",(JsonObject)sectionSchemas["header"]!.DeepClone());
            var documentPage=schemas.Variant(typeof(ErpDocumentPage),"Erp_"+id+"_document_page");
            schemas.Property(documentPage,"rows",new(){["type"]="array",["items"]=Schemas.Ref(documentRow)});
            var listResponse=schemas.Variant(typeof(ErpScopedResponse<ErpDocumentPage>),"Erp_"+id+"_list_response");
            schemas.Property(listResponse,"data",Schemas.Ref(documentPage));
            paths[path]!["get"]!["responses"]!["200"]!["content"]!["application/json"]!["schema"]=Schemas.Ref(listResponse);
            var detail=schemas.Variant(typeof(ErpDocumentDetail),"Erp_"+id+"_detail");
            schemas.Property(detail,"header",(JsonObject)sectionSchemas["header"]!.DeepClone());
            foreach(var section in screen.Fields.Where(s=>s.Key!="header"))
            {
                var row=schemas.Variant(typeof(ErpLineRow),"Erp_"+id+"_"+section.Key+"_row");schemas.Property(row,"fields",(JsonObject)sectionSchemas[section.Key]!.DeepClone());
                var page=schemas.Variant(typeof(ErpLinePage),"Erp_"+id+"_"+section.Key+"_page");schemas.Property(page,"rows",new(){["type"]="array",["items"]=Schemas.Ref(row)});
                schemas.Property(detail,section.Key,Schemas.Ref(page));
            }
            foreach(var absent in new[]{"history","comparison"}.Where(s=>!screen.Fields.ContainsKey(s)))schemas.Property(detail,absent,new(){["type"]="null"});
            var detailResponse=schemas.Variant(typeof(ErpScopedResponse<ErpDocumentDetail>),"Erp_"+id+"_detail_response");schemas.Property(detailResponse,"data",Schemas.Ref(detail));
            paths[path+"/detail"]!["get"]!["responses"]!["200"]!["content"]!["application/json"]!["schema"]=Schemas.Ref(detailResponse);
        }
        schemas.SetRequired<ErpLookupQuery>(["branchId","lookupId"]);
        schemas.SetRequired<ErpPmLookupQuery>(["branchId"]);
        schemas.Property(nameof(ErpPmLookupQuery),"role",new(){["type"]="string",["enum"]=Array(["primary","supporting"]),["default"]="primary"});
        schemas.SetRequired<ErpSelectionRequest>(["branchId","sourceId","selectedKeys"]);
        schemas.SetRequired<ErpSendOrderPm>(["pmId"]);
        schemas.SetRequired<ErpSendTransferPm>(["primaryPmId","supportingPmId"]);
        return new()
        {
            ["openapi"] = "3.1.1", ["info"] = new JsonObject { ["title"] = "Medcom backend HTTP contract", ["version"] = "2.0.0",
                ["description"] = "Registered HTTP boundaries include full fields with pagination, seven current ERP forms across six screen groups, fixed typed CUD/workflow intents, dropdowns and draft selection/paste. A route/schema never enables commands or proves target SQL/business acceptance." },
            ["servers"] = new JsonArray(new JsonObject { ["url"] = "/", ["description"] = "This backend origin. FE uses its separately configured same-origin BFF." }),
            ["paths"] = paths,
            ["components"] = new JsonObject
            {
                ["schemas"] = schemas.Values,
                ["securitySchemes"] = new JsonObject
                {
                    ["SessionCookie"] = new JsonObject { ["type"] = "apiKey", ["in"] = "cookie", ["name"] = "__Host-Medcom.Session" },
                    ["CsrfCookie"] = new JsonObject { ["type"] = "apiKey", ["in"] = "cookie", ["name"] = "__Host-Medcom.Csrf" },
                    ["CsrfToken"] = new JsonObject { ["type"] = "apiKey", ["in"] = "header", ["name"] = "X-CSRF-TOKEN" }
                }
            },
            ["x-medcom-business-release"] = "not-admitted",
            ["x-medcom-command-rules"] = "HTTPS, authenticated live session, CSRF cookie plus token, exact same backend Origin, current scope header and original immutable DTO; decoded body <=1048576 bytes. Purchase: every DTO property required including nulls; Add rejected; numeric outcomes. Inbound: Save/SendToWarehouse only, decimal strings, SQL wall-clock dates, no cost edits; string outcomes. Pending/Absent/Unavailable/OutcomeUnknown never authorize redispatch.",
            ["x-medcom-read-scope"] = "Use X-Medcom-Session-Scope and X-Medcom-Read-Scope; purchase {scopeKey,data} envelopes. Invalidate state on identity/authority/branch/scope changes. Follow hasMore for paged detail lines."
        };
    }

    private static JsonArray Array(IEnumerable<string> values) => new(values.Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());

    private sealed class Schemas
    {
        internal JsonObject Values { get; } = new();
        private readonly NullabilityInfoContext nullability = new();
        internal static JsonObject Ref(string name) => new() { ["$ref"] = "#/components/schemas/" + name };
        private static string Name(Type type) => type.IsGenericType
            ? type.Name.Split('`')[0] + "_" + string.Join("_", type.GetGenericArguments().Select(Name)) : type.Name;
        internal JsonObject Shape(Type type, bool nullable = false, bool decimalString = false)
        {
            if (Nullable.GetUnderlyingType(type) is {} value) { type = value; nullable = true; }
            JsonObject schema;
            if (type == typeof(string) || type == typeof(Guid) || type == typeof(DateTime) || type == typeof(DateTimeOffset) || decimalString)
            {
                schema = new() { ["type"] = "string" };
                if (type == typeof(Guid)) schema["format"] = "uuid";
                if (type == typeof(DateTimeOffset)) schema["format"] = "date-time";
                if (type == typeof(DateTime)) schema["description"] = "SQL wall-clock datetime for document fields; receipt CommittedAtUtc is UTC. No inferred timezone conversion.";
                if (decimalString) schema["pattern"] = @"^-?[0-9]+(?:\.[0-9]+)?$";
            }
            else if (type == typeof(bool)) schema = new() { ["type"] = "boolean" };
            else if (type == typeof(int) || type == typeof(long)||type==typeof(short)||type==typeof(byte)) schema = new() { ["type"] = "integer", ["format"] = type == typeof(long) ? "int64" : "int32" };
            else if(type==typeof(JsonElement)||type==typeof(object))schema=new(){["description"]="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."};
            else if(type.IsGenericType&&type.GetGenericTypeDefinition()==typeof(IReadOnlyDictionary<,>)&&type.GetGenericArguments()[0]==typeof(string))
                schema=new(){["type"]="object",["additionalProperties"]=Shape(type.GetGenericArguments()[1])};
            else if (type == typeof(double) || type == typeof(float) || type == typeof(decimal)) schema = new() { ["type"] = "number" };
            else if (type.IsEnum)
            {
                var strings = type.GetCustomAttribute<JsonConverterAttribute>()?.ConverterType?.Name.StartsWith("JsonStringEnumConverter", StringComparison.Ordinal) == true;
                var name = Name(type);
                if (!Values.ContainsKey(name)) Values[name] = new JsonObject { ["type"] = strings ? "string" : "integer",
                    ["enum"] = new JsonArray(Enum.GetValues(type).Cast<object>().Select(v => strings ? (JsonNode?)JsonValue.Create(v.ToString()) : JsonValue.Create(Convert.ToInt32(v, System.Globalization.CultureInfo.InvariantCulture))).ToArray()) };
                schema = Ref(name);
            }
            else if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IReadOnlyList<>)) schema = new() { ["type"] = "array", ["items"] = Shape(type.GetGenericArguments()[0]) };
            else
            {
                if (type.Assembly != typeof(LoginRequest).Assembly) throw new InvalidOperationException("Undeclared HTTP contract type.");
                var name = Name(type);
                if (!Values.ContainsKey(name))
                {
                    var properties = new JsonObject(); var required = new List<string>();
                    Values[name] = new JsonObject { ["type"] = "object", ["additionalProperties"] = false, ["properties"] = properties };
                    foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                    {
                        var ignore = property.GetCustomAttribute<JsonIgnoreAttribute>();
                        if (ignore?.Condition == JsonIgnoreCondition.Always) continue;
                        var field = property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name ?? JsonNamingPolicy.CamelCase.ConvertName(property.Name);
                        properties[field] = Shape(property.PropertyType, nullability.Create(property).ReadState == NullabilityState.Nullable,
                            ((property.GetCustomAttribute<JsonNumberHandlingAttribute>()?.Handling ?? JsonNumberHandling.Strict) & JsonNumberHandling.WriteAsString) != 0);
                        if (ignore?.Condition is not (JsonIgnoreCondition.WhenWritingNull or JsonIgnoreCondition.WhenWritingDefault)) required.Add(field);
                    }
                    Values[name]!["required"] = Array(required);
                }
                schema = Ref(name);
            }
            return nullable ? new() { ["anyOf"] = new JsonArray(schema, new JsonObject { ["type"] = "null" }) } : schema;
        }
        internal string Variant(Type type, string name, string[]? remove = null)
        {
            _ = Shape(type); Values[name] = Values[Name(type)]!.DeepClone();
            foreach (var field in remove ?? [])
            {
                ((JsonObject)Values[name]!["properties"]!).Remove(field);
                Values[name]!["required"] = Array(((JsonArray)Values[name]!["required"]!).Select(n => n!.GetValue<string>()).Where(n => n != field));
            }
            return name;
        }
        internal void Property(string name, string field, JsonObject schema) => Values[name]!["properties"]![field] = schema;
        internal void Required(string name, string field, JsonObject schema)
        {
            Property(name, field, schema);
            var required = (JsonArray)Values[name]!["required"]!;
            if (!required.Any(n => n!.GetValue<string>() == field)) required.Add(field);
        }
        internal void SetRequired<T>(string[] fields) => Values[Name(typeof(T))]!["required"] = Array(fields);
        internal void SourceMetadata(Type type, DocumentFieldTable table)
        {
            _ = Shape(type);
            var owner = (JsonObject)Values[Name(type)]!;
            owner["x-medcom-source-table"] = table.Table;
            foreach (var field in table.Fields)
            {
                var name = field.JsonPath.Split('.')[^1];
                var property = (JsonObject)owner["properties"]![name]!;
                property["x-medcom-sql-type"] = field.SqlType;
                property["x-medcom-source-column"] = field.Column;
                property["x-medcom-json-path"] = field.JsonPath;
                property["x-medcom-list-json-path"] = field.ListJsonPath;
                property["x-medcom-sql-nullable"] = field.Nullable;
                if (field.Format is not null)
                {
                    property["description"] = field.Format;
                    var primitive = property["anyOf"] is JsonArray alternatives ? alternatives[0]! : property;
                    if (field.Format == "decimal-string") primitive["pattern"] = @"^-?[0-9]+(?:\.[0-9]+)?$";
                    if (field.Format == "sql-datetime-without-timezone") primitive["pattern"] = @"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$";
                }
            }
        }
    }
}
