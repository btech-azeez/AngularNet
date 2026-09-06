using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace GramPanchayat.Api.Services;

/// <summary>Electoral-roll management for officers.</summary>
public sealed class VoterRollService(ElectionDbContext db)
{
    public async Task<PagedResult<VoterDto>> ListAsync(
        int electionId, int? wardId, string? search, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = db.Voters.AsNoTracking().Include(v => v.Ward).Where(v => v.ElectionId == electionId);
        if (wardId is > 0) q = q.Where(v => v.WardId == wardId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(v => v.FullName.Contains(s) || v.EpicNumber.Contains(s) || v.HouseNumber.Contains(s));
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(v => v.Ward.Number).ThenBy(v => v.EpicNumber)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<VoterDto>(items.Select(v => v.ToDto()).ToList(), total, page, pageSize);
    }

    public async Task<VoterDto> AddAsync(int electionId, CreateVoterRequest req, CancellationToken ct)
    {
        var election = await db.Elections.FirstOrDefaultAsync(e => e.Id == electionId, ct)
                       ?? throw DomainException.NotFound("Election");
        if (election.Phase >= ElectionPhase.Polling)
            throw DomainException.Conflict("The electoral roll is frozen once polling has started.");

        var ward = await db.Wards.FirstOrDefaultAsync(w => w.Id == req.WardId && w.VillageId == election.VillageId, ct)
                   ?? throw new DomainException("The selected ward does not belong to this village.");

        // EPIC format: <STATE>/<village>/<ward>/<serial>, e.g. TS/01/003/0042
        var serial = await db.Voters.CountAsync(v => v.ElectionId == electionId && v.WardId == ward.Id, ct) + 1;
        string epic;
        do
        {
            epic = $"TS/{election.VillageId:D2}/{ward.Number:D3}/{serial:D4}";
            serial++;
        } while (await db.Voters.AnyAsync(v => v.ElectionId == electionId && v.EpicNumber == epic, ct));

        var voter = new Voter
        {
            ElectionId = electionId,
            EpicNumber = epic,
            FullName = req.FullName.Trim(),
            Age = req.Age,
            Gender = req.Gender.Trim(),
            WardId = ward.Id,
            Ward = ward,
            HouseNumber = req.HouseNumber.Trim(),
            Mobile = req.Mobile.Trim(),
        };
        db.Voters.Add(voter);
        await db.SaveChangesAsync(ct);
        return voter.ToDto();
    }
}
