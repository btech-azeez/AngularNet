using System.Security.Claims;
using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Domain;
using GramPanchayat.Api.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace GramPanchayat.Api.Endpoints;

public static class PublicEndpoints
{
    public static IEndpointRouteBuilder MapPublicEndpoints(this IEndpointRouteBuilder app)
    {
        // ---- Village -------------------------------------------------------------
        var village = app.MapGroup("/api/village").WithTags("Village");

        village.MapGet("/", async (ElectionService svc, CancellationToken ct) => await svc.GetVillageAsync(ct))
            .WithName("GetVillage")
            .WithSummary("Village (Gram Panchayat) details.");

        village.MapGet("/wards", async (ElectionService svc, CancellationToken ct) => await svc.GetWardsAsync(ct))
            .WithName("GetWards")
            .WithSummary("Wards with voter counts for the current election.");

        // ---- Elections -----------------------------------------------------------
        var elections = app.MapGroup("/api/elections").WithTags("Elections");

        elections.MapGet("/current", async (ElectionService svc, CancellationToken ct) => await svc.GetCurrentAsync(ct))
            .WithName("GetCurrentElection")
            .WithSummary("The election that is currently in progress (or the latest one).");

        elections.MapGet("/{electionId:int}", async (int electionId, ElectionService svc, CancellationToken ct) =>
                await svc.GetAsync(electionId, ct))
            .WithName("GetElection");

        elections.MapGet("/{electionId:int}/results", async (int electionId, ResultsService svc, CancellationToken ct) =>
                await svc.GetAsync(electionId, ct))
            .WithName("GetResults")
            .WithSummary("Tally. Vote counts are only revealed from the Counting phase onwards.");

        // ---- Candidates / nominations -------------------------------------------
        var candidates = app.MapGroup("/api/elections/{electionId:int}/candidates").WithTags("Candidates");

        candidates.MapGet("/", async (
                int electionId,
                [FromQuery] NominationStatus? status,
                ClaimsPrincipal user,
                NominationService svc,
                CancellationToken ct) =>
                await svc.ListAsync(electionId, status, IsOfficer(user), ct))
            .WithName("ListCandidates")
            .WithSummary("Accepted candidates (public) or every nomination (officers).");

        candidates.MapGet("/{candidateId:int}", async (
                int electionId, int candidateId, ClaimsPrincipal user, NominationService svc, CancellationToken ct) =>
                await svc.GetAsync(electionId, candidateId, IsOfficer(user), ct))
            .WithName("GetCandidate");

        candidates.MapPost("/", async Task<Results<Created<CandidateDto>, ValidationProblem>> (
                int electionId, NominationRequest req, NominationService svc, CancellationToken ct) =>
            {
                var created = await svc.FileAsync(electionId, req, ct);
                return TypedResults.Created($"/api/elections/{electionId}/candidates/{created.Id}", created);
            })
            .WithName("FileNomination")
            .WithSummary("File a nomination for Sarpanch (open during the Nomination phase).");

        candidates.MapPost("/{candidateId:int}/review", async (
                int electionId, int candidateId, ReviewNominationRequest req, NominationService svc, CancellationToken ct) =>
                await svc.ReviewAsync(electionId, candidateId, req, ct))
            .RequireAuthorization(Policies.Officer)
            .WithName("ReviewNomination")
            .WithSummary("Accept or reject a nomination (officers).");

        candidates.MapPost("/{candidateId:int}/withdraw", async (
                int electionId, int candidateId, NominationService svc, CancellationToken ct) =>
                await svc.WithdrawAsync(electionId, candidateId, ct))
            .RequireAuthorization(Policies.Officer)
            .WithName("WithdrawNomination");

        // ---- Voting --------------------------------------------------------------
        app.MapGet("/api/voters/me", async (ClaimsPrincipal user, VotingService svc, CancellationToken ct) =>
                await svc.GetVoterAsync(VoterId(user), ct))
            .RequireAuthorization(Policies.Voter)
            .WithTags("Voting")
            .WithName("GetMyVoterStatus")
            .WithSummary("The signed-in voter's roll entry, including whether they have voted.");

        app.MapPost("/api/elections/{electionId:int}/votes", async (
                int electionId, CastVoteRequest req, ClaimsPrincipal user, VotingService svc, CancellationToken ct) =>
                await svc.CastAsync(electionId, VoterId(user), req, ct))
            .RequireAuthorization(Policies.Voter)
            .WithTags("Voting")
            .WithName("CastVote")
            .WithSummary("Cast a secret ballot (candidateId = 0 for NOTA). One vote per voter, enforced atomically.");

        return app;
    }

    internal static bool IsOfficer(ClaimsPrincipal user) =>
        user.IsInRole(nameof(UserRole.Admin)) || user.IsInRole(nameof(UserRole.Officer));

    internal static int VoterId(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(AppClaims.VoterId), out var id)
            ? id
            : throw new DomainException("Voter identity missing from token.", StatusCodes.Status401Unauthorized);
}
