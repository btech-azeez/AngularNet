using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using GramPanchayat.Api.Endpoints;
using GramPanchayat.Api.Infrastructure;
using GramPanchayat.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// ---- Options ------------------------------------------------------------------------
builder.Services.AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.Configure<DemoOptions>(builder.Configuration.GetSection(DemoOptions.SectionName));
builder.Services.Configure<DatabaseOptions>(builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.AddSingleton(TimeProvider.System);

// ---- Database -----------------------------------------------------------------------
var dbOptions = builder.Configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>() ?? new DatabaseOptions();
var connectionString = builder.Configuration.GetConnectionString("Default")
                       ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

builder.Services.AddDbContext<ElectionDbContext>(o =>
{
    if (dbOptions.Provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
        o.UseSqlite(connectionString);
    else
        o.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure(maxRetryCount: 5));

    if (builder.Environment.IsDevelopment())
        o.EnableSensitiveDataLogging().EnableDetailedErrors();
});

// ---- Application services -------------------------------------------------------------
builder.Services.AddScoped<ElectionService>();
builder.Services.AddScoped<NominationService>();
builder.Services.AddScoped<VotingService>();
builder.Services.AddScoped<ResultsService>();
builder.Services.AddScoped<VoterRollService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<DemoSeeder>();

// ---- Web plumbing ---------------------------------------------------------------------
builder.Services.Configure<JsonOptions>(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi(o => o.AddDocumentTransformer((doc, _, _) =>
{
    doc.Info.Title = "Gram Panchayat Sarpanch Election API";
    doc.Info.Version = "v1";
    doc.Info.Description = "Nominations, polling, counting and results for a village Sarpanch election.";
    return Task.CompletedTask;
}));
builder.Services.AddHealthChecks().AddDbContextCheck<ElectionDbContext>("database");

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
    if (origins.Length == 0) p.SetIsOriginAllowed(_ => true); // dev convenience
    else p.WithOrigins(origins);
    p.AllowAnyHeader().AllowAnyMethod();
}));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(AuthEndpoints.RateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
});

// ---- AuthN / AuthZ ------------------------------------------------------------------------
var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false; // keep "sub", "role" etc. as-is
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            NameClaimType = System.Security.Claims.ClaimTypes.Name,
            RoleClaimType = System.Security.Claims.ClaimTypes.Role,
        };
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(Policies.Admin, p => p.RequireRole(nameof(UserRole.Admin)))
    .AddPolicy(Policies.Officer, p => p.RequireRole(nameof(UserRole.Admin), nameof(UserRole.Officer)))
    .AddPolicy(Policies.Voter, p => p.RequireRole(nameof(UserRole.Voter)));

var app = builder.Build();

// ---- Pipeline -------------------------------------------------------------------------------
app.UseExceptionHandler(errApp => errApp.Run(async ctx =>
{
    var feature = ctx.Features.Get<IExceptionHandlerFeature>();
    var problemService = ctx.RequestServices.GetRequiredService<IProblemDetailsService>();

    if (feature?.Error is DomainException dex)
    {
        ctx.Response.StatusCode = dex.StatusCode;
        await problemService.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            ProblemDetails = new()
            {
                Status = dex.StatusCode,
                Title = dex.StatusCode switch
                {
                    StatusCodes.Status404NotFound => "Not found",
                    StatusCodes.Status409Conflict => "Conflict",
                    StatusCodes.Status401Unauthorized => "Unauthorized",
                    StatusCodes.Status403Forbidden => "Forbidden",
                    _ => "Request could not be processed",
                },
                Detail = dex.Message,
            },
        });
        return;
    }

    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
    await problemService.WriteAsync(new ProblemDetailsContext
    {
        HttpContext = ctx,
        ProblemDetails = new()
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred",
            Detail = app.Environment.IsDevelopment() ? feature?.Error.ToString() : null,
        },
    });
}));
app.UseStatusCodePages();

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi();
app.MapScalarApiReference("/docs", o => o.WithTitle("Sarpanch Election API").WithTheme(ScalarTheme.Saturn));
app.MapHealthChecks("/health");
app.MapGet("/", () => Results.Redirect("/docs")).ExcludeFromDescription();

app.MapAuthEndpoints();
app.MapPublicEndpoints();
app.MapAdminEndpoints();

// Serve the built Angular app when it has been copied to wwwroot (single-host deployment).
if (Directory.Exists(Path.Combine(app.Environment.ContentRootPath, "wwwroot")))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    app.MapFallbackToFile("index.html").ExcludeFromDescription();
}

// ---- Database bootstrap ---------------------------------------------------------------------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ElectionDbContext>();
    var demo = scope.ServiceProvider.GetRequiredService<IOptions<DemoOptions>>().Value;
    var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");

    if (app.Configuration.GetValue("Database:AutoMigrate", true))
    {
        log.LogInformation("Applying database migrations ({Provider})…", dbOptions.Provider);
        if (db.Database.GetMigrations().Any()) await db.Database.MigrateAsync();
        else await db.Database.EnsureCreatedAsync();
    }

    if (demo.SeedOnStartup)
        await scope.ServiceProvider.GetRequiredService<DemoSeeder>().SeedAsync();
}

app.Run();

/// <summary>Marker so WebApplicationFactory in tests can reference the entry point.</summary>
public partial class Program;
