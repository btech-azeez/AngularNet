using GramPanchayat.Api.Domain;
using GramPanchayat.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GramPanchayat.Api.Data;

/// <summary>
/// Creates a sample Gram Panchayat with wards, an electoral roll, nominations and (optionally) some votes,
/// so the application is usable the moment it starts.
/// </summary>
public sealed class DemoSeeder(ElectionDbContext db, IOptions<DemoOptions> demo, TimeProvider clock, ILogger<DemoSeeder> logger)
{
    public const string AdminUsername = "admin";
    public const string AdminPassword = "Admin@123";
    public const string OfficerUsername = "officer";
    public const string OfficerPassword = "Officer@123";

    public async Task SeedAsync(CancellationToken ct = default, bool force = false)
    {
        if (!force && await db.Villages.AnyAsync(ct))
        {
            logger.LogInformation("Database already seeded; skipping demo seed.");
            return;
        }

        if (force) await WipeAsync(ct);

        var phase = Enum.TryParse<ElectionPhase>(demo.Value.InitialPhase, true, out var p) ? p : ElectionPhase.Polling;
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);

        // ---- Users ---------------------------------------------------------------------
        db.Users.AddRange(
            new AppUser
            {
                Username = AdminUsername,
                DisplayName = "Returning Officer",
                PasswordHash = PasswordHasher.Hash(AdminPassword),
                Role = UserRole.Admin,
            },
            new AppUser
            {
                Username = OfficerUsername,
                DisplayName = "Polling Officer",
                PasswordHash = PasswordHasher.Hash(OfficerPassword),
                Role = UserRole.Officer,
            });

        // ---- Village & wards -----------------------------------------------------------
        var village = new Village
        {
            Name = "Rampur",
            Mandal = "Shamirpet",
            District = "Medchal–Malkajgiri",
            State = "Telangana",
        };
        string[] wardNames =
        [
            "Peddabazar", "Chinna Cheruvu", "Ambedkar Colony", "Gandhi Nagar", "Temple Street",
            "Weavers' Colony", "Kothapet", "Ramalayam Veedhi", "Indira Nagar", "School Road",
        ];
        for (var i = 0; i < wardNames.Length; i++)
            village.Wards.Add(new Ward { Number = i + 1, Name = wardNames[i] });
        db.Villages.Add(village);
        await db.SaveChangesAsync(ct);

        // ---- Election -------------------------------------------------------------------
        var election = new Election
        {
            VillageId = village.Id,
            Title = "Rampur Gram Panchayat General Election 2026",
            Post = "Sarpanch",
            Phase = phase,
            NominationStartsOn = today.AddDays(-21),
            NominationEndsOn = today.AddDays(-14),
            PollingDate = today,
            PollingStartsAt = new TimeOnly(7, 0),
            PollingEndsAt = new TimeOnly(17, 0),
        };
        db.Elections.Add(election);
        await db.SaveChangesAsync(ct);

        // ---- Electoral roll -------------------------------------------------------------
        var rng = new Random(20260906); // deterministic demo data
        string[] maleFirst = ["Ramesh", "Suresh", "Venkatesh", "Srinivas", "Mallesh", "Narsimha", "Anjaneyulu", "Raju", "Kiran", "Sai", "Yadagiri", "Bhaskar", "Ravi", "Prasad", "Naresh"];
        string[] femaleFirst = ["Lakshmi", "Padma", "Swapna", "Anitha", "Saritha", "Manjula", "Kavitha", "Sunitha", "Bhavani", "Radha", "Yellamma", "Jyothi", "Mamatha", "Shobha", "Sridevi"];
        string[] surnames = ["Goud", "Reddy", "Yadav", "Naik", "Mudiraj", "Chary", "Rao", "Kumar", "Pasha", "Begum", "Devi", "Nayak", "Padmashali", "Gari", "Mala"];

