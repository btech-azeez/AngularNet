/**
 * Shared domain models — these mirror the DTOs returned by the ASP.NET Core API
 * (see backend/src/GramPanchayat.Api/Contracts).
 */

export type ElectionPhase =
  'Scheduled' | 'Nomination' | 'Scrutiny' | 'Polling' | 'Counting' | 'Declared';

export const ELECTION_PHASES: ElectionPhase[] = [
  'Scheduled',
  'Nomination',
  'Scrutiny',
  'Polling',
  'Counting',
  'Declared',
];

export type NominationStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Withdrawn';

export type UserRole = 'Admin' | 'Officer' | 'Voter';

export interface Village {
  id: number;
  name: string;
  mandal: string;
  district: string;
  state: string;
  totalWards: number;
}

export interface Ward {
  id: number;
  villageId: number;
  number: number;
  name: string;
  voterCount: number;
  votedCount: number;
}

export interface Election {
  id: number;
  villageId: number;
  villageName: string;
  title: string;
  post: string;
  phase: ElectionPhase;
  nominationStartsOn: string;
  nominationEndsOn: string;
  pollingDate: string;
  pollingStartsAt: string;
  pollingEndsAt: string;
  totalVoters: number;
  votesCast: number;
  turnoutPercent: number;
  candidateCount: number;
  declaredAt: string | null;
  winnerCandidateId: number | null;
  winnerName: string | null;
}

export interface Candidate {
  id: number;
  electionId: number;
  fullName: string;
  fatherOrSpouseName: string;
  age: number;
  gender: string;
  wardId: number;
  wardNumber: number;
  symbol: string;
  symbolEmoji: string;
  education: string;
  occupation: string;
  manifesto: string;
  photoUrl: string | null;
  status: NominationStatus;
  rejectionReason: string | null;
  nominatedOn: string;
  serialNumber: number | null;
}

export interface Voter {
  id: number;
  epicNumber: string;
  fullName: string;
  age: number;
  gender: string;
  wardId: number;
  wardNumber: number;
  houseNumber: string;
  mobile: string;
  hasVoted: boolean;
  votedAt: string | null;
}

export interface AuthUser {
  id: number;
  name: string;
  role: UserRole;
  /** Present when role === 'Voter' */
  voterId: number | null;
  epicNumber: string | null;
  wardNumber: number | null;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export interface VoterLoginRequest {
  epicNumber: string;
  otp: string;
}

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface CastVoteRequest {
  candidateId: number;
}

export interface CastVoteResponse {
  receiptNumber: string;
  castAt: string;
  message: string;
}

export interface NominationRequest {
  fullName: string;
  fatherOrSpouseName: string;
  age: number;
  gender: string;
  wardId: number;
  symbol: string;
  symbolEmoji: string;
  education: string;
  occupation: string;
  manifesto: string;
}

export interface CandidateResult {
  candidateId: number;
  fullName: string;
  symbol: string;
  symbolEmoji: string;
  wardNumber: number;
  votes: number;
  percent: number;
  rank: number;
  isWinner: boolean;
}

export interface WardResult {
  wardId: number;
  wardNumber: number;
  wardName: string;
  totalVoters: number;
  votesCast: number;
  turnoutPercent: number;
  leadingCandidateId: number | null;
  leadingCandidateName: string | null;
  candidateVotes: Record<number, number>;
}

export interface ElectionResults {
  electionId: number;
  title: string;
  phase: ElectionPhase;
  totalVoters: number;
  votesCast: number;
  turnoutPercent: number;
  nota: number;
  declaredAt: string | null;
  winner: CandidateResult | null;
  margin: number;
  candidates: CandidateResult[];
  wards: WardResult[];
}

export interface DashboardStats {
  election: Election;
  wards: Ward[];
  pendingNominations: number;
  acceptedCandidates: number;
  rejectedNominations: number;
  votersTotal: number;
  votersVoted: number;
  turnoutPercent: number;
  hourlyTurnout: { hour: string; votes: number }[];
}

export interface ApiError {
  title: string;
  status: number;
  detail?: string;
  errors?: Record<string, string[]>;
}
