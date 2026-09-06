namespace GramPanchayat.Api.Services;

/// <summary>Business-rule violation surfaced to clients as an RFC 9457 problem response.</summary>
public sealed class DomainException(string message, int statusCode = StatusCodes.Status400BadRequest)
    : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public static DomainException NotFound(string what) => new($"{what} was not found.", StatusCodes.Status404NotFound);
    public static DomainException Conflict(string message) => new(message, StatusCodes.Status409Conflict);
    public static DomainException Forbidden(string message) => new(message, StatusCodes.Status403Forbidden);
}