        var voters = new List<Voter>();
        foreach (var ward in village.Wards.OrderBy(w => w.Number))
        {
            var count = 18 + rng.Next(0, 10); // 18–27 voters per ward → ~220 total (small demo roll)
            for (var n = 1; n <= count; n++)
            {
                var female = rng.Next(2) == 0;
                var first = female ? femaleFirst[rng.Next(femaleFirst.Length)] : maleFirst[rng.Next(maleFirst.Length)];
                voters.Add(new Voter
                {
                    ElectionId = election.Id,
                    EpicNumber = $"TS/{village.Id:D2}/{ward.Number:D3}/{n:D4}",
                    FullName = $"{first} {surnames[rng.Next(surnames.Length)]}",
                    Age = 18 + rng.Next(0, 62),
                    Gender = female ? "Female" : "Male",
                    WardId = ward.Id,
                    HouseNumber = $"{ward.Number}-{rng.Next(1, 120)}{(rng.Next(4) == 0 ? "/A" : "")}",
                    Mobile = $"{rng.Next(6, 10)}{rng.Next(100000000, 999999999)}",
                });
            }
        }
        db.Voters.AddRange(voters);
        await db.SaveChangesAsync(ct);

        // ---- Nominations ----------------------------------------------------------------
        var wardsByNo = village.Wards.ToDictionary(w => w.Number);
        var filedAt = election.NominationStartsOn.ToDateTime(new TimeOnly(10, 30), DateTimeKind.Utc);
        var candidates = new List<Candidate>
        {
            new()
            {
                ElectionId = election.Id, FullName = "Lakshmi Narsimha Goud", FatherOrSpouseName = "Yadagiri Goud", Age = 42, Gender = "Male",
                WardId = wardsByNo[1].Id, Symbol = "Coconut", SymbolEmoji = "🥥", Education = "B.A.", Occupation = "Farmer",
                Manifesto = "Complete the pending CC roads in Peddabazar and Kothapet, restore the Chinna Cheruvu tank bund, and ensure every household gets Mission Bhagiratha water daily. Gram Sabha every quarter with published accounts.",
                NominatedOn = filedAt, Status = NominationStatus.Accepted, SerialNumber = 1, ReviewedOn = filedAt.AddDays(7),
            },
            new()
            {
                ElectionId = election.Id, FullName = "Padma Reddy", FatherOrSpouseName = "Srinivas Reddy", Age = 38, Gender = "Female",
                WardId = wardsByNo[4].Id, Symbol = "Water Pot", SymbolEmoji = "🏺", Education = "M.Sc.", Occupation = "Teacher",
                Manifesto = "A functioning Anganwadi in every ward, a digital library at the ZP High School, streetlights on every lane, and a women's self-help-group federation to run the village dairy collection centre.",
                NominatedOn = filedAt.AddHours(3), Status = NominationStatus.Accepted, SerialNumber = 2, ReviewedOn = filedAt.AddDays(7),
            },
            new()
            {
                ElectionId = election.Id, FullName = "Mallesh Yadav", FatherOrSpouseName = "Anjaneyulu Yadav", Age = 51, Gender = "Male",
                WardId = wardsByNo[7].Id, Symbol = "Tractor", SymbolEmoji = "🚜", Education = "Intermediate", Occupation = "Dairy farmer",
                Manifesto = "Fair MGNREGS wages paid on time, a modern cattle shed and veterinary camp every month, drainage for Weavers' Colony, and a crematorium with a proper approach road.",
                NominatedOn = filedAt.AddDays(1), Status = NominationStatus.Accepted, SerialNumber = 3, ReviewedOn = filedAt.AddDays(7),
            },
            new()
            {
                ElectionId = election.Id, FullName = "Swapna Naik", FatherOrSpouseName = "Kiran Naik", Age = 29, Gender = "Female",
                WardId = wardsByNo[9].Id, Symbol = "Bicycle", SymbolEmoji = "🚲", Education = "B.Tech.", Occupation = "Software engineer",
                Manifesto = "Free Wi-Fi at the Panchayat office and school, a skill-training centre for youth, segregated waste collection with a compost yard, and transparent online tracking of every Panchayat rupee.",
                NominatedOn = filedAt.AddDays(2), Status = NominationStatus.Accepted, SerialNumber = 4, ReviewedOn = filedAt.AddDays(7),
            },
            new()
            {
                ElectionId = election.Id, FullName = "Raju Mudiraj", FatherOrSpouseName = "Bhaskar Mudiraj", Age = 20, Gender = "Male",
                WardId = wardsByNo[2].Id, Symbol = "Kite", SymbolEmoji = "🪁", Education = "Degree (pursuing)", Occupation = "Student",
                Manifesto = "Youth sports ground, a fishing cooperative for Chinna Cheruvu, and a village bus stop shelter with drinking water.",
                NominatedOn = filedAt.AddDays(3), Status = NominationStatus.Rejected, RejectionReason = "Candidate is below the minimum age of 21 years.", ReviewedOn = filedAt.AddDays(7),
            },
        };

