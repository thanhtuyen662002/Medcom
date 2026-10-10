# Build from the repository root: root MSBuild/SDK/NuGet files are required.
FROM mcr.microsoft.com/dotnet/sdk:10.0.401-noble AS build
WORKDIR /source
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1
COPY global.json Directory.Build.props Directory.Build.targets NuGet.config ./
# .dockerignore admits only reviewed public backend source and lockfiles.
COPY src/backend/ ./src/backend/
# Exactly one sanitized finite catalog is embedded by Medcom.Contracts.
COPY inventories/erp/20261010/six-screen-catalog.json ./inventories/erp/20261010/six-screen-catalog.json
RUN dotnet restore src/backend/Medcom.Api/Medcom.Api.csproj --locked-mode \
    && dotnet restore src/backend/Medcom.LegacyPasswordWorker/Medcom.LegacyPasswordWorker.csproj --locked-mode
RUN dotnet publish src/backend/Medcom.Api/Medcom.Api.csproj \
        --configuration Release --no-restore -p:UseAppHost=false --output /out/api \
    && dotnet publish src/backend/Medcom.LegacyPasswordWorker/Medcom.LegacyPasswordWorker.csproj \
        --configuration Release --no-restore -p:UseAppHost=false --output /out/password-worker

FROM mcr.microsoft.com/dotnet/aspnet:10.0.12-noble AS runtime
WORKDIR /app
# Foundation staging only. Private ERP inputs are never part of this image.
ENV ASPNETCORE_ENVIRONMENT=Production \
    Legacy__Enabled=false \
    Legacy__EnableReadOnlyPilots=false
COPY --from=build /out/api/ ./
COPY --from=build /out/password-worker/ ./password-worker/
USER $APP_UID
EXPOSE 8080
# Railway supplies PORT at runtime. exec preserves signals and the exit status.
ENTRYPOINT ["sh", "-c", "exec dotnet Medcom.Api.dll --urls \"http://0.0.0.0:${PORT:-8080}\""]
