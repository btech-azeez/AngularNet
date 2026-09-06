namespace GramPanchayat.Api.Domain;

/// <summary>Lifecycle of a Gram Panchayat election. Phases only move forward.</summary>
public enum ElectionPhase
{
    Scheduled = 0,
    Nomination = 1,
    Scrutiny = 2,
    Polling = 3,
    Counting = 4,
    Declared = 5,
}

public enum NominationStatus
{
    Pending = 0,
    Accepted = 1,
    Rejected = 2,
    Withdrawn = 3,
}

public enum UserRole
{
    Admin = 0,
    Officer = 1,
    Voter = 2,
}

public sealed class Village
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Mandal { get; set; }
    public required string District { get; set; }
    public required string State { get; set; }

    public List<Ward> Wards { get; set; } = [];
    public List<Election> Elections { get; set; } = [];
}

public sealed class Ward
{
    public int Id { get; set; }
    public int VillageId { get; set; }
    public Village Village { get; set; } = null!;
    public int Number { get; set; }
    public required string Name { get; set; }

    public List<Voter> Voters { get; set; } = [];
}

public sealed class Election
{
    public int Id { get; set; }
    public int VillageId { get; set; }
    public Village Village { get; set; } = null!;

    public required string Title { get; set; }
    public string Post { get; set; } = "Sarpanch";
    public ElectionPhase Phase { get; set; } = ElectionPhase.Scheduled;

    public DateOnly NominationStartsOn { get; set; }
    public DateOnly NominationEndsOn { get; set; }
    public DateOnly PollingDate { get; set; }
    public TimeOnly PollingStartsAt { get; set; } = new(7, 0);
    public TimeOnly PollingEndsAt { get; set; } = new(17, 0);

    public DateTime? DeclaredAt { get; set; }
    public int? WinnerCandidateId { get; set; }
    public Candidate? WinnerCandidate { get; set; }

    /// <summary>Optimistic concurrency token so two officers cannot both advance the phase.</summary>
    public int Version { get; set; }

    public List<Candidate> Candidates { get; set; } = [];
    public List<Voter> Voters { get; set; } = [];
    public List<Vote> Votes { get; set; } = [];
}

public sealed class Candidate
{
    public int Id { get; set; }
    public int ElectionId { get; set; }
    public Election Election { get; set; } = null!;

    public required string FullName { get; set; }
    public required string FatherOrSpouseName { get; set; }
    public int Age { get; set; }
    public required string Gender { get; set; }

    public int WardId { get; set; }
    public Ward Ward { get; set; } = null!;

    public required string Symbol { get; set; }
    public required string SymbolEmoji { get; set; }
    public required string Education { get; set; }
    public required string Occupation { get; set; }
    public required string Manifesto { get; set; }
    public string? PhotoUrl { get; set; }

    public NominationStatus Status { get; set; } = NominationStatus.Pending;
    public string? RejectionReason { get; set; }
    public DateTime NominatedOn { get; set; }
    public DateTime? ReviewedOn { get; set; }

    /// <summary>Position on the ballot paper; allotted when the nomination is accepted.</summary>
    public int? SerialNumber { get; set; }

    public List<Vote> Votes { get; set; } = [];
}

public sealed class Voter
{
    public int Id { get; set; }
    public int ElectionId { get; set; }
    public Election Election { get; set; } = null!;

    /// <summary>Electoral Photo Identity Card number — the voter's login id.</summary>
    public required string EpicNumber { get; set; }
    public required string FullName { get; set; }
    public int Age { get; set; }
    public required string Gender { get; set; }

    public int WardId { get; set; }
    public Ward Ward { get; set; } = null!;

    public required string HouseNumber { get; set; }
    public required string Mobile { get; set; }

    public bool HasVoted { get; set; }
    public DateTime? VotedAt { get; set; }

    // One-time password state for login. In production this would live in a cache / SMS gateway.
    public string? OtpHash { get; set; }
    public DateTime? OtpExpiresAt { get; set; }
    public int OtpAttempts { get; set; }
}

/// <summary>
/// A cast ballot. Deliberately NOT linked to the voter so that the ballot stays secret;
/// the voter row only records <em>that</em> they voted (HasVoted / VotedAt).
/// </summary>
public sealed class Vote
{
    public long Id { get; set; }
    public int ElectionId { get; set; }
    public Election Election { get; set; } = null!;

    /// <summary>Null means NOTA (None Of The Above).</summary>
    public int? CandidateId { get; set; }
    public Candidate? Candidate { get; set; }

    public int WardId { get; set; }
    public DateTime CastAt { get; set; }

    /// <summary>Random receipt handed to the voter; proves participation, not choice.</summary>
    public required string ReceiptNumber { get; set; }
}

public sealed class AppUser
{
    public int Id { get; set; }
    public required string Username { get; set; }
    public required string DisplayName { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; }
}
