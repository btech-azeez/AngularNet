using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace GramPanchayat.Api.Services;

/// <summary>Read/write operations around the election itself, the village and its wards.</summary>
public sealed class ElectionService(ElectionDbContext db, TimeProvider clock)
{
    public async Task<VillageDto> GetVillageAsync(CancellationToken ct)
    {
        var village = await db.Villages.AsNoTracking().Include(v => v.Wards).FirstOrDefaultAsync(ct)
                      ?? throw DomainException.NotFound("Village");
        return village.ToDto(village.Wards.Count);
    }

    public async Task<IReadOnlyList<WardDto>> GetWardsAsync(CancellationToken ct)
    {
        var electionId = await CurrentElectionIdAsync(ct);
        return await WardsForAsync(electionId, ct);
    }

    internal async Task<IReadOnlyList<WardDto>> WardsForAsync(int electionId, CancellationToken ct)
    {
        return await db.Wards.AsNoTracking()
            .OrderBy(w => w.Number)
            .Select(w => new WardDto(
                w.Id,
                w.VillageId,
                w.Number,
                w.Name,
                w.Voters.Count(v => v.ElectionId == electionId),
                w.Voters.Count(v => v.ElectionId == electionId && v.HasVoted)))
            .ToListAsync(ct);
    }

    public async Task<int> CurrentElectionIdAsync(CancellationToken ct)
    {
        // "Current" = the most recent election that has not been declared, else the latest one.
        var id = await db.Elections.AsNoTracking()
            .OrderBy(e => e.Phase == ElectionPhase.Declared ? 1 : 0)
            .ThenByDescending(e => e.PollingDate)
            .Select(e => (int?)e.Id)
            .FirstOrDefaultAsync(ct);
        return id ?? throw DomainException.NotFound("Election");
    }

    public async Task<ElectionDto> GetCurrentAsync(CancellationToken ct) =>
        await GetAsync(await CurrentElectionIdAsync(ct), ct);

    public async Task<ElectionDto> GetAsync(int electionId, CancellationToken ct)
    {
        var e = await db.Elections.AsNoTracking()
                    .Include(x => x.Village)
                    .Include(x => x.WinnerCandidate)
                    .FirstOrDefaultAsync(x => x.Id == electionId, ct)
                ?? throw DomainException.NotFound("Election");

        var totalVoters = await db.Voters.CountAsync(v => v.ElectionId == electionId, ct);
        var votesCast = await db.Votes.CountAsync(v => v.ElectionId == electionId, ct);
        var candidates = await db.Candidates.CountAsync(
            c => c.ElectionId == electionId && c.Status == NominationStatus.Accepted, ct);
        return e.ToDto(totalVoters, votesCast, candidates);
    }

    /// <summary>
    /// Moves the election forward exactly one step. Rules:
    /// Scheduled → Nomination → Scrutiny → Polling → Counting. "Declared" is reached via <see cref="DeclareAsync"/>.
    /// </summary>
    public async Task<ElectionDto> ChangePhaseAsync(int electionId, ElectionPhase target, CancellationToken ct)
    {
        var e = await db.Elections.FirstOrDefaultAsync(x => x.Id == electionId, ct)
                ?? throw DomainException.NotFound("Election");

        if (target == ElectionPhase.Declared)
            throw new DomainException("Use the declare endpoint to declare the result.");

        if ((int)target != (int)e.Phase + 1)
            throw DomainException.Conflict(
                $"Cannot move from {e.Phase} to {target}. Phases must advance one step at a time and never go back.");

        switch (target)
        {
            case ElectionPhase.Scrutiny:
                if (!await db.Candidates.AnyAsync(c => c.ElectionId == electionId && c.Status != NominationStatus.Withdrawn, ct))
                    throw DomainException.Conflict("Cannot close nominations: no nominations have been filed.");
                break;

            case ElectionPhase.Polling:
                if (await db.Candidates.AnyAsync(c => c.ElectionId == electionId && c.Status == NominationStatus.Pending, ct))
                    throw DomainException.Conflict("All nominations must be accepted or rejected before polling can open.");
                if (!await db.Candidates.AnyAsync(c => c.ElectionId == electionId && c.Status == NominationStatus.Accepted, ct))
                    throw DomainException.Conflict("At least one accepted candidate is required to open polling.");
                break;
        }

        e.Phase = target;
        e.Version++;
        await SaveAsync(ct);
        return await GetAsync(electionId, ct);
    }

    public async Task<ElectionDto> DeclareAsync(int electionId, ResultsService results, CancellationToken ct)
    {
        var e = await db.Elections.FirstOrDefaultAsync(x => x.Id == electionId, ct)
                ?? throw DomainException.NotFound("Election");

        if (e.Phase != ElectionPhase.Counting)
            throw DomainException.Conflict($"Results can only be declared during Counting (current phase: {e.Phase}).");

        var tally = await results.GetAsync(electionId, ct);
        if (tally.Winner is null)
            throw DomainException.Conflict("No votes have been counted yet; there is nothing to declare.");

        e.Phase = ElectionPhase.Declared;
        e.WinnerCandidateId = tally.Winner.CandidateId;
        e.DeclaredAt = clock.GetUtcNow().UtcDateTime;
        e.Version++;
        await SaveAsync(ct);
        return await GetAsync(electionId, ct);
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw DomainException.Conflict("The election was modified by someone else. Please refresh and try again.");
        }
    }
}
