using System.ComponentModel.DataAnnotations;
using GramPanchayat.Api.Domain;

namespace GramPanchayat.Api.Contracts;

// ---- Read models ---------------------------------------------------------------

public sealed record VillageDto(int Id, string Name, string Mandal, string District, string State, int TotalWards);

public sealed record WardDto(int Id, int VillageId, int Number, string Name, int VoterCount, int VotedCount);

public sealed record ElectionDto(
    int Id,
    int VillageId,
    string VillageName,
    string Title,
    string Post,
    ElectionPhase Phase,
    DateOnly NominationStartsOn,
    DateOnly NominationEndsOn,
    DateOnly PollingDate,
    string PollingStartsAt,
    string PollingEndsAt,
    int TotalVoters,
    int VotesCast,
    double TurnoutPercent,
    int CandidateCount,
    DateTime? DeclaredAt,
    int? WinnerCandidateId,
    string? WinnerName);

public sealed record CandidateDto(
    int Id,
    int ElectionId,
    string FullName,
    string FatherOrSpouseName,
    int Age,
    string Gender,
    int WardId,
    int WardNumber,
    string Symbol,
    string SymbolEmoji,
    string Education,
    string Occupation,
    string Manifesto,
    string? PhotoUrl,
    NominationStatus Status,
    string? RejectionReason,
    DateTime NominatedOn,
    int? SerialNumber);

public sealed record VoterDto(
    int Id,
    string EpicNumber,
    string FullName,
    int Age,
    string Gender,
    int WardId,
    int WardNumber,
    string HouseNumber,
    string Mobile,
    bool HasVoted,
    DateTime? VotedAt);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public sealed record AuthUserDto(int Id, string Name, UserRole Role, int? VoterId, string? EpicNumber, int? WardNumber);

public sealed record AuthResponse(string Token, DateTime ExpiresAt, AuthUserDto User);

public sealed record CastVoteResponse(string ReceiptNumber, DateTime CastAt, string Message);

public sealed record CandidateResultDto(
    int CandidateId,
    string FullName,
    string Symbol,
    string SymbolEmoji,
    int WardNumber,
    int Votes,
    double Percent,
    int Rank,
    bool IsWinner);

public sealed record WardResultDto(
    int WardId,
    int WardNumber,
    string WardName,
    int TotalVoters,
    int VotesCast,
    double TurnoutPercent,
    int? LeadingCandidateId,
    string? LeadingCandidateName,
    Dictionary<int, int> CandidateVotes);

public sealed record ElectionResultsDto(
    int ElectionId,
    string Title,
    ElectionPhase Phase,
    int TotalVoters,
    int VotesCast,
    double TurnoutPercent,
    int Nota,
    DateTime? DeclaredAt,
    CandidateResultDto? Winner,
    int Margin,
    IReadOnlyList<CandidateResultDto> Candidates,
    IReadOnlyList<WardResultDto> Wards);

public sealed record HourlyTurnoutDto(string Hour, int Votes);

public sealed record DashboardDto(
    ElectionDto Election,
    IReadOnlyList<WardDto> Wards,
    int PendingNominations,
    int AcceptedCandidates,
    int RejectedNominations,
    int VotersTotal,
    int VotersVoted,
    double TurnoutPercent,
    IReadOnlyList<HourlyTurnoutDto> HourlyTurnout);

public sealed record MessageResponse(string Message);

public sealed record OtpResponse(string Message, string? DemoOtp);

// ---- Write models --------------------------------------------------------------

public sealed record RequestOtpRequest([Required, MaxLength(30)] string EpicNumber);

public sealed record VoterLoginRequest(
    [Required, MaxLength(30)] string EpicNumber,
    [Required, RegularExpression("^[0-9]{6}$", ErrorMessage = "OTP must be 6 digits.")] string Otp);

public sealed record AdminLoginRequest(
    [Required, MaxLength(60)] string Username,
    [Required, MaxLength(100)] string Password);

public sealed record NominationRequest(
    [Required, MinLength(3), MaxLength(120)] string FullName,
    [Required, MaxLength(120)] string FatherOrSpouseName,
    [Range(21, 100, ErrorMessage = "A candidate must be between 21 and 100 years old.")] int Age,
    [Required, MaxLength(20)] string Gender,
    [Range(1, int.MaxValue)] int WardId,
    [Required, MaxLength(60)] string Symbol,
    [Required, MaxLength(16)] string SymbolEmoji,
    [Required, MaxLength(120)] string Education,
    [Required, MaxLength(120)] string Occupation,
    [Required, MinLength(30), MaxLength(2000)] string Manifesto);

public sealed record ReviewNominationRequest(
    [Required] NominationStatus Decision,
    [MaxLength(500)] string? Reason);

public sealed record CastVoteRequest(
    [Range(0, int.MaxValue, ErrorMessage = "candidateId must be 0 (NOTA) or a valid candidate id.")] int CandidateId);

public sealed record ChangePhaseRequest([Required] ElectionPhase Phase);

public sealed record CreateVoterRequest(
    [Required, MinLength(3), MaxLength(120)] string FullName,
    [Range(18, 120)] int Age,
    [Required, MaxLength(20)] string Gender,
    [Range(1, int.MaxValue)] int WardId,
    [Required, MaxLength(30)] string HouseNumber,
    [Required, RegularExpression("^[6-9][0-9]{9}$", ErrorMessage = "Enter a valid 10-digit Indian mobile number.")] string Mobile);
