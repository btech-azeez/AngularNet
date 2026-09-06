using GramPanchayat.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace GramPanchayat.Api.Data;

public sealed class ElectionDbContext(DbContextOptions<ElectionDbContext> options) : DbContext(options)
{
    public DbSet<Village> Villages => Set<Village>();
    public DbSet<Ward> Wards => Set<Ward>();
    public DbSet<Election> Elections => Set<Election>();
    public DbSet<Candidate> Candidates => Set<Candidate>();
    public DbSet<Voter> Voters => Set<Voter>();
    public DbSet<Vote> Votes => Set<Vote>();
    public DbSet<AppUser> Users => Set<AppUser>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Village>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Mandal).HasMaxLength(120);
            e.Property(x => x.District).HasMaxLength(120);
            e.Property(x => x.State).HasMaxLength(80);
        });

        b.Entity<Ward>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(120);
            e.HasIndex(x => new { x.VillageId, x.Number }).IsUnique();
            e.HasOne(x => x.Village).WithMany(v => v.Wards).HasForeignKey(x => x.VillageId);
        });

        b.Entity<Election>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Post).HasMaxLength(60);
            e.Property(x => x.Phase).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasOne(x => x.Village).WithMany(v => v.Elections).HasForeignKey(x => x.VillageId);
            e.HasOne(x => x.WinnerCandidate).WithMany().HasForeignKey(x => x.WinnerCandidateId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<Candidate>(e =>
        {
            e.Property(x => x.FullName).HasMaxLength(120);
            e.Property(x => x.FatherOrSpouseName).HasMaxLength(120);
            e.Property(x => x.Gender).HasMaxLength(20);
            e.Property(x => x.Symbol).HasMaxLength(60);
            e.Property(x => x.SymbolEmoji).HasMaxLength(16);
            e.Property(x => x.Education).HasMaxLength(120);
            e.Property(x => x.Occupation).HasMaxLength(120);
            e.Property(x => x.Manifesto).HasMaxLength(2000);
            e.Property(x => x.PhotoUrl).HasMaxLength(400);
            e.Property(x => x.RejectionReason).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            // A symbol may only be used once per election (ignoring rejected/withdrawn is enforced in code).
            e.HasIndex(x => new { x.ElectionId, x.Symbol });
            e.HasIndex(x => new { x.ElectionId, x.SerialNumber }).IsUnique();
            e.HasOne(x => x.Election).WithMany(el => el.Candidates).HasForeignKey(x => x.ElectionId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Ward).WithMany().HasForeignKey(x => x.WardId).OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<Voter>(e =>
        {
            e.Property(x => x.EpicNumber).HasMaxLength(30);
            e.Property(x => x.FullName).HasMaxLength(120);
            e.Property(x => x.Gender).HasMaxLength(20);
            e.Property(x => x.HouseNumber).HasMaxLength(30);
            e.Property(x => x.Mobile).HasMaxLength(15);
            e.Property(x => x.OtpHash).HasMaxLength(128);
            e.HasIndex(x => new { x.ElectionId, x.EpicNumber }).IsUnique();
            e.HasOne(x => x.Election).WithMany(el => el.Voters).HasForeignKey(x => x.ElectionId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Ward).WithMany(w => w.Voters).HasForeignKey(x => x.WardId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<Vote>(e =>
        {
            e.Property(x => x.ReceiptNumber).HasMaxLength(40);
            e.HasIndex(x => x.ReceiptNumber).IsUnique();
            e.HasIndex(x => new { x.ElectionId, x.CandidateId });
            e.HasIndex(x => new { x.ElectionId, x.WardId });
            e.HasOne(x => x.Election).WithMany(el => el.Votes).HasForeignKey(x => x.ElectionId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Candidate).WithMany(c => c.Votes).HasForeignKey(x => x.CandidateId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<AppUser>(e =>
        {
            e.Property(x => x.Username).HasMaxLength(60);
            e.Property(x => x.DisplayName).HasMaxLength(120);
            e.Property(x => x.PasswordHash).HasMaxLength(200);
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(x => x.Username).IsUnique();
        });
    }
}