        // In early phases, keep the last nomination pending so scrutiny has something to do.
        if (phase <= ElectionPhase.Scrutiny)
        {
            candidates.Add(new Candidate
            {
                ElectionId = election.Id, FullName = "Venkatesh Chary", FatherOrSpouseName = "Narsimha Chary", Age = 45, Gender = "Male",
                WardId = wardsByNo[5].Id, Symbol = "Bell", SymbolEmoji = "🔔", Education = "SSC", Occupation = "Goldsmith",
                Manifesto = "Renovate the Ramalayam and its tank, build a community hall for weddings, and get a PHC sub-centre sanctioned for the village.",
                NominatedOn = filedAt.AddDays(4), Status = NominationStatus.Pending,
            });
            if (phase == ElectionPhase.Nomination)
            {
                foreach (var c in candidates.Where(c => c.Status == NominationStatus.Accepted))
                {
                    c.Status = NominationStatus.Pending;
                    c.SerialNumber = null;
                    c.ReviewedOn = null;
                }
            }
        }
        db.Candidates.AddRange(candidates);
        await db.SaveChangesAsync(ct);

        // ---- Votes (only when the demo starts at/after Polling) -------------------------
        if (phase >= ElectionPhase.Polling)
        {
            var accepted = candidates.Where(c => c.Status == NominationStatus.Accepted).ToList();
            // Weighted popularity so the result is interesting but not a landslide.
            double[] weights = [0.34, 0.31, 0.19, 0.13, 0.03 /* NOTA */];
            var share = phase == ElectionPhase.Polling ? 0.45 : 0.71; // turnout so far
            var start = election.PollingDate.ToDateTime(election.PollingStartsAt, DateTimeKind.Utc);
            var votes = new List<Vote>();

            foreach (var v in voters.Where(_ => rng.NextDouble() < share))
            {
                var roll = rng.NextDouble();
                int? pick = null;
                var acc = 0d;
                for (var i = 0; i < accepted.Count; i++)
                {
                    acc += weights[i];
                    if (roll < acc) { pick = accepted[i].Id; break; }
                }
                var castAt = start.AddMinutes(rng.Next(0, phase == ElectionPhase.Polling ? 5 * 60 : 10 * 60));
                v.HasVoted = true;
                v.VotedAt = castAt;
                votes.Add(new Vote
                {
                    ElectionId = election.Id,
                    CandidateId = pick,
                    WardId = v.WardId,
                    CastAt = castAt,
                    ReceiptNumber = $"GP{election.Id:D2}-SEED{votes.Count + 1:D4}-{rng.Next(0x1000, 0xFFFF):X4}",
                });
            }
            db.Votes.AddRange(votes);
            await db.SaveChangesAsync(ct);

            if (phase == ElectionPhase.Declared)
            {
                var winnerId = votes.Where(x => x.CandidateId != null).GroupBy(x => x.CandidateId)
                    .OrderByDescending(g => g.Count()).First().Key;
                election.WinnerCandidateId = winnerId;
                election.DeclaredAt = start.AddHours(12);
                await db.SaveChangesAsync(ct);
            }
        }

        logger.LogInformation(
            "Seeded demo village {Village} with {Wards} wards, {Voters} voters, {Candidates} nominations (phase {Phase}).",
            village.Name, village.Wards.Count, voters.Count, candidates.Count, phase);
    }

    private async Task WipeAsync(CancellationToken ct)
    {
        // Order matters because of FK constraints.
        await db.Elections.ExecuteUpdateAsync(s => s.SetProperty(e => e.WinnerCandidateId, (int?)null), ct);
        await db.Votes.ExecuteDeleteAsync(ct);
        await db.Candidates.ExecuteDeleteAsync(ct);
        await db.Voters.ExecuteDeleteAsync(ct);
        await db.Elections.ExecuteDeleteAsync(ct);
        await db.Wards.ExecuteDeleteAsync(ct);
        await db.Villages.ExecuteDeleteAsync(ct);
        await db.Users.ExecuteDeleteAsync(ct);
        db.ChangeTracker.Clear();
    }
}
