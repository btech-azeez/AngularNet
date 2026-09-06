using System.Security.Cryptography;
using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace GramPanchayat.Api.Services;

public sealed class VotingService(ElectionDbContext db, TimeProvider clock, ILogger<VotingService> logger)
{
    public async Task<VoterDto> GetVoterAsync(int voterId, CancellationToken ct)
    {
        var v = await db.Voters.AsNoTracking().Include(x => x.Ward).FirstOrDefaultAsync(x => x.Id == voterId, ct)
                ?? throw DomainException.NotFound("Voter");
        return v.ToDto();
    }

    /// <summary>
    /// Records a secret ballot. Guarantees exactly one vote per voter using an atomic conditional
    /// update on the voter row (UPDATE … WHERE HasVoted = 0), which is safe under concurrent requests.
    /// </summary>
    public async Task<CastVoteResponse> CastAsync(int electionId, int voterId, CastVoteRequest req, CancellationToken ct)
    {
        var election = await db.Elections.AsNoTracking().FirstOrDefaultAsync(e => e.Id == electionId, ct)
                       ?? throw DomainException.NotFound("Election");

        if (election.Phase != ElectionPhase.Polling)
            throw DomainException.Conflict(
                election.Phase < ElectionPhase.Polling
                    ? "Polling has not started yet."
                    : "Polling has closed.");

        var voter = await db.Voters.AsNoTracking().FirstOrDefaultAsync(v => v.Id == voterId, ct)
                    ?? throw DomainException.NotFound("Voter");

        if (voter.ElectionId != electionId)
            throw DomainException.Forbidden("You are not on the electoral roll for this election.");

        if (voter.HasVoted)
            throw DomainException.Conflict("You have already voted in this election. Each elector may vote only once.");

        int? candidateId = null;
        if (req.CandidateId != 0)
        {
            var ok = await db.Candidates.AnyAsync(
                c => c.Id == req.CandidateId && c.ElectionId == electionId && c.Status == NominationStatus.Accepted, ct);
            if (!ok) throw new DomainException("The selected candidate is not on the ballot.");
            candidateId = req.CandidateId;
        }

        var now = clock.GetUtcNow().UtcDateTime;
        var receipt = NewReceipt(electionId);

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // Atomic "claim": only succeeds if nobody else marked this voter as voted in the meantime.
            var claimed = await db.Voters
                .Where(v => v.Id == voterId && !v.HasVoted)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(v => v.HasVoted, true)
                    .SetProperty(v => v.VotedAt, now), ct);

            if (claimed != 1)
                throw DomainException.Conflict("You have already voted in this election. Each elector may vote only once.");

            db.Votes.Add(new Vote
            {
                ElectionId = electionId,
                CandidateId = candidateId,
                WardId = voter.WardId,
                CastAt = now,
                ReceiptNumber = receipt,
            });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        logger.LogInformation("Ballot recorded for election {ElectionId} in ward {WardId} (receipt {Receipt})",
            electionId, voter.WardId, receipt);

        return new CastVoteResponse(receipt, now,
            candidateId is null
                ? "Your NOTA vote has been recorded."
                : "Your vote has been recorded. Thank you for participating in your Gram Panchayat election.");
    }

    private static string NewReceipt(int electionId)
    {
        Span<byte> bytes = stackalloc byte[6];
        RandomNumberGenerator.Fill(bytes);
        var token = Convert.ToHexString(bytes);
        return $"GP{electionId:D2}-{token[..6]}-{token[6..]}";
    }
}
