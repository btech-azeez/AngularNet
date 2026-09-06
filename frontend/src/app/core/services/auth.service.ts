import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminLoginRequest,
  AuthResponse,
  AuthUser,
  UserRole,
  VoterLoginRequest,
} from '../models';

const STORAGE_KEY = 'gp-election.session';

interface StoredSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(this.restore());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly role = computed<UserRole | null>(() => this.user()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'Admin' || this.role() === 'Officer');
  readonly isVoter = computed(() => this.role() === 'Voter');

  async loginVoter(req: VoterLoginRequest): Promise<AuthUser> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/voter/login`, req),
    );
    this.persist(res);
    return res.user;
  }

  async requestOtp(epicNumber: string): Promise<{ message: string; demoOtp?: string }> {
    return firstValueFrom(
      this.http.post<{ message: string; demoOtp?: string }>(
        `${environment.apiUrl}/auth/voter/request-otp`,
        { epicNumber },
      ),
    );
  }

  async loginAdmin(req: AdminLoginRequest): Promise<AuthUser> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/admin/login`, req),
    );
    this.persist(res);
    return res.user;
  }

  logout(redirect = true): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
    if (redirect) {
      void this.router.navigateByUrl('/');
    }
  }

  /** Called by the voter flow once a ballot has been cast so the UI reflects it immediately. */
  markVoted(): void {
    // Nothing to mutate on the user itself; the voter status is fetched fresh from the API.
  }

  private persist(res: AuthResponse): void {
    const stored: StoredSession = { token: res.token, expiresAt: res.expiresAt, user: res.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    this.session.set(stored);
  }

  private restore(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed.token || new Date(parsed.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
