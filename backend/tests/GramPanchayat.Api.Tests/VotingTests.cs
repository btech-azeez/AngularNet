using System.Net;
using System.Net.Http.Json;
using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Domain;
using Microsoft.AspNetCore.Mvc;

namespace GramPanchayat.Api.Tests;

public sealed class VotingTests : IAsyncLifetime
{
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(ElectionPhase.Polling);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Public_endpoints_return_seeded_election()
    {
        var client = _factory.CreateClient();

        var village = await client.GetFromJsonAsync<VillageDto>("/api/village");
        var election = await client.GetFromJsonAsync<ElectionDto>("/api/elections/current");
        var wards = await client.GetFromJsonAsync<List<WardDto>>("/api/village/wards");

        Assert.NotNull(village);
        Assert.Equal("Rampur", village.Name);
        Assert.Equal(10, village.TotalWards);
        Assert.NotNull(election);
        Assert.Equal(ElectionPhase.Polling, election.Phase);
        Assert.Equal(4, election.CandidateCount);
        Assert.True(election.TotalVoters > 100);
        Assert.NotNull(wards);
        Assert.Equal(10, wards.Count);
        Assert.Equal(election.TotalVoters, wards.Sum(w => w.VoterCount));
    }

    [Fact]
    public async Task Public_candidate_list_only_shows_accepted_nominations()
    {
        var client = _factory.CreateClient();
        var electionId = await _factory.CurrentElectionIdAsync();

        var list = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates");

        Assert.NotNull(list);
        Assert.Equal(4, list.Count);
        Assert.All(list, c => Assert.Equal(NominationStatus.Accepted, c.Status));
        Assert.Equal([1, 2, 3, 4], list.Select(c => c.SerialNumber!.Value));
    }

    [Fact]
    public async Task Officer_sees_all_nominations_including_rejected()
    {
        var admin = await _factory.AdminClientAsync();
        var electionId = await _factory.CurrentElectionIdAsync();

        var list = await admin.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates");

        Assert.NotNull(list);
        Assert.Equal(5, list.Count);
        Assert.Contains(list, c => c.Status == NominationStatus.Rejected && c.RejectionReason!.Contains("age"));
    }

    [Fact]
    public async Task Voter_can_cast_exactly_one_vote()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var (client, voter) = await _factory.VoterClientAsync();
        Assert.False(voter.HasVoted);

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/elections/{electionId}/candidates");
        var choice = candidates![0];

        var before = await client.GetFromJsonAsync<ElectionDto>($"/api/elections/{electionId}");

        // First vote succeeds
        var res = await client.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(choice.Id));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var receipt = await res.Content.ReadFromJsonAsync<CastVoteResponse>();
        Assert.NotNull(receipt);
        Assert.StartsWith("GP", receipt.ReceiptNumber);

        // Status flips
        var me = await client.GetFromJsonAsync<VoterDto>("/api/voters/me");
        Assert.True(me!.HasVoted);
        Assert.NotNull(me.VotedAt);

        // Second vote is rejected with 409
        var again = await client.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(choice.Id));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var problem = await again.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("already voted", problem!.Detail);

        // Exactly one vote was added
        var after = await client.GetFromJsonAsync<ElectionDto>($"/api/elections/{electionId}");
        Assert.Equal(before!.VotesCast + 1, after!.VotesCast);
    }

    [Fact]
    public async Task Concurrent_votes_from_same_voter_only_record_one_ballot()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var (client, _) = await _factory.VoterClientAsync();
        var before = await client.GetFromJsonAsync<ElectionDto>($"/api/elections/{electionId}");

        var attempts = Enumerable.Range(0, 8)
            .Select(_ => client.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(0)))
            .ToArray();
        var responses = await Task.WhenAll(attempts);

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(7, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));

        var after = await client.GetFromJsonAsync<ElectionDto>($"/api/elections/{electionId}");
        Assert.Equal(before!.VotesCast + 1, after!.VotesCast);
    }

    [Fact]
    public async Task Nota_vote_is_accepted_and_counted_separately()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var (client, _) = await _factory.VoterClientAsync();

        var res = await client.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(0));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var receipt = await res.Content.ReadFromJsonAsync<CastVoteResponse>();
        Assert.Contains("NOTA", receipt!.Message);
    }

    [Fact]
    public async Task Voting_for_unknown_candidate_is_rejected()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var (client, _) = await _factory.VoterClientAsync();

        var res = await client.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(99999));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        // and the voter has NOT been marked as voted
        var me = await client.GetFromJsonAsync<VoterDto>("/api/voters/me");
        Assert.False(me!.HasVoted);
    }

    [Fact]
    public async Task Anonymous_user_cannot_vote()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var res = await _factory.CreateClient().PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(0));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Admin_token_cannot_be_used_to_vote()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var admin = await _factory.AdminClientAsync();
        var res = await admin.PostAsJsonAsync($"/api/elections/{electionId}/votes", new CastVoteRequest(0));
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Results_hide_tallies_during_polling()
    {
        var electionId = await _factory.CurrentElectionIdAsync();
        var r = await _factory.CreateClient().GetFromJsonAsync<ElectionResultsDto>($"/api/elections/{electionId}/results");

        Assert.NotNull(r);
        Assert.Equal(ElectionPhase.Polling, r.Phase);
        Assert.True(r.VotesCast > 0);              // turnout is public…
        Assert.All(r.Candidates, c => Assert.Equal(0, c.Votes)); // …but the tally is sealed
        Assert.Null(r.Winner);
        Assert.Equal(0, r.Nota);
    }

    [Fact]
    public async Task Wrong_otp_is_rejected_and_locks_after_too_many_attempts()
    {
        var epic = await _factory.FirstEpicAsync(mustNotHaveVoted: false);
        var client = _factory.CreateClient();
        var otpRes = await client.PostAsJsonAsync("/api/auth/voter/request-otp", new RequestOtpRequest(epic));
        otpRes.EnsureSuccessStatusCode();

        for (var i = 0; i < 5; i++)
        {
            var bad = await client.PostAsJsonAsync("/api/auth/voter/login", new VoterLoginRequest(epic, "000000"));
            Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        }

        var locked = await client.PostAsJsonAsync("/api/auth/voter/login", new VoterLoginRequest(epic, "000000"));
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
    }

    [Fact]
    public async Task Unknown_epic_returns_404_on_otp_request()
    {
        var res = await _factory.CreateClient()
            .PostAsJsonAsync("/api/auth/voter/request-otp", new RequestOtpRequest("XX/99/999/9999"));
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
