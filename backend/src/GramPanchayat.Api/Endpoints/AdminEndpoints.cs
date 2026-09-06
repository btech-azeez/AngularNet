using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Infrastructure;
using GramPanchayat.Api.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace GramPanchayat.Api.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization(Policies.Officer);

        g.MapGet("/elections/{electionId:int}/dashboard", async (
                int electionId, ResultsService results, ElectionService elections, CancellationToken ct) =>
                await results.GetDashboardAsync(electionId, elections, ct))
            .WithName("GetDashboard");

        g.MapPost("/elections/{electionId:int}/phase", async (
                int electionId, ChangePhaseRequest req, ElectionService svc, CancellationToken ct) =>
                await svc.ChangePhaseAsync(electionId, req.Phase, ct))
            .RequireAuthorization(Policies.Admin)
            .WithName("ChangePhase")
            .WithSummary("Advance the election to the next phase (Returning Officer only).");

        g.MapPost("/elections/{electionId:int}/declare", async (
                int electionId, ElectionService svc, ResultsService results, CancellationToken ct) =>
                await svc.DeclareAsync(electionId, results, ct))
            .RequireAuthorization(Policies.Admin)
            .WithName("DeclareResult")
            .WithSummary("Declare the leading candidate elected (Counting → Declared).");

        g.MapGet("/elections/{electionId:int}/voters", async (
                int electionId,
                [FromQuery] int? wardId,
                [FromQuery] string? search,
                [FromQuery] int page,
                [FromQuery] int pageSize,
                VoterRollService svc,
                CancellationToken ct) =>
                await svc.ListAsync(electionId, wardId, search, page == 0 ? 1 : page, pageSize == 0 ? 25 : pageSize, ct))
            .WithName("ListVoters");

        g.MapPost("/elections/{electionId:int}/voters", async Task<Created<VoterDto>> (
                int electionId, CreateVoterRequest req, VoterRollService svc, CancellationToken ct) =>
            {
                var v = await svc.AddAsync(electionId, req, ct);
                return TypedResults.Created($"/api/admin/elections/{electionId}/voters/{v.Id}", v);
            })
            .WithName("AddVoter");

        g.MapPost("/demo/reset", async Task<Results<Ok<MessageResponse>, NotFound>> (
                DemoSeeder seeder, IOptions<DemoOptions> demo, CancellationToken ct) =>
            {
                if (!demo.Value.Enabled) return TypedResults.NotFound();
                await seeder.SeedAsync(ct, force: true);
                return TypedResults.Ok(new MessageResponse("Demo data has been reset to the seeded state."));
            })
            .RequireAuthorization(Policies.Admin)
            .WithName("ResetDemo")
            .WithSummary("Wipe and re-seed demo data (only when Demo:Enabled = true).");

        return app;
    }
}
