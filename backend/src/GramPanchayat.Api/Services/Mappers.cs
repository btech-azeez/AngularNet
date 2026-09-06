using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Domain;

namespace GramPanchayat.Api.Services;

internal static class Mappers
{
    public static VillageDto ToDto(this Village v, int totalWards) =>
        new(v.Id, v.Name, v.Mandal, v.District, v.State, totalWards);

    public static CandidateDto ToDto(this Candidate c) =>
        new(
            c.Id,
            c.ElectionId,
            c.FullName,
            c.FatherOrSpouseName,
            c.Age,
            c.Gender,
            c.WardId,
            c.Ward?.Number ?? 0,
            c.Symbol,
            c.SymbolEmoji,
            c.Education,
            c.Occupation,
            c.Manifesto,
            c.PhotoUrl,
            c.Status,
            c.RejectionReason,
            c.NominatedOn,
            c.SerialNumber);

    public static VoterDto ToDto(this Voter v) =>
        new(
            v.Id,
            v.EpicNumber,
            v.FullName,
            v.Age,
            v.Gender,
            v.WardId,
            v.Ward?.Number ?? 0,
            v.HouseNumber,
            v.Mobile,
            v.HasVoted,
            v.VotedAt);

    public static ElectionDto ToDto(this Election e, int totalVoters, int votesCast, int candidateCount) =>
        new(
            e.Id,
            e.VillageId,
            e.Village?.Name ?? string.Empty,
            e.Title,
            e.Post,
            e.Phase,
            e.NominationStartsOn,
            e.NominationEndsOn,
            e.PollingDate,
            e.PollingStartsAt.ToString("HH:mm"),
            e.PollingEndsAt.ToString("HH:mm"),
            totalVoters,
            votesCast,
            Percent(votesCast, totalVoters),
            candidateCount,
            e.DeclaredAt,
            e.WinnerCandidateId,
            e.WinnerCandidate?.FullName);

    public static double Percent(int part, int whole) =>
        whole == 0 ? 0 : Math.Round(part * 100.0 / whole, 2);
}
