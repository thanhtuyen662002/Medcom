using Medcom.Api;

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
