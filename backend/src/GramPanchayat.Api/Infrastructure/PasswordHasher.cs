using System.Security.Cryptography;

namespace GramPanchayat.Api.Infrastructure;

/// <summary>PBKDF2-SHA256 password hashing (format: pbkdf2$iterations$salt$hash).</summary>
public static class PasswordHasher
{
    private const int Iterations = 100_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"pbkdf2${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2") return false;
        if (!int.TryParse(parts[1], out var iterations)) return false;
        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    /// <summary>Hash for short-lived OTPs (SHA-256 over otp + salt); cheap because OTPs expire in minutes.</summary>
    public static string HashOtp(string otp, string salt)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{salt}:{otp}"));
        return Convert.ToHexString(bytes);
    }
}
