using System.Net;
using System.Net.Http.Json;
using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GramPanchayat.Api.Tests;

/// <summary>Walks a fresh election through every phase, exercising the officer workflow.</summary>
public sealed class ElectionLifecycleTests
{
    [Fact]
    public async Task Full_lifecycle_from_nomination_to_declared_result()
    {
        using var factory = new ApiFactory(ElectionPhase.Nomination);
        var admin = await factory.AdminClientAsync();
        var anon = factory.CreateClient();
        var electionId = await factory.CurrentElectionIdAsync();

        // -- Nomination phase: the public can file a nomination -----------------------------
        var wards = await anon.GetFromJsonAsync<List<WardDto>>("/api/village/wards");
        var filed = await anon.PostAsJsonAsync($"/api/elections/{electionId}/candidates", new NominationRequest(
            "Test Candidate", "Test Parent", 35, "Female", wards![0].Id, "Umbrella", "☂️", "B.Com.", "Shopkeeper",
            "A test manifesto that is comfortably longer than thirty characters."));
        Assert.Equal(HttpStatusCode.Created, filed.StatusCode);
        var mine = await filed.Content.ReadFromJsonAsync<CandidateDto>();
        Assert.Equal(NominationStatus.Pending, mine!.Status);
        Assert.Null(mine.SerialNumber);

        // Duplicate symbol is refused
        var dup = await anon.PostAsJsonAsync($"/api/elections/{electionId}/candidates", new NominationRequest(
            "Another Person", "Another Parent", 40, "Male", wards[1].Id, "Umbrella", "☂️", "SSC", "Driver",
            "Another manifesto that is also longer than thirty characters."));
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);

        // Under-age is refused by validation (400)
        var young = await anon.PostAsJsonAsync($"/api/elections/{electionId}/candidates", new NominationRequest(
            "Too Young", "Parent", 19, "Male", wards[1].Id, "Drum", "🥁", "Inter", "Student",
            "Yet another manifesto that is longer than thirty characters."));
        Assert.Equal(HttpStatusCode.BadRequest, young.StatusCode);

        // Public list is empty (nothing accepted yet), officer list has everything
        var publicList = await anon.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates");
        Assert.Empty(publicList!);
        var officerList = await admin.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates");
        Assert.True(officerList!.Count >= 6);

