using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace GramPanchayat.Api.Services;

public sealed class ResultsService(ElectionDbContext db)
{
    /// <summary>
    /// Full tally for an election. Before counting starts, vote counts are withheld (zeroed) and
    /// only turnout is exposed, so nobody can peek at the trend during polling.
    /// </summary>
    public async Task<ElectionResultsDto> GetAsync(int electionId, CancellationToken ct, bool forceReveal = false)
    {
        var election = await db.Elections.AsNoTracking().FirstOrDefaultAsync(e => e.Id == electionId, ct)
                       ?? throw DomainException.NotFound("Election");

        var reveal = forceReveal || election.Phase >= ElectionPhase.Counting;

        var candidates = await db.Candidates.AsNoTracking()
            .Include(c => c.Ward)
            .Where(c => c.ElectionId == electionId && c.Status == NominationStatus.Accepted)
            .OrderBy(c => c.SerialNumber)
            .ToListAsync(ct);

        var wards = await db.Wards.AsNoTracking().OrderBy(w => w.Number).ToListAsync(ct);

        var totalVoters = await db.Voters.CountAsync(v => v.ElectionId == electionId, ct);
        var votersPerWard = await db.Voters.Where(v => v.ElectionId == electionId)
            .GroupBy(v => v.WardId)
            .Select(g => new { WardId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.WardId, x => x.Count, ct);

        var votesCast = await db.Votes.CountAsync(v => v.ElectionId == electionId, ct);
        var votesPerWard = await db.Votes.Where(v => v.ElectionId == electionId)
            .GroupBy(v => v.WardId)
            .Select(g => new { WardId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.WardId, x => x.Count, ct);

        // (wardId, candidateId?) -> votes
        var tally = reveal
            ? await db.Votes.Where(v => v.ElectionId == electionId)
                .GroupBy(v => new { v.WardId, v.CandidateId })
                .Select(g => new { g.Key.WardId, g.Key.CandidateId, Count = g.Count() })
                .ToListAsync(ct)
            : [];

        var nota = tally.Where(t => t.CandidateId == null).Sum(t => t.Count);

        var ranked = candidates
            .Select(c => new
            {
                Candidate = c,
                Votes = tally.Where(t => t.CandidateId == c.Id).Sum(t => t.Count),
            })
            .OrderByDescending(x => x.Votes)
            .ThenBy(x => x.Candidate.SerialNumber)
            .ToList();

        var topVotes = ranked.FirstOrDefault()?.Votes ?? 0;
        var hasWinner = reveal && topVotes > 0;
        // A tie at the top means no winner can be declared (Returning Officer would draw lots).
        var tied = ranked.Count(x => x.Votes == topVotes) > 1;

        var candidateResults = new List<CandidateResultDto>(ranked.Count);
        var rank = 0;
        var previousVotes = -1;
        for (var i = 0; i < ranked.Count; i++)
        {
            var r = ranked[i];
            if (r.Votes != previousVotes) rank = i + 1;
            previousVotes = r.Votes;
            var isWinner = hasWinner && !tied && i == 0;
            candidateResults.Add(new CandidateResultDto(
                r.Candidate.Id,
                r.Candidate.FullName,
                r.Candidate.Symbol,
                r.Candidate.SymbolEmoji,
                r.Candidate.Ward.Number,
                r.Votes,
                Mappers.Percent(r.Votes, votesCast),
                rank,
                isWinner));
        }

        var winner = candidateResults.FirstOrDefault(c => c.IsWinner);
        var margin = winner is null || ranked.Count < 2 ? topVotes : topVotes - ranked[1].Votes;

        var wardResults = wards.Select(w =>
        {
            var perCandidate = candidates.ToDictionary(
                c => c.Id,
                c => tally.Where(t => t.WardId == w.Id && t.CandidateId == c.Id).Sum(t => t.Count));
            var lead = perCandidate.Where(kv => kv.Value > 0).OrderByDescending(kv => kv.Value).ToList();
            int? leadId = lead.Count > 0 && (lead.Count == 1 || lead[0].Value > lead[1].Value) ? lead[0].Key : null;
            var wv = votesPerWard.GetValueOrDefault(w.Id);
            var wt = votersPerWard.GetValueOrDefault(w.Id);
            return new WardResultDto(
                w.Id,
                w.Number,
                w.Name,
                wt,
                wv,
                Mappers.Percent(wv, wt),
                leadId,
                leadId is null ? null : candidates.First(c => c.Id == leadId).FullName,
                perCandidate);
        }).ToList();

        return new ElectionResultsDto(
            election.Id,
            election.Title,
            election.Phase,
            totalVoters,
            votesCast,
            Mappers.Percent(votesCast, totalVoters),
            nota,
            election.DeclaredAt,
            winner,
            margin,
            candidateResults,
            wardResults);
    }

    public async Task<DashboardDto> GetDashboardAsync(int electionId, ElectionService elections, CancellationToken ct)
    {
        var election = await elections.GetAsync(electionId, ct);
        var wards = await elections.WardsForAsync(electionId, ct);

        var statusCounts = await db.Candidates.Where(c => c.ElectionId == electionId)
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);

        var votersTotal = await db.Voters.CountAsync(v => v.ElectionId == electionId, ct);
        var votersVoted = await db.Voters.CountAsync(v => v.ElectionId == electionId && v.HasVoted, ct);

        var hourly = (await db.Votes.Where(v => v.ElectionId == electionId)
                .Select(v => v.CastAt)
                .ToListAsync(ct))
            .GroupBy(t => new DateTime(t.Year, t.Month, t.Day, t.Hour, 0, 0, DateTimeKind.Utc))
            .OrderBy(g => g.Key)
            .Select(g => new HourlyTurnoutDto(g.Key.ToString("HH:00"), g.Count()))
            .ToList();

        return new DashboardDto(
            election,
            wards,
            statusCounts.GetValueOrDefault(NominationStatus.Pending),
            statusCounts.GetValueOrDefault(NominationStatus.Accepted),
            statusCounts.GetValueOrDefault(NominationStatus.Rejected),
            votersTotal,
            votersVoted,
            Mappers.Percent(votersVoted, votersTotal),
            hourly);
    }
}
