# Gram Panchayat Sarpanch Election

A full-stack demo of a **village (Gram Panchayat) Sarpanch election** — nominations, scrutiny, secret-ballot polling, live counting and result declaration.

| Layer    | Stack                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Backend  | **.NET 10** · ASP.NET Core minimal APIs · EF Core 10 · **SQL Server** (SQLite for tests) · JWT · OpenAPI/Scalar |
| Frontend | **Angular 22** · standalone components · signals & `rxResource` · Vitest                               |
| CI       | GitHub Actions — builds & tests both projects on every push                                            |

```
AngularNet/
├─ backend/
│  ├─ GramPanchayat.sln
│  ├─ src/GramPanchayat.Api/        ASP.NET Core API
│  └─ tests/GramPanchayat.Api.Tests xUnit integration tests (WebApplicationFactory + in-memory SQLite)
├─ frontend/                        Angular 22 app (ng serve proxies /api → http://localhost:5080)
└─ .github/workflows/ci.yml
```

---

## How the election works

```
Scheduled → Nomination → Scrutiny → Polling → Counting → Declared
```

| Phase          | What happens                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **Nomination** | Anyone files a nomination: name, ward, education, occupation, manifesto and a free **symbol** (🥥 🚲 🚜 …). Symbols are unique per election, minimum age 21. |
| **Scrutiny**   | The Returning Officer accepts/rejects each nomination (a reason is mandatory for rejection). Accepted candidates get a **ballot serial number**. Polling can't open while anything is pending. |
| **Polling**    | Voters sign in with their **EPIC (voter-ID) number + OTP** and cast **one** secret ballot (or **NOTA**). They get a receipt number. Tallies are sealed — only turnout is public. |
| **Counting**   | Results page goes live (auto-refreshes every 5 s): candidate ranking, margin, NOTA, ward-wise breakdown. |
| **Declared**   | Officer declares the leader as **Sarpanch**. A tie at the top blocks declaration.                       |

Roles: **Admin** (Returning Officer — full control), **Officer** (polling staff — scrutiny, roll, dashboard), **Voter**.

The demo seeds *Rampur Gram Panchayat* (Shamirpet mandal, Telangana): 10 wards, ~220 voters, 4 accepted candidates, 1 rejected nomination and a partial turnout so every screen has data.

---

## Run it locally

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Node.js 22+ and npm
- SQL Server — LocalDB (ships with Visual Studio), SQL Server Express, or Docker:
  ```bash
  docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=YourStrong!Passw0rd" -p 1433:1433 -d mcr.microsoft.com/mssql/server:2022-latest
  ```

### 1. Backend

```bash
cd backend
dotnet restore
dotnet run --project src/GramPanchayat.Api
```

- API: <http://localhost:5080>
- Interactive docs (Scalar): <http://localhost:5080/docs>
- Health: <http://localhost:5080/health>

On first start it creates the database (`GramPanchayatElection`) and seeds demo data.

**Connection string** — edit `backend/src/GramPanchayat.Api/appsettings.Development.json` (defaults to LocalDB) or override with an environment variable:

```bash
# Docker / SQL Server Express
ConnectionStrings__Default="Server=localhost,1433;Database=GramPanchayatElection;User Id=sa;Password=YourStrong!Passw0rd;TrustServerCertificate=True" \
dotnet run --project src/GramPanchayat.Api
```

**No SQL Server handy?** Run on SQLite instead:

```bash
dotnet run --project src/GramPanchayat.Api --launch-profile sqlite
```

### 2. Frontend

```bash
cd frontend
npm install
npm start          # http://localhost:4200  (proxies /api to :5080)
```

### 3. Sign in

| Role                       | Credentials                                                |
| -------------------------- | ---------------------------------------------------------- |
| Returning Officer (Admin)  | `admin` / `Admin@123`                                       |
| Polling Officer            | `officer` / `Officer@123`                                   |
| Voter                      | any EPIC, e.g. `TS/01/001/0001` — the OTP is shown on screen in demo mode |

Use **Admin → Voter roll** to browse every EPIC number.

---

## Configuration (`appsettings.json`)

| Key                   | Default     | Purpose                                                                 |
| --------------------- | ----------- | ----------------------------------------------------------------------- |
| `Database:Provider`   | `SqlServer` | `SqlServer` or `Sqlite`                                                 |
| `Database:AutoMigrate`| `true`      | Create/migrate the schema on startup                                    |
| `Demo:Enabled`        | `true`      | Return OTPs in the API response (no SMS) and enable `POST /api/admin/demo/reset` |
| `Demo:SeedOnStartup`  | `true`      | Seed the sample village if the DB is empty                              |
| `Demo:InitialPhase`   | `Polling`   | Phase the seeded election starts in (`Nomination`, `Scrutiny`, `Polling`, `Counting`, `Declared`) |
| `Jwt:SigningKey`      | *(demo)*    | **Change in production** (≥ 32 bytes)                                   |
| `Cors:Origins`        | `[]`        | Allowed origins; empty = allow all (dev)                                |

> Disable `Demo:Enabled` and set a real `Jwt:SigningKey` (e.g. via `dotnet user-secrets`) before any real use.

---

## API overview

| Method & path                                              | Auth     | Description                                   |
| ---------------------------------------------------------- | -------- | --------------------------------------------- |
| `GET  /api/village`, `GET /api/village/wards`              | –        | Village & wards                               |
| `GET  /api/elections/current`, `GET /api/elections/{id}`   | –        | Election summary, phase, turnout              |
| `GET  /api/elections/{id}/candidates[?status=]`            | –/Officer| Accepted candidates (public) / all (officers) |
| `POST /api/elections/{id}/candidates`                      | –        | File a nomination (Nomination phase)          |
| `POST /api/elections/{id}/candidates/{cid}/review`         | Officer  | Accept / reject                               |
| `POST /api/auth/voter/request-otp`, `POST /api/auth/voter/login` | –  | Voter OTP flow → JWT                          |
| `POST /api/auth/admin/login`                               | –        | Officer login → JWT                           |
| `GET  /api/voters/me`                                      | Voter    | Own roll entry & voted status                 |
| `POST /api/elections/{id}/votes` `{ candidateId }` (0 = NOTA) | Voter | Cast the ballot (atomic, once)                |
| `GET  /api/elections/{id}/results`                         | –        | Tally (sealed until Counting)                 |
| `GET  /api/admin/elections/{id}/dashboard`                 | Officer  | Stats, pending scrutiny, hourly turnout       |
| `POST /api/admin/elections/{id}/phase` `{ phase }`         | Admin    | Advance one phase                             |
| `POST /api/admin/elections/{id}/declare`                   | Admin    | Declare the winner                            |
| `GET/POST /api/admin/elections/{id}/voters`                | Officer  | Electoral roll (frozen once polling starts)   |
| `POST /api/admin/demo/reset`                               | Admin    | Re-seed demo data                             |

Errors follow RFC 9457 *Problem Details*.

---

## Tests

```bash
# Backend — 19 integration tests (lifecycle, one-vote guarantee incl. concurrency, auth, roles, results sealing)
cd backend && dotnet test

# Frontend
cd frontend && npm test
```

## Building for deployment

```bash
cd frontend && npm run build           # → frontend/dist/frontend/browser
cp -r dist/frontend/browser/* ../backend/src/GramPanchayat.Api/wwwroot/
cd ../backend && dotnet publish src/GramPanchayat.Api -c Release -o out
```

When a `wwwroot` folder exists the API serves the Angular app itself (SPA fallback), so a single host serves everything.
