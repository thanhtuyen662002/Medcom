using Medcom.Api;

// One-shot diagnostics must never build/start the host or its background services.
if (DatabaseConnectionProbe.IsRequested(args))
{
    Environment.ExitCode = await DatabaseConnectionProbe.RunAsync(args, Console.Out);
    return;
}

await ApiHost.Build(args).RunAsync();
