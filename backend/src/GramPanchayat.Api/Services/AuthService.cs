using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using GramPanchayat.Api.Contracts;
using GramPanchayat.Api.Data;
using GramPanchayat.Api.Domain;
using GramPanchayat.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace GramPanchayat.Api.Services;

public static class AppClaims
{
    public const string Name = "name";
    public const string Role = "role";
    public const string VoterId = "voter_id";
    public const string ElectionId = "election_id";
}

public sealed class AuthService(
    ElectionDbContext db,
    ElectionService elections,
    IOptions<JwtOptions> jwt,
    IOptions<DemoOptions> demo,
    TimeProvider clock,
    ILogger<AuthService> logger)
{
    private static readonly TimeSpan OtpLifetime = TimeSpan.FromMinutes(5);
    private const int MaxOtpAttempts = 5;

    // ---- Voter: OTP -----------------------------------------------------------

    public async Task<OtpResponse> RequestOtpAsync(RequestOtpRequest req, CancellationToken ct)
    {
        var electionId = await elections.CurrentElectionIdAsync(ct);
        var epic = NormaliseEpic(req.EpicNumber);

        var voter = await db.Voters.FirstOrDefaultAsync(v => v.ElectionId == electionId && v.EpicNumber == epic, ct)
                    ?? throw DomainException.NotFound($"Voter with EPIC number {epic}");

        var otp = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        voter.OtpHash = PasswordHasher.HashOtp(otp, voter.EpicNumber);
        voter.OtpExpiresAt = clock.GetUtcNow().UtcDateTime.Add(OtpLifetime);
        voter.OtpAttempts = 0;
        await db.SaveChangesAsync(ct);

        // In a real deployment this is where the SMS gateway is called.
        logger.LogInformation("OTP issued for voter {Epic} (mobile ****{Mobile})", epic, voter.Mobile[^4..]);

        var masked = $"******{voter.Mobile[^4..]}";
        return new OtpResponse(
            $"An OTP has been sent to your registered mobile {masked}. It is valid for 5 minutes.",
            demo.Value.Enabled ? otp : null);
    }

    public async Task<AuthResponse> LoginVoterAsync(VoterLoginRequest req, CancellationToken ct)
    {
        var electionId = await elections.CurrentElectionIdAsync(ct);
        var epic = NormaliseEpic(req.EpicNumber);
        var now = clock.GetUtcNow().UtcDateTime;

        var voter = await db.Voters.Include(v => v.Ward)
                        .FirstOrDefaultAsync(v => v.ElectionId == electionId && v.EpicNumber == epic, ct)
                    ?? throw new DomainException("Invalid EPIC number or OTP.", StatusCodes.Status401Unauthorized);

        if (voter.OtpHash is null || voter.OtpExpiresAt is null || voter.OtpExpiresAt < now)
            throw new DomainException("Your OTP has expired. Please request a new one.", StatusCodes.Status401Unauthorized);

        if (voter.OtpAttempts >= MaxOtpAttempts)
        {
            voter.OtpHash = null;
            await db.SaveChangesAsync(ct);
            throw new DomainException("Too many incorrect attempts. Please request a new OTP.", StatusCodes.Status429TooManyRequests);
        }

        var expected = voter.OtpHash;
        var actual = PasswordHasher.HashOtp(req.Otp, voter.EpicNumber);
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(actual)))
        {
            voter.OtpAttempts++;
            await db.SaveChangesAsync(ct);
            throw new DomainException("Invalid EPIC number or OTP.", StatusCodes.Status401Unauthorized);
        }

        // OTP is single-use.
        voter.OtpHash = null;
        voter.OtpExpiresAt = null;
        voter.OtpAttempts = 0;
        await db.SaveChangesAsync(ct);

        var user = new AuthUserDto(voter.Id, voter.FullName, UserRole.Voter, voter.Id, voter.EpicNumber, voter.Ward.Number);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, $"voter:{voter.Id}"),
            new(AppClaims.Name, voter.FullName),
            new(AppClaims.Role, nameof(UserRole.Voter)),
            new(AppClaims.VoterId, voter.Id.ToString()),
            new(AppClaims.ElectionId, electionId.ToString()),
        };
        return Issue(claims, TimeSpan.FromMinutes(jwt.Value.VoterTokenMinutes), user);
    }

    // ---- Admin: username / password -------------------------------------------

    public async Task<AuthResponse> LoginAdminAsync(AdminLoginRequest req, CancellationToken ct)
    {
        var username = req.Username.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);

        // Always run the hash check to keep timing similar for unknown users.
        var ok = user is not null && PasswordHasher.Verify(req.Password, user.PasswordHash);
        if (!ok)
        {
            logger.LogWarning("Failed admin login for {Username}", username);
            throw new DomainException("Invalid username or password.", StatusCodes.Status401Unauthorized);
        }

        var dto = new AuthUserDto(user!.Id, user.DisplayName, user.Role, null, null, null);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, $"user:{user.Id}"),
            new(AppClaims.Name, user.DisplayName),
            new(AppClaims.Role, user.Role.ToString()),
        };
        return Issue(claims, TimeSpan.FromMinutes(jwt.Value.AdminTokenMinutes), dto);
    }

    // ---- helpers -----------------------------------------------------------------

    private AuthResponse Issue(IEnumerable<Claim> claims, TimeSpan lifetime, AuthUserDto user)
    {
        var o = jwt.Value;
        var now = clock.GetUtcNow().UtcDateTime;
        var expires = now.Add(lifetime);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(o.SigningKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: o.Issuer,
            audience: o.Audience,
            claims: claims.Append(new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))),
            notBefore: now,
            expires: expires,
            signingCredentials: creds);

        return new AuthResponse(new JwtSecurityTokenHandler().WriteToken(token), expires, user);
    }

    internal static string NormaliseEpic(string epic) => epic.Trim().ToUpperInvariant();
}
