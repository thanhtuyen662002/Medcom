using System.Formats.Asn1;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace Medcom.LocalFrontendHost;

public sealed class CertificateSelectionException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

/// <summary>Reads an explicitly selected, already trusted development certificate. Never exports keys or changes a store.</summary>
public static class DevelopmentCertificateSelector
{
    private const string ServerAuthenticationOid = "1.3.6.1.5.5.7.3.1";
    private const string DevelopmentCertificateOid = "1.3.6.1.4.1.311.84.1.1";

    public static X509Certificate2 Select(string thumbprint)
    {
        if (thumbprint.Length != 40 || !thumbprint.All(char.IsAsciiHexDigit))
            throw new CertificateSelectionException("certificate_thumbprint_invalid");
        if (!OperatingSystem.IsWindows())
            throw new CertificateSelectionException("certificate_platform_unsupported");

        X509Certificate2? selected = null;
        X509Certificate2Collection? certificates = null;
        try
        {
            using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
            certificates = store.Certificates;
            var matches = certificates.Cast<X509Certificate2>()
                .Where(certificate => string.Equals(certificate.Thumbprint, thumbprint, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (matches.Length != 1)
                throw new CertificateSelectionException(matches.Length == 0 ? "certificate_missing" : "certificate_ambiguous");
            Validate(matches[0]);
            selected = matches[0];
            return selected;
        }
        catch (Exception exception) when (exception is CryptographicException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            throw new CertificateSelectionException("certificate_store_unavailable");
        }
        finally
        {
            if (certificates is not null)
                foreach (var certificate in certificates)
                    if (!ReferenceEquals(certificate, selected)) certificate.Dispose();
        }
    }

    public static void Validate(X509Certificate2 certificate, DateTimeOffset? verificationTime = null)
    {
        var now = (verificationTime ?? DateTimeOffset.UtcNow).UtcDateTime;
        if (certificate.NotBefore.ToUniversalTime() > now || certificate.NotAfter.ToUniversalTime() <= now)
            throw new CertificateSelectionException("certificate_expired_or_not_yet_valid");
        EnsureAccessiblePrivateKey(certificate);
        if (!HasLocalhostSan(certificate))
            throw new CertificateSelectionException("certificate_localhost_san_required");
        if (!certificate.Extensions.Cast<X509Extension>().Any(extension => extension.Oid?.Value == DevelopmentCertificateOid))
            throw new CertificateSelectionException("certificate_development_marker_required");

        try
        {
            var usages = certificate.Extensions.Cast<X509Extension>()
                .Where(extension => extension.Oid?.Value == "2.5.29.37")
                .Select(extension => new X509EnhancedKeyUsageExtension(extension, extension.Critical)).ToArray();
            if (usages.Length != 1 || !usages[0].EnhancedKeyUsages.Cast<Oid>().Any(oid => oid.Value == ServerAuthenticationOid))
                throw new CertificateSelectionException("certificate_server_auth_required");
            using var chain = new X509Chain();
            chain.ChainPolicy.TrustMode = X509ChainTrustMode.System;
            chain.ChainPolicy.VerificationFlags = X509VerificationFlags.NoFlag;
            // Development certificates are local self-signed certificates. Validation must not fetch certificates or CRLs.
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            chain.ChainPolicy.DisableCertificateDownloads = true;
            chain.ChainPolicy.VerificationTime = now;
            chain.ChainPolicy.ApplicationPolicy.Add(new Oid(ServerAuthenticationOid));
            if (!chain.Build(certificate)) throw new CertificateSelectionException("certificate_not_system_trusted");
        }
        catch (Exception exception) when (exception is CryptographicException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            throw new CertificateSelectionException("certificate_validation_failed");
        }
    }

    public static void EnsureAccessiblePrivateKey(X509Certificate2 certificate)
    {
        if (!certificate.HasPrivateKey) throw new CertificateSelectionException("certificate_private_key_unavailable");
        try
        {
            ReadOnlySpan<byte> challenge = "Medcom local TLS key accessibility check"u8;
            using var rsa = certificate.GetRSAPrivateKey();
            if (rsa is not null)
            {
                _ = rsa.SignData(challenge, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                return;
            }
            using var ecdsa = certificate.GetECDsaPrivateKey();
            if (ecdsa is not null)
            {
                _ = ecdsa.SignData(challenge, HashAlgorithmName.SHA256);
                return;
            }
        }
        catch (Exception exception) when (exception is CryptographicException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            throw new CertificateSelectionException("certificate_private_key_unavailable");
        }
        throw new CertificateSelectionException("certificate_private_key_unavailable");
    }

    private static bool HasLocalhostSan(X509Certificate2 certificate)
    {
        var extensions = certificate.Extensions.Cast<X509Extension>().Where(extension => extension.Oid?.Value == "2.5.29.17").ToArray();
        if (extensions.Length != 1) return false;
        try
        {
            var reader = new AsnReader(extensions[0].RawData, AsnEncodingRules.DER);
            var names = reader.ReadSequence();
            var found = false;
            while (names.HasData)
            {
                var tag = names.PeekTag();
                if (tag.TagClass == TagClass.ContextSpecific && tag.TagValue == 2)
                    found |= string.Equals(names.ReadCharacterString(UniversalTagNumber.IA5String, new Asn1Tag(TagClass.ContextSpecific, 2)), "localhost", StringComparison.OrdinalIgnoreCase);
                else
                    names.ReadEncodedValue();
            }
            reader.ThrowIfNotEmpty();
            return found;
        }
        catch (AsnContentException)
        {
            return false;
        }
    }
}