        // Can't jump straight to Polling
        var jump = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Polling));
        Assert.Equal(HttpStatusCode.Conflict, jump.StatusCode);

        // -- Scrutiny ------------------------------------------------------------------------
        var toScrutiny = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Scrutiny));
        Assert.Equal(HttpStatusCode.OK, toScrutiny.StatusCode);

        // Polling can't open while nominations are pending
        var blocked = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Polling));
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var problem = await blocked.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("accepted or rejected", problem!.Detail);

        // Reject without a reason → 400; with reason → OK
        var pending = officerList.Where(c => c.Status == NominationStatus.Pending).ToList();
        var noReason = await admin.PostAsJsonAsync($"/api/elections/{electionId}/candidates/{pending[0].Id}/review",
            new ReviewNominationRequest(NominationStatus.Rejected, null));
        Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);

        var serial = 0;
        foreach (var c in pending)
        {
            var decision = c.Id == mine.Id
                ? new ReviewNominationRequest(NominationStatus.Rejected, "Test rejection reason")
                : new ReviewNominationRequest(NominationStatus.Accepted, null);
            var res = await admin.PostAsJsonAsync($"/api/elections/{electionId}/candidates/{c.Id}/review", decision);
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var reviewed = await res.Content.ReadFromJsonAsync<CandidateDto>();
            if (decision.Decision == NominationStatus.Accepted)
                Assert.Equal(++serial, reviewed!.SerialNumber);
            else
                Assert.Null(reviewed!.SerialNumber);
        }

        // Reviewing twice is a conflict
        var twice = await admin.PostAsJsonAsync($"/api/elections/{electionId}/candidates/{pending[0].Id}/review",
            new ReviewNominationRequest(NominationStatus.Accepted, null));
        Assert.Equal(HttpStatusCode.Conflict, twice.StatusCode);

        // -- Polling ------------------------------------------------------------------------
        var toPolling = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Polling));
        Assert.Equal(HttpStatusCode.OK, toPolling.StatusCode);

        // Nominations are closed now
        var late = await anon.PostAsJsonAsync($"/api/elections/{electionId}/candidates", new NominationRequest(
            "Late Comer", "Parent", 45, "Male", wards[2].Id, "Sun", "☀️", "B.A.", "Farmer",
            "A late manifesto that is longer than thirty characters for sure."));
        Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);

        // Roll is frozen
        var addVoter = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/voters",
            new CreateVoterRequest("New Voter", 30, "Female", wards[0].Id, "1-1", "9876543210"));
        Assert.Equal(HttpStatusCode.Conflict, addVoter.StatusCode);

        // Three voters vote: two for serial #1, one for serial #2
        var ballot = await anon.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates");
        Assert.Equal(serial, ballot!.Count);
        var first = ballot[0];
        var second = ballot[1];

        foreach (var (choice, idx) in new[] { (first, 0), (first, 1), (second, 2) })
        {
            var epic = await NthUnvotedEpicAsync(factory, idx);
            var (voter, _) = await factory.VoterClientAsync(epic);
            var res = await voter.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(choice.Id));
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        }

        // Declaring during Polling is refused
        var early = await admin.PostAsync($"/api/admin/elections/{electionId}/declare", null);
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);

        // -- Counting ----------------------------------------------------------------------
        var toCounting = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Counting));
        Assert.Equal(HttpStatusCode.OK, toCounting.StatusCode);

        // Voting is closed
        {
            var epic = await NthUnvotedEpicAsync(factory, 0);
            var (voter, _) = await factory.VoterClientAsync(epic);
            var closed = await voter.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(first.Id));
            Assert.Equal(HttpStatusCode.Conflict, closed.StatusCode);
        }

        var tally = await anon.GetFromJsonAsync<ElectionResultsDto>($"/api/elections/{electionId}/results");
        Assert.Equal(3, tally!.VotesCast);
        Assert.Equal(2, tally.Candidates.Single(c => c.CandidateId == first.Id).Votes);
        Assert.Equal(1, tally.Candidates.Single(c => c.CandidateId == second.Id).Votes);
        Assert.NotNull(tally.Winner);
        Assert.Equal(first.Id, tally.Winner.CandidateId);
        Assert.Equal(1, tally.Margin);
        Assert.Equal(1, tally.Candidates.First().Rank);

        // -- Declared ----------------------------------------------------------------------
        var declared = await admin.PostAsync($"/api/admin/elections/{electionId}/declare", null);
        Assert.Equal(HttpStatusCode.OK, declared.StatusCode);
        var final = await declared.Content.ReadFromJsonAsync<ElectionDto>();
        Assert.Equal(ElectionPhase.Declared, final!.Phase);
        Assert.Equal(first.Id, final.WinnerCandidateId);
        Assert.Equal(first.FullName, final.WinnerName);
        Assert.NotNull(final.DeclaredAt);

        // Nothing moves after declaration
        var after = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Counting));
        Assert.Equal(HttpStatusCode.Conflict, after.StatusCode);
    }

    [Fact]
    public async Task Officer_role_cannot_change_phase_but_can_review()
    {
        using var factory = new ApiFactory(ElectionPhase.Scrutiny);
        var officer = await factory.AdminClientAsync(DemoSeeder.OfficerUsername, DemoSeeder.OfficerPassword);
        var electionId = await factory.CurrentElectionIdAsync();

        var phase = await officer.PostAsJsonAsync($"/api/admin/elections/{electionId}/phase", new ChangePhaseRequest(ElectionPhase.Polling));
        Assert.Equal(HttpStatusCode.Forbidden, phase.StatusCode);

        var dash = await officer.GetAsync($"/api/admin/elections/{electionId}/dashboard");
        Assert.Equal(HttpStatusCode.OK, dash.StatusCode);
        var d = await dash.Content.ReadFromJsonAsync<DashboardDto>();
        Assert.Equal(1, d!.PendingNominations);

        var list = await officer.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates?status=Pending");
        var res = await officer.PostAsJsonAsync($"/api/elections/{electionId}/candidates/{list![0].Id}/review",
            new ReviewNominationRequest(NominationStatus.Accepted, null));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Admin_can_add_voter_before_polling_and_list_roll()
    {
        using var factory = new ApiFactory(ElectionPhase.Nomination);
        var admin = await factory.AdminClientAsync();
        var electionId = await factory.CurrentElectionIdAsync();
        var wards = await admin.GetFromJsonAsync<List<WardDto>>("/api/village/wards");

        var res = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/voters",
            new CreateVoterRequest("Anjali Devi", 27, "Female", wards![2].Id, "3-9", "9123456780"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var v = await res.Content.ReadFromJsonAsync<VoterDto>();
        Assert.StartsWith("TS/", v!.EpicNumber);
        Assert.Equal(3, v.WardNumber);

        var page = await admin.GetFromJsonAsync<PagedResult<VoterDto>>(
            $"/api/admin/elections/{electionId}/voters?search=Anjali&page=1&pageSize=10");
        Assert.Equal(1, page!.Total);
        Assert.Equal("Anjali Devi", page.Items[0].FullName);

        var bad = await admin.PostAsJsonAsync($"/api/admin/elections/{electionId}/voters",
            new CreateVoterRequest("Bad Mobile", 27, "Female", wards[2].Id, "3-9", "12345"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Anonymous_and_voter_cannot_reach_admin_endpoints()
    {
        using var factory = new ApiFactory(ElectionPhase.Polling);
        var electionId = await factory.CurrentElectionIdAsync();

        var anon = await factory.CreateClient().GetAsync($"/api/admin/elections/{electionId}/dashboard");
        Assert.Equal(HttpStatusCode.Unauthorized, anon.StatusCode);

        var (voter, _) = await factory.VoterClientAsync();
        var forbidden = await voter.GetAsync($"/api/admin/elections/{electionId}/dashboard");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Admin_login_rejects_bad_password()
    {
        using var factory = new ApiFactory();
        var res = await factory.CreateClient().PostAsJsonAsync("/api/auth/admin/login", new AdminLoginRequest("admin", "wrong"));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Demo_reset_restores_seed_state()
    {
        using var factory = new ApiFactory(ElectionPhase.Polling);
        var admin = await factory.AdminClientAsync();
        var electionId = await factory.CurrentElectionIdAsync();

        var (voter, _) = await factory.VoterClientAsync();
        (await voter.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(0))).EnsureSuccessStatusCode();
        var before = await admin.GetFromJsonAsync<ElectionDto>("/api/elections/current");

        var reset = await admin.PostAsync("/api/admin/demo/reset", null);
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        var after = await admin.GetFromJsonAsync<ElectionDto>("/api/elections/current");
        Assert.NotEqual(before!.Id, after!.Id); // brand-new election row
        Assert.Equal(ElectionPhase.Polling, after.Phase);
        Assert.Equal(4, after.CandidateCount);
    }

    [Fact]
    public async Task Health_and_openapi_are_exposed()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        var health = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);

        var openapi = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, openapi.StatusCode);
        var body = await openapi.Content.ReadAsStringAsync();
        Assert.Contains("Sarpanch", body);
        Assert.Contains("/api/elections/{electionId}/votes", body);
    }

    private static async Task<string> NthUnvotedEpicAsync(ApiFactory factory, int n)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ElectionDbContext>();
        return await db.Voters.Where(v => !v.HasVoted).OrderBy(v => v.Id).Skip(n).Select(v => v.EpicNumber).FirstAsync();
    }
}
