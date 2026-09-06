using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Services;
using Microsoft.AspNetCore.RateLimiting;

namespace GramPanchayat.Api.Endpoints;

public static class AuthEndpoints
{
    public const string RateLimitPolicy = "auth";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth").RequireRateLimiting(RateLimitPolicy);

        g.MapPost("/voter/request-otp", async (RequestOtpRequest req, AuthService svc, CancellationToken ct) =>
                await svc.RequestOtpAsync(req, ct))
            .WithName("RequestVoterOtp")
            .WithSummary("Send a one-time password to the voter's registered mobile (returned in the response in demo mode).");

        g.MapPost("/voter/login", async (VoterLoginRequest req, AuthService svc, CancellationToken ct) =>
                await svc.LoginVoterAsync(req, ct))
            .WithName("VoterLogin")
            .WithSummary("Exchange EPIC number + OTP for a short-lived voter token.");

        g.MapPost("/admin/login", async (AdminLoginRequest req, AuthService svc, CancellationToken ct) =>
                await svc.LoginAdminAsync(req, ct))
            .WithName("AdminLogin")
            .WithSummary("Returning Officer / polling staff sign in.");

        return app;
    }
}
