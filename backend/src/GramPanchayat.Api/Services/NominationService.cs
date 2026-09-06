using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace GramPanchayat.Api.Services;

public sealed class NominationService(ElectionDbContext db, TimeProvider clock)
{
    public async Task<IReadOnlyList<CandidateDto>> ListAsync(int electionId, NominationStatus? status, bool includeAll, CancellationToken ct)
    {
        var q = db.Candidates.AsNoTracking().Include(c => c.Ward).Where(c => c.ElectionId == electionId);

        // Anonymous / voter callers may only see accepted candidates.
        if (!includeAll) q = q.Where(c => c.Status == NominationStatus.Accepted);
        else if (status is not null) q = q.Where(c => c.Status == status);

        var list = await q
            .OrderBy(c => c.SerialNumber == null ? 1 : 0)
            .ThenBy(c => c.SerialNumber)
            .ThenBy(c => c.NominatedOn)
            .ToListAsync(ct);
        return list.Select(c => c.ToDto()).ToList();
    }

    public async Task<CandidateDto> GetAsync(int electionId, int candidateId, bool includeAll, CancellationToken ct)
    {
        var c = await db.Candidates.AsNoTracking().Include(x => x.Ward)
                    .FirstOrDefaultAsync(x => x.ElectionId == electionId && x.Id == candidateId, ct)
                ?? throw DomainException.NotFound("Candidate");

        // Hide pending/rejected nominations from the public, but let anyone follow the link they got after filing.
        if (!includeAll && c.Status == NominationStatus.Rejected && string.IsNullOrEmpty(c.RejectionReason))
            throw DomainException.NotFound("Candidate");

        return c.ToDto();
    }

    public async Task<CandidateDto> FileAsync(int electionId, NominationRequest req, CancellationToken ct)
    {
        var election = await db.Elections.FirstOrDefaultAsync(e => e.Id == electionId, ct)
                       ?? throw DomainException.NotFound("Election");

        if (election.Phase != ElectionPhase.Nomination)
            throw DomainException.Conflict($"Nominations are not open (current phase: {election.Phase}).");

        var ward = await db.Wards.FirstOrDefaultAsync(w => w.Id == req.WardId && w.VillageId == election.VillageId, ct)
                   ?? throw new DomainException("The selected ward does not belong to this village.");

        var symbol = req.Symbol.Trim();
        var symbolTaken = await db.Candidates.AnyAsync(
            c => c.ElectionId == electionId
                 && c.Symbol == symbol
                 && (c.Status == NominationStatus.Pending || c.Status == NominationStatus.Accepted), ct);
        if (symbolTaken)
            throw DomainException.Conflict($"The symbol \"{symbol}\" has already been allotted to another candidate.");

        var name = req.FullName.Trim();
        var duplicate = await db.Candidates.AnyAsync(
            c => c.ElectionId == electionId
                 && c.FullName == name
                 && c.FatherOrSpouseName == req.FatherOrSpouseName.Trim()
                 && c.Status != NominationStatus.Withdrawn
                 && c.Status != NominationStatus.Rejected, ct);
        if (duplicate)
            throw DomainException.Conflict("A nomination for this person has already been filed.");

        var candidate = new Candidate
        {
            ElectionId = electionId,
            FullName = name,
            FatherOrSpouseName = req.FatherOrSpouseName.Trim(),
            Age = req.Age,
            Gender = req.Gender.Trim(),
            WardId = ward.Id,
            Ward = ward,
            Symbol = symbol,
            SymbolEmoji = req.SymbolEmoji.Trim(),
            Education = req.Education.Trim(),
            Occupation = req.Occupation.Trim(),
            Manifesto = req.Manifesto.Trim(),
            Status = NominationStatus.Pending,
            NominatedOn = clock.GetUtcNow().UtcDateTime,
        };

        db.Candidates.Add(candidate);
        await db.SaveChangesAsync(ct);
        return candidate.ToDto();
    }

    public async Task<CandidateDto> ReviewAsync(int electionId, int candidateId, ReviewNominationRequest req, CancellationToken ct)
    {
        if (req.Decision is not (NominationStatus.Accepted or NominationStatus.Rejected))
            throw new DomainException("Decision must be Accepted or Rejected.");

        var election = await db.Elections.FirstOrDefaultAsync(e => e.Id == electionId, ct)
                       ?? throw DomainException.NotFound("Election");
        if (election.Phase is not (ElectionPhase.Nomination or ElectionPhase.Scrutiny))
            throw DomainException.Conflict($"Nominations can only be reviewed during Nomination or Scrutiny (current phase: {election.Phase}).");

        var c = await db.Candidates.Include(x => x.Ward)
                    .FirstOrDefaultAsync(x => x.ElectionId == electionId && x.Id == candidateId, ct)
                ?? throw DomainException.NotFound("Candidate");

        if (c.Status != NominationStatus.Pending)
            throw DomainException.Conflict($"This nomination has already been {c.Status.ToString().ToLowerInvariant()}.");

        if (req.Decision == NominationStatus.Rejected)
        {
            if (string.IsNullOrWhiteSpace(req.Reason) || req.Reason.Trim().Length < 5)
                throw new DomainException("A reason (at least 5 characters) is required when rejecting a nomination.");
            c.Status = NominationStatus.Rejected;
            c.RejectionReason = req.Reason.Trim();
        }
        else
        {
            var maxSerial = await db.Candidates
                .Where(x => x.ElectionId == electionId && x.SerialNumber != null)
                .MaxAsync(x => (int?)x.SerialNumber, ct) ?? 0;
            c.Status = NominationStatus.Accepted;
            c.SerialNumber = maxSerial + 1;
            c.RejectionReason = null;
        }

        c.ReviewedOn = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        return c.ToDto();
    }

    public async Task<CandidateDto> WithdrawAsync(int electionId, int candidateId, CancellationToken ct)
    {
        var election = await db.Elections.FirstOrDefaultAsync(e => e.Id == electionId, ct)
                       ?? throw DomainException.NotFound("Election");
        if (election.Phase is not (ElectionPhase.Nomination or ElectionPhase.Scrutiny))
            throw DomainException.Conflict("Nominations can only be withdrawn before polling opens.");

        var c = await db.Candidates.Include(x => x.Ward)
                    .FirstOrDefaultAsync(x => x.ElectionId == electionId && x.Id == candidateId, ct)
                ?? throw DomainException.NotFound("Candidate");

        if (c.Status is NominationStatus.Withdrawn or NominationStatus.Rejected)
            throw DomainException.Conflict($"This nomination is already {c.Status.ToString().ToLowerInvariant()}.");

        c.Status = NominationStatus.Withdrawn;
        c.SerialNumber = null;
        c.ReviewedOn = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        return c.ToDto();
    }
}
