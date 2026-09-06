/**
 * Lightweight in-memory mock of the GramPanchayat.Api for front-end development
 * when the .NET backend / SQL Server are not available (e.g. in a sandbox).
 *
 *   node mock-api/server.mjs          # listens on :5080, same routes as the real API
 *
 * It mirrors the real API's behaviour closely enough for every screen: phases,
 * nominations, OTP login, one-vote-per-voter, sealed tallies, admin actions.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 5080);

// ---------------------------------------------------------------------------------
// Seed data (kept in sync with backend/src/GramPanchayat.Api/Data/DemoSeeder.cs)
// ---------------------------------------------------------------------------------
const PHASES = ['Scheduled', 'Nomination', 'Scrutiny', 'Polling', 'Counting', 'Declared'];
const rng = mulberry32(20260906);

const village = { id: 1, name: 'Rampur', mandal: 'Shamirpet', district: 'Medchal–Malkajgiri', state: 'Telangana' };
const wardNames = ['Peddabazar', 'Chinna Cheruvu', 'Ambedkar Colony', 'Gandhi Nagar', 'Temple Street', "Weavers' Colony", 'Kothapet', 'Ramalayam Veedhi', 'Indira Nagar', 'School Road'];
const wards = wardNames.map((name, i) => ({ id: i + 1, villageId: 1, number: i + 1, name }));

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

let state;
function seed(initialPhase = process.env.INITIAL_PHASE || 'Polling') {
  const election = {
    id: (state?.election.id ?? 0) + 1,
    villageId: 1,
    title: 'Rampur Gram Panchayat General Election 2026',
    post: 'Sarpanch',
    phase: initialPhase,
    nominationStartsOn: iso(addDays(today, -21)),
    nominationEndsOn: iso(addDays(today, -14)),
    pollingDate: iso(today),
    pollingStartsAt: '07:00',
    pollingEndsAt: '17:00',
    declaredAt: null,
    winnerCandidateId: null,
  };

  const maleFirst = ['Ramesh', 'Suresh', 'Venkatesh', 'Srinivas', 'Mallesh', 'Narsimha', 'Anjaneyulu', 'Raju', 'Kiran', 'Sai', 'Yadagiri', 'Bhaskar', 'Ravi', 'Prasad', 'Naresh'];
  const femaleFirst = ['Lakshmi', 'Padma', 'Swapna', 'Anitha', 'Saritha', 'Manjula', 'Kavitha', 'Sunitha', 'Bhavani', 'Radha', 'Yellamma', 'Jyothi', 'Mamatha', 'Shobha', 'Sridevi'];
  const surnames = ['Goud', 'Reddy', 'Yadav', 'Naik', 'Mudiraj', 'Chary', 'Rao', 'Kumar', 'Pasha', 'Begum', 'Devi', 'Nayak', 'Padmashali', 'Gari', 'Mala'];
  const pick = (a) => a[Math.floor(rng() * a.length)];

  const voters = [];
  let vid = 0;
  for (const w of wards) {
    const count = 18 + Math.floor(rng() * 10);
    for (let n = 1; n <= count; n++) {
      const female = rng() < 0.5;
      voters.push({
        id: ++vid,
        epicNumber: `TS/01/${String(w.number).padStart(3, '0')}/${String(n).padStart(4, '0')}`,
        fullName: `${female ? pick(femaleFirst) : pick(maleFirst)} ${pick(surnames)}`,
        age: 18 + Math.floor(rng() * 62),
        gender: female ? 'Female' : 'Male',
        wardId: w.id,
        houseNumber: `${w.number}-${1 + Math.floor(rng() * 120)}`,
        mobile: `${6 + Math.floor(rng() * 4)}${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`,
        hasVoted: false,
        votedAt: null,
        otp: null,
        otpExpires: 0,
        otpAttempts: 0,
      });
    }
  }

  const filed = addDays(today, -21);
  filed.setHours(10, 30, 0, 0);
  const mk = (o) => ({ electionId: election.id, photoUrl: null, rejectionReason: null, serialNumber: null, ...o });
  let cid = 0;
  const candidates = [
    mk({ id: ++cid, fullName: 'Lakshmi Narsimha Goud', fatherOrSpouseName: 'Yadagiri Goud', age: 42, gender: 'Male', wardId: 1, symbol: 'Coconut', symbolEmoji: '🥥', education: 'B.A.', occupation: 'Farmer', manifesto: 'Complete the pending CC roads in Peddabazar and Kothapet, restore the Chinna Cheruvu tank bund, and ensure every household gets Mission Bhagiratha water daily. Gram Sabha every quarter with published accounts.', nominatedOn: filed.toISOString(), status: 'Accepted', serialNumber: 1 }),
    mk({ id: ++cid, fullName: 'Padma Reddy', fatherOrSpouseName: 'Srinivas Reddy', age: 38, gender: 'Female', wardId: 4, symbol: 'Water Pot', symbolEmoji: '🏺', education: 'M.Sc.', occupation: 'Teacher', manifesto: "A functioning Anganwadi in every ward, a digital library at the ZP High School, streetlights on every lane, and a women's self-help-group federation to run the village dairy collection centre.", nominatedOn: new Date(filed.getTime() + 3 * 36e5).toISOString(), status: 'Accepted', serialNumber: 2 }),
    mk({ id: ++cid, fullName: 'Mallesh Yadav', fatherOrSpouseName: 'Anjaneyulu Yadav', age: 51, gender: 'Male', wardId: 7, symbol: 'Tractor', symbolEmoji: '🚜', education: 'Intermediate', occupation: 'Dairy farmer', manifesto: "Fair MGNREGS wages paid on time, a modern cattle shed and veterinary camp every month, drainage for Weavers' Colony, and a crematorium with a proper approach road.", nominatedOn: addDays(filed, 1).toISOString(), status: 'Accepted', serialNumber: 3 }),
    mk({ id: ++cid, fullName: 'Swapna Naik', fatherOrSpouseName: 'Kiran Naik', age: 29, gender: 'Female', wardId: 9, symbol: 'Bicycle', symbolEmoji: '🚲', education: 'B.Tech.', occupation: 'Software engineer', manifesto: 'Free Wi-Fi at the Panchayat office and school, a skill-training centre for youth, segregated waste collection with a compost yard, and transparent online tracking of every Panchayat rupee.', nominatedOn: addDays(filed, 2).toISOString(), status: 'Accepted', serialNumber: 4 }),
    mk({ id: ++cid, fullName: 'Raju Mudiraj', fatherOrSpouseName: 'Bhaskar Mudiraj', age: 20, gender: 'Male', wardId: 2, symbol: 'Kite', symbolEmoji: '🪁', education: 'Degree (pursuing)', occupation: 'Student', manifesto: 'Youth sports ground, a fishing cooperative for Chinna Cheruvu, and a village bus stop shelter with drinking water.', nominatedOn: addDays(filed, 3).toISOString(), status: 'Rejected', rejectionReason: 'Candidate is below the minimum age of 21 years.' }),
  ];
  const phaseIdx = PHASES.indexOf(initialPhase);
  if (phaseIdx <= 2) {
    candidates.push(mk({ id: ++cid, fullName: 'Venkatesh Chary', fatherOrSpouseName: 'Narsimha Chary', age: 45, gender: 'Male', wardId: 5, symbol: 'Bell', symbolEmoji: '🔔', education: 'SSC', occupation: 'Goldsmith', manifesto: 'Renovate the Ramalayam and its tank, build a community hall for weddings, and get a PHC sub-centre sanctioned for the village.', nominatedOn: addDays(filed, 4).toISOString(), status: 'Pending' }));
    if (initialPhase === 'Nomination') for (const c of candidates) if (c.status === 'Accepted') { c.status = 'Pending'; c.serialNumber = null; }
  }

  const votes = [];
  if (phaseIdx >= 3) {
    const accepted = candidates.filter((c) => c.status === 'Accepted');
    const weights = [0.34, 0.31, 0.19, 0.13, 0.03];
    const share = initialPhase === 'Polling' ? 0.45 : 0.71;
    const start = new Date(`${election.pollingDate}T07:00:00Z`).getTime();
    for (const v of voters) {
      if (rng() >= share) continue;
      const roll = rng();
      let acc = 0, pickId = null;
      for (let i = 0; i < accepted.length; i++) { acc += weights[i]; if (roll < acc) { pickId = accepted[i].id; break; } }
      const castAt = new Date(start + Math.floor(rng() * (initialPhase === 'Polling' ? 300 : 600)) * 60e3).toISOString();
      v.hasVoted = true; v.votedAt = castAt;
      votes.push({ candidateId: pickId, wardId: v.wardId, castAt });
    }
    if (initialPhase === 'Declared') {
      const counts = {};
      for (const x of votes) if (x.candidateId) counts[x.candidateId] = (counts[x.candidateId] || 0) + 1;
      election.winnerCandidateId = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
      election.declaredAt = new Date(start + 12 * 36e5).toISOString();
    }
  }
  state = { election, voters, candidates, votes, nextCandidateId: cid + 1 };
}
seed();

const users = {
  admin: { id: 1, name: 'Returning Officer', role: 'Admin', password: 'Admin@123' },
  officer: { id: 2, name: 'Polling Officer', role: 'Officer', password: 'Officer@123' },
};
const tokens = new Map(); // token -> principal

// ---------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------
class Problem extends Error { constructor(status, detail, title) { super(detail); this.status = status; this.title = title; } }
const notFound = (w) => new Problem(404, `${w} was not found.`, 'Not found');
const conflict = (d) => new Problem(409, d, 'Conflict');
const bad = (d) => new Problem(400, d, 'Request could not be processed');
const pct = (p, w) => (w === 0 ? 0 : Math.round((p * 10000) / w) / 100);
const wardNo = (id) => wards.find((w) => w.id === id)?.number ?? 0;

const candDto = (c) => ({ ...c, wardNumber: wardNo(c.wardId) });
const voterDto = (v) => ({ id: v.id, epicNumber: v.epicNumber, fullName: v.fullName, age: v.age, gender: v.gender, wardId: v.wardId, wardNumber: wardNo(v.wardId), houseNumber: v.houseNumber, mobile: v.mobile, hasVoted: v.hasVoted, votedAt: v.votedAt });
const wardDto = (w) => ({ ...w, voterCount: state.voters.filter((v) => v.wardId === w.id).length, votedCount: state.voters.filter((v) => v.wardId === w.id && v.hasVoted).length });
const electionDto = () => {
  const e = state.election;
  const winner = state.candidates.find((c) => c.id === e.winnerCandidateId);
  return { ...e, villageName: village.name, totalVoters: state.voters.length, votesCast: state.votes.length, turnoutPercent: pct(state.votes.length, state.voters.length), candidateCount: state.candidates.filter((c) => c.status === 'Accepted').length, winnerName: winner?.fullName ?? null };
};

function results(forceReveal = false) {
  const e = state.election;
  const reveal = forceReveal || PHASES.indexOf(e.phase) >= 4;
  const accepted = state.candidates.filter((c) => c.status === 'Accepted').sort((a, b) => a.serialNumber - b.serialNumber);
  const tally = reveal ? state.votes : [];
  const count = (pred) => tally.filter(pred).length;
  const ranked = accepted.map((c) => ({ c, votes: count((v) => v.candidateId === c.id) })).sort((a, b) => b.votes - a.votes || a.c.serialNumber - b.c.serialNumber);
  const top = ranked[0]?.votes ?? 0;
  const tied = ranked.filter((r) => r.votes === top).length > 1;
  let rank = 0, prev = -1;
  const candidates = ranked.map((r, i) => { if (r.votes !== prev) rank = i + 1; prev = r.votes; return { candidateId: r.c.id, fullName: r.c.fullName, symbol: r.c.symbol, symbolEmoji: r.c.symbolEmoji, wardNumber: wardNo(r.c.wardId), votes: r.votes, percent: pct(r.votes, state.votes.length), rank, isWinner: reveal && top > 0 && !tied && i === 0 }; });
  const winner = candidates.find((c) => c.isWinner) ?? null;
  const wardsOut = wards.map((w) => {
    const candidateVotes = Object.fromEntries(accepted.map((c) => [c.id, count((v) => v.wardId === w.id && v.candidateId === c.id)]));
    const lead = Object.entries(candidateVotes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const leadId = lead.length && (lead.length === 1 || lead[0][1] > lead[1][1]) ? Number(lead[0][0]) : null;
    const wv = state.votes.filter((v) => v.wardId === w.id).length, wt = state.voters.filter((v) => v.wardId === w.id).length;
    return { wardId: w.id, wardNumber: w.number, wardName: w.name, totalVoters: wt, votesCast: wv, turnoutPercent: pct(wv, wt), leadingCandidateId: leadId, leadingCandidateName: leadId ? accepted.find((c) => c.id === leadId).fullName : null, candidateVotes };
  });
  return { electionId: e.id, title: e.title, phase: e.phase, totalVoters: state.voters.length, votesCast: state.votes.length, turnoutPercent: pct(state.votes.length, state.voters.length), nota: count((v) => v.candidateId === null), declaredAt: e.declaredAt, winner, margin: winner ? top - (ranked[1]?.votes ?? 0) : top, candidates, wards: wardsOut };
}

function principal(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  return t ? tokens.get(t) ?? null : null;
}
function requireRole(req, ...roles) {
  const p = principal(req);
  if (!p) throw new Problem(401, 'Please sign in to continue.', 'Unauthorized');
  if (!roles.includes(p.role)) throw new Problem(403, 'You are not allowed to do that.', 'Forbidden');
  return p;
}
const isOfficer = (req) => { const p = principal(req); return !!p && (p.role === 'Admin' || p.role === 'Officer'); };
function issue(user) { const t = crypto.randomBytes(24).toString('hex'); tokens.set(t, user); return { token: t, expiresAt: new Date(Date.now() + 8 * 36e5).toISOString(), user }; }
function requireElection(id) { if (Number(id) !== state.election.id) throw notFound('Election'); }

// ---------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------
const routes = [];
const on = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'), handler });

on('GET', '/api/village', () => ({ ...village, totalWards: wards.length }));
on('GET', '/api/village/wards', () => wards.map(wardDto));
on('GET', '/api/elections/current', () => electionDto());
on('GET', '/api/elections/:id', ({ p }) => { requireElection(p.id); return electionDto(); });
on('GET', '/api/elections/:id/results', ({ p }) => { requireElection(p.id); return results(); });

on('GET', '/api/elections/:id/candidates', ({ p, q, req }) => {
  requireElection(p.id);
  let list = state.candidates;
  if (!isOfficer(req)) list = list.filter((c) => c.status === 'Accepted');
  else if (q.get('status')) list = list.filter((c) => c.status === q.get('status'));
  return list.map(candDto);
});
on('GET', '/api/elections/:id/candidates/:cid', ({ p }) => { requireElection(p.id); const c = state.candidates.find((x) => x.id === Number(p.cid)); if (!c) throw notFound('Candidate'); return candDto(c); });
on('POST', '/api/elections/:id/candidates', ({ p, body }) => {
  requireElection(p.id);
  if (state.election.phase !== 'Nomination') throw conflict(`Nominations are not open (current phase: ${state.election.phase}).`);
  const errors = {};
  if (!body.fullName || body.fullName.trim().length < 3) errors.FullName = ['The FullName field must be at least 3 characters.'];
  if (!(body.age >= 21 && body.age <= 100)) errors.Age = ['A candidate must be between 21 and 100 years old.'];
  if (!body.manifesto || body.manifesto.trim().length < 30) errors.Manifesto = ['The Manifesto field must be at least 30 characters.'];
  if (Object.keys(errors).length) throw Object.assign(new Problem(400, 'One or more validation errors occurred.', 'Validation failed'), { errors });
  if (!wards.some((w) => w.id === Number(body.wardId))) throw bad('The selected ward does not belong to this village.');
  if (state.candidates.some((c) => c.symbol === body.symbol.trim() && ['Pending', 'Accepted'].includes(c.status))) throw conflict(`The symbol "${body.symbol}" has already been allotted to another candidate.`);
  const c = { id: state.nextCandidateId++, electionId: state.election.id, fullName: body.fullName.trim(), fatherOrSpouseName: body.fatherOrSpouseName.trim(), age: body.age, gender: body.gender, wardId: Number(body.wardId), symbol: body.symbol.trim(), symbolEmoji: body.symbolEmoji, education: body.education.trim(), occupation: body.occupation.trim(), manifesto: body.manifesto.trim(), photoUrl: null, status: 'Pending', rejectionReason: null, nominatedOn: new Date().toISOString(), serialNumber: null };
  state.candidates.push(c);
  return [201, candDto(c)];
});
on('POST', '/api/elections/:id/candidates/:cid/review', ({ p, body, req }) => {
  requireRole(req, 'Admin', 'Officer'); requireElection(p.id);
  if (!['Nomination', 'Scrutiny'].includes(state.election.phase)) throw conflict(`Nominations can only be reviewed during Nomination or Scrutiny (current phase: ${state.election.phase}).`);
  const c = state.candidates.find((x) => x.id === Number(p.cid)); if (!c) throw notFound('Candidate');
  if (c.status !== 'Pending') throw conflict(`This nomination has already been ${c.status.toLowerCase()}.`);
  if (body.decision === 'Rejected') { if (!body.reason || body.reason.trim().length < 5) throw bad('A reason (at least 5 characters) is required when rejecting a nomination.'); c.status = 'Rejected'; c.rejectionReason = body.reason.trim(); }
  else if (body.decision === 'Accepted') { c.status = 'Accepted'; c.serialNumber = Math.max(0, ...state.candidates.map((x) => x.serialNumber || 0)) + 1; }
  else throw bad('Decision must be Accepted or Rejected.');
  return candDto(c);
});
on('POST', '/api/elections/:id/candidates/:cid/withdraw', ({ p, req }) => {
  requireRole(req, 'Admin', 'Officer'); requireElection(p.id);
  const c = state.candidates.find((x) => x.id === Number(p.cid)); if (!c) throw notFound('Candidate');
  c.status = 'Withdrawn'; c.serialNumber = null; return candDto(c);
});

on('POST', '/api/auth/voter/request-otp', ({ body }) => {
  const epic = (body.epicNumber || '').trim().toUpperCase();
  const v = state.voters.find((x) => x.epicNumber === epic); if (!v) throw notFound(`Voter with EPIC number ${epic}`);
  v.otp = String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); v.otpExpires = Date.now() + 5 * 60e3; v.otpAttempts = 0;
  return { message: `An OTP has been sent to your registered mobile ******${v.mobile.slice(-4)}. It is valid for 5 minutes.`, demoOtp: v.otp };
});
on('POST', '/api/auth/voter/login', ({ body }) => {
  const epic = (body.epicNumber || '').trim().toUpperCase();
  const v = state.voters.find((x) => x.epicNumber === epic);
  if (!v) throw new Problem(401, 'Invalid EPIC number or OTP.', 'Unauthorized');
  if (!v.otp || v.otpExpires < Date.now()) throw new Problem(401, 'Your OTP has expired. Please request a new one.', 'Unauthorized');
  if (v.otpAttempts >= 5) { v.otp = null; throw new Problem(429, 'Too many incorrect attempts. Please request a new OTP.', 'Too many requests'); }
  if (v.otp !== body.otp) { v.otpAttempts++; throw new Problem(401, 'Invalid EPIC number or OTP.', 'Unauthorized'); }
  v.otp = null;
  return issue({ id: v.id, name: v.fullName, role: 'Voter', voterId: v.id, epicNumber: v.epicNumber, wardNumber: wardNo(v.wardId) });
});
on('POST', '/api/auth/admin/login', ({ body }) => {
  const u = users[(body.username || '').trim().toLowerCase()];
  if (!u || u.password !== body.password) throw new Problem(401, 'Invalid username or password.', 'Unauthorized');
  return issue({ id: u.id, name: u.name, role: u.role, voterId: null, epicNumber: null, wardNumber: null });
});

on('GET', '/api/voters/me', ({ req }) => { const p = requireRole(req, 'Voter'); const v = state.voters.find((x) => x.id === p.voterId); if (!v) throw notFound('Voter'); return voterDto(v); });
on('POST', '/api/elections/:id/votes', ({ p, body, req }) => {
  const who = requireRole(req, 'Voter'); requireElection(p.id);
  const e = state.election;
  if (e.phase !== 'Polling') throw conflict(PHASES.indexOf(e.phase) < 3 ? 'Polling has not started yet.' : 'Polling has closed.');
  const v = state.voters.find((x) => x.id === who.voterId); if (!v) throw notFound('Voter');
  if (v.hasVoted) throw conflict('You have already voted in this election. Each elector may vote only once.');
  let candidateId = null;
  if (body.candidateId !== 0) { const c = state.candidates.find((x) => x.id === Number(body.candidateId) && x.status === 'Accepted'); if (!c) throw bad('The selected candidate is not on the ballot.'); candidateId = c.id; }
  const now = new Date().toISOString();
  v.hasVoted = true; v.votedAt = now;
  state.votes.push({ candidateId, wardId: v.wardId, castAt: now });
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  return { receiptNumber: `GP${String(e.id).padStart(2, '0')}-${hex.slice(0, 6)}-${hex.slice(6)}`, castAt: now, message: candidateId === null ? 'Your NOTA vote has been recorded.' : 'Your vote has been recorded. Thank you for participating in your Gram Panchayat election.' };
});

on('GET', '/api/admin/elections/:id/dashboard', ({ p, req }) => {
  requireRole(req, 'Admin', 'Officer'); requireElection(p.id);
  const by = (s) => state.candidates.filter((c) => c.status === s).length;
  const hours = {};
  for (const v of state.votes) { const h = v.castAt.slice(11, 13) + ':00'; hours[h] = (hours[h] || 0) + 1; }
  const voted = state.voters.filter((v) => v.hasVoted).length;
  return { election: electionDto(), wards: wards.map(wardDto), pendingNominations: by('Pending'), acceptedCandidates: by('Accepted'), rejectedNominations: by('Rejected'), votersTotal: state.voters.length, votersVoted: voted, turnoutPercent: pct(voted, state.voters.length), hourlyTurnout: Object.entries(hours).sort().map(([hour, votes]) => ({ hour, votes })) };
});
on('POST', '/api/admin/elections/:id/phase', ({ p, body, req }) => {
  requireRole(req, 'Admin'); requireElection(p.id);
  const e = state.election, cur = PHASES.indexOf(e.phase), to = PHASES.indexOf(body.phase);
  if (body.phase === 'Declared') throw bad('Use the declare endpoint to declare the result.');
  if (to !== cur + 1) throw conflict(`Cannot move from ${e.phase} to ${body.phase}. Phases must advance one step at a time and never go back.`);
  if (body.phase === 'Scrutiny' && !state.candidates.some((c) => c.status !== 'Withdrawn')) throw conflict('Cannot close nominations: no nominations have been filed.');
  if (body.phase === 'Polling') {
    if (state.candidates.some((c) => c.status === 'Pending')) throw conflict('All nominations must be accepted or rejected before polling can open.');
    if (!state.candidates.some((c) => c.status === 'Accepted')) throw conflict('At least one accepted candidate is required to open polling.');
  }
  e.phase = body.phase; return electionDto();
});
on('POST', '/api/admin/elections/:id/declare', ({ p, req }) => {
  requireRole(req, 'Admin'); requireElection(p.id);
  const e = state.election;
  if (e.phase !== 'Counting') throw conflict(`Results can only be declared during Counting (current phase: ${e.phase}).`);
  const r = results(true); if (!r.winner) throw conflict('No votes have been counted yet; there is nothing to declare.');
  e.phase = 'Declared'; e.winnerCandidateId = r.winner.candidateId; e.declaredAt = new Date().toISOString();
  return electionDto();
});
on('GET', '/api/admin/elections/:id/voters', ({ p, q, req }) => {
  requireRole(req, 'Admin', 'Officer'); requireElection(p.id);
  let list = state.voters;
  const wardId = Number(q.get('wardId') || 0), s = (q.get('search') || '').trim().toLowerCase();
  if (wardId) list = list.filter((v) => v.wardId === wardId);
  if (s) list = list.filter((v) => v.fullName.toLowerCase().includes(s) || v.epicNumber.toLowerCase().includes(s) || v.houseNumber.toLowerCase().includes(s));
  const page = Math.max(1, Number(q.get('page') || 1)), pageSize = Math.min(200, Math.max(1, Number(q.get('pageSize') || 25)));
  list = [...list].sort((a, b) => wardNo(a.wardId) - wardNo(b.wardId) || a.epicNumber.localeCompare(b.epicNumber));
  return { items: list.slice((page - 1) * pageSize, page * pageSize).map(voterDto), total: list.length, page, pageSize };
});
on('POST', '/api/admin/elections/:id/voters', ({ p, body, req }) => {
  requireRole(req, 'Admin', 'Officer'); requireElection(p.id);
  if (PHASES.indexOf(state.election.phase) >= 3) throw conflict('The electoral roll is frozen once polling has started.');
  if (!/^[6-9][0-9]{9}$/.test(body.mobile || '')) throw Object.assign(new Problem(400, 'One or more validation errors occurred.', 'Validation failed'), { errors: { Mobile: ['Enter a valid 10-digit Indian mobile number.'] } });
  const w = wards.find((x) => x.id === Number(body.wardId)); if (!w) throw bad('The selected ward does not belong to this village.');
  let serial = state.voters.filter((v) => v.wardId === w.id).length + 1, epic;
  do { epic = `TS/01/${String(w.number).padStart(3, '0')}/${String(serial++).padStart(4, '0')}`; } while (state.voters.some((v) => v.epicNumber === epic));
  const v = { id: Math.max(...state.voters.map((x) => x.id)) + 1, epicNumber: epic, fullName: body.fullName.trim(), age: Number(body.age), gender: body.gender, wardId: w.id, houseNumber: body.houseNumber.trim(), mobile: body.mobile, hasVoted: false, votedAt: null, otp: null, otpExpires: 0, otpAttempts: 0 };
  state.voters.push(v); return [201, voterDto(v)];
});
on('POST', '/api/admin/demo/reset', ({ req }) => { requireRole(req, 'Admin'); seed(); return { message: 'Demo data has been reset to the seeded state.' }; });
on('GET', '/health', () => 'Healthy');

// ---------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204, '', 'text/plain');
  try {
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) throw notFound('Endpoint');
    let body = {};
    if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks).toString(); body = raw ? JSON.parse(raw) : {}; }
    const out = route.handler({ req, p: url.pathname.match(route.re).groups || {}, q: url.searchParams, body });
    if (Array.isArray(out) && typeof out[0] === 'number') return send(out[0], out[1]);
    return typeof out === 'string' ? send(200, out, 'text/plain') : send(200, out);
  } catch (e) {
    if (e instanceof Problem) return send(e.status, { type: 'about:blank', title: e.title, status: e.status, detail: e.message, errors: e.errors }, 'application/problem+json');
    console.error(e);
    return send(500, { title: 'An unexpected error occurred', status: 500, detail: String(e) }, 'application/problem+json');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`Mock Gram Panchayat API listening on http://0.0.0.0:${PORT} (phase: ${state.election.phase})`));

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
