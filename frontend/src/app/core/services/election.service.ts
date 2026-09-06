import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Candidate,
  CastVoteRequest,
  CastVoteResponse,
  DashboardStats,
  Election,
  ElectionPhase,
  ElectionResults,
  NominationRequest,
  Village,
  Voter,
  Ward,
} from '../models';

/**
 * Thin typed wrapper over the election REST API.
 * All methods return cold observables; components decide when to subscribe
 * (usually via `toSignal` / `rxResource` or `async`).
 */
@Injectable({ providedIn: 'root' })
export class ElectionService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // ---- Village / election -------------------------------------------------

  getVillage(): Observable<Village> {
    return this.http.get<Village>(`${this.base}/village`);
  }

  getWards(): Observable<Ward[]> {
    return this.http.get<Ward[]>(`${this.base}/village/wards`);
  }

  getCurrentElection(): Observable<Election> {
    return this.http.get<Election>(`${this.base}/elections/current`);
  }

  getElection(id: number): Observable<Election> {
    return this.http.get<Election>(`${this.base}/elections/${id}`);
  }

  // ---- Candidates & nominations ------------------------------------------

  getCandidates(electionId: number, status?: string): Observable<Candidate[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<Candidate[]>(`${this.base}/elections/${electionId}/candidates`, { params });
  }

  getCandidate(electionId: number, candidateId: number): Observable<Candidate> {
    return this.http.get<Candidate>(`${this.base}/elections/${electionId}/candidates/${candidateId}`);
  }

  fileNomination(electionId: number, req: NominationRequest): Observable<Candidate> {
    return this.http.post<Candidate>(`${this.base}/elections/${electionId}/candidates`, req);
  }

  reviewNomination(
    electionId: number,
    candidateId: number,
    decision: 'Accepted' | 'Rejected',
    reason?: string,
  ): Observable<Candidate> {
    return this.http.post<Candidate>(
      `${this.base}/elections/${electionId}/candidates/${candidateId}/review`,
      { decision, reason: reason ?? null },
    );
  }

  withdrawNomination(electionId: number, candidateId: number): Observable<Candidate> {
    return this.http.post<Candidate>(
      `${this.base}/elections/${electionId}/candidates/${candidateId}/withdraw`,
      {},
    );
  }

  // ---- Voting -------------------------------------------------------------

  getMyVoterStatus(): Observable<Voter> {
    return this.http.get<Voter>(`${this.base}/voters/me`);
  }

  castVote(electionId: number, req: CastVoteRequest): Observable<CastVoteResponse> {
    return this.http.post<CastVoteResponse>(`${this.base}/elections/${electionId}/votes`, req);
  }

  // ---- Results ------------------------------------------------------------

  getResults(electionId: number): Observable<ElectionResults> {
    return this.http.get<ElectionResults>(`${this.base}/elections/${electionId}/results`);
  }

  // ---- Admin --------------------------------------------------------------

  getDashboard(electionId: number): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.base}/admin/elections/${electionId}/dashboard`);
  }

  advancePhase(electionId: number, to: ElectionPhase): Observable<Election> {
    return this.http.post<Election>(`${this.base}/admin/elections/${electionId}/phase`, { phase: to });
  }

  getVoters(electionId: number, opts: { wardId?: number; search?: string; page?: number; pageSize?: number } = {}) {
    let params = new HttpParams();
    if (opts.wardId) params = params.set('wardId', opts.wardId);
    if (opts.search) params = params.set('search', opts.search);
    params = params.set('page', opts.page ?? 1).set('pageSize', opts.pageSize ?? 25);
    return this.http.get<{ items: Voter[]; total: number; page: number; pageSize: number }>(
      `${this.base}/admin/elections/${electionId}/voters`,
      { params },
    );
  }

  addVoter(electionId: number, voter: Partial<Voter>): Observable<Voter> {
    return this.http.post<Voter>(`${this.base}/admin/elections/${electionId}/voters`, voter);
  }

  declareResults(electionId: number): Observable<Election> {
    return this.http.post<Election>(`${this.base}/admin/elections/${electionId}/declare`, {});
  }

  resetDemo(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/admin/demo/reset`, {});
  }
}
