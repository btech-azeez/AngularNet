using System.ComponentModel.DataAnnotations;

namespace GramPanchayat.Api.Infrastructure;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required] public string Issuer { get; set; } = "GramPanchayat.Api";
    [Required] public string Audience { get; set; } = "GramPanchayat.Ui";

    /// <summary>HMAC-SHA256 signing key. Must be at least 32 bytes. Override via configuration/user-secrets.</summary>
    [Required, MinLength(32)] public string SigningKey { get; set; } = string.Empty;

    [Range(5, 24 * 60)] public int VoterTokenMinutes { get; set; } = 30;
    [Range(5, 24 * 60)] public int AdminTokenMinutes { get; set; } = 8 * 60;
}

public sealed class DemoOptions
{
    public const string SectionName = "Demo";

    /// <summary>When true, OTPs are returned in the API response (no SMS gateway) and the demo reset endpoint is enabled.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Seed the database with a sample village, voters and nominations on startup.</summary>
    public bool SeedOnStartup { get; set; } = true;

    /// <summary>Phase the seeded election starts in (handy for demos: Polling lets you vote right away).</summary>
    public string InitialPhase { get; set; } = "Polling";
}

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>"SqlServer" (default) or "Sqlite".</summary>
    public string Provider { get; set; } = "SqlServer";
}
