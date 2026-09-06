using System.Net.Http.Headers;
using System.Net.Http.Json;
using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GramPanchayat.Api.Tests;

/// <summary>
/// Boots the real API on top of an in-memory SQLite database (one per factory instance),
/// seeded with the demo data in the requested starting phase.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly ElectionPhase _initialPhase;

    public ApiFactory(ElectionPhase initialPhase = ElectionPhase.Polling)
    {
        _initialPhase = initialPhase;
        _connection.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Database:Provider", "Sqlite");
        builder.UseSetting("Database:AutoMigrate", "true");
        builder.UseSetting("ConnectionStrings:Default", "DataSource=:memory:");
        builder.UseSetting("Demo:Enabled", "true");
        builder.UseSetting("Demo:SeedOnStartup", "true");
        builder.UseSetting("Demo:InitialPhase", _initialPhase.ToString());
        builder.UseSetting("Jwt:SigningKey", "unit-test-signing-key-that-is-definitely-32-bytes-long!");

        builder.ConfigureServices(services =>
        {
            // Replace the DbContext registration so every scope shares the single open in-memory connection.
            var descriptors = services.Where(d =>
                d.ServiceType == typeof(DbContextOptions<ElectionDbContext>) ||
                d.ServiceType == typeof(DbContextOptions) ||
                d.ServiceType == typeof(ElectionDbContext)).ToList();
            foreach (var d in descriptors) services.Remove(d);

            services.AddDbContext<ElectionDbContext>(o => o.UseSqlite(_connection));
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }

    // ---- helpers ------------------------------------------------------------------------

    public async Task<HttpClient> AdminClientAsync(string username = DemoSeeder.AdminUsername, string password = DemoSeeder.AdminPassword)
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/admin/login", new AdminLoginRequest(username, password));
        res.EnsureSuccessStatusCode();
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return client;
    }

    public async Task<(HttpClient Client, VoterDto Voter)> VoterClientAsync(string? epic = null, bool mustNotHaveVoted = true)
    {
        epic ??= await FirstEpicAsync(mustNotHaveVoted);
        var client = CreateClient();

        var otpRes = await client.PostAsJsonAsync("/api/auth/voter/request-otp", new RequestOtpRequest(epic));
        otpRes.EnsureSuccessStatusCode();
        var otp = (await otpRes.Content.ReadFromJsonAsync<OtpResponse>())!;

        var loginRes = await client.PostAsJsonAsync("/api/auth/voter/login", new VoterLoginRequest(epic, otp.DemoOtp!));
        loginRes.EnsureSuccessStatusCode();
        var auth = (await loginRes.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);

        var voter = (await client.GetFromJsonAsync<VoterDto>("/api/voters/me"))!;
        return (client, voter);
    }

    public async Task<string> FirstEpicAsync(bool mustNotHaveVoted)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ElectionDbContext>();
        return await db.Voters.Where(v => !mustNotHaveVoted || !v.HasVoted)
            .OrderBy(v => v.Id).Select(v => v.EpicNumber).FirstAsync();
    }

    public async Task<int> CurrentElectionIdAsync()
    {
        var e = await CreateClient().GetFromJsonAsync<ElectionDto>("/api/elections/current");
        return e!.Id;
    }
}
