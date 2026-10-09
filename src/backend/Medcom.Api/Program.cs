using Medcom.Api;

// Export the exact public contract without loading private configuration, building
// the host or starting SQL/legacy dependencies. No business operation is dispatched.
if (args.Any(value => value.StartsWith("--print-api-contract", StringComparison.Ordinal)))
{
    if (args is ["--print-api-contract"]) Console.WriteLine(ApiContractCatalog.Json);
    else { Console.Error.WriteLine("Use --print-api-contract as the only argument."); Environment.ExitCode = 64; }
    return;
}

// One-shot diagnostics must never build/start the host or its background services.
if (PurchaseRequestPilotPreflight.IsRequested(args))
{
    Environment.ExitCode = await PurchaseRequestPilotPreflight.RunAsync(args, Console.Out);
    return;
}

if (ErpConfigurationProbe.IsRequested(args))
{
    Environment.ExitCode = await ErpConfigurationProbe.RunAsync(args, Console.Out);
    return;
}

if (DatabaseConnectionProbe.IsRequested(args))
{
    Environment.ExitCode = await DatabaseConnectionProbe.RunAsync(args, Console.Out);
    return;
}

if (PurchaseRequestPilotStartup.IsRequested(args))
{
    await PurchaseRequestPilotStartup.Build(args).RunAsync();
    return;
}

await ApiHost.Build(args).RunAsync();
