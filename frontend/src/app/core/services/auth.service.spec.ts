import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthResponse } from '../models';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const voterResponse: AuthResponse = {
    token: 'jwt-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: 7,
      name: 'Lakshmi Goud',
      role: 'Voter',
      voterId: 7,
      epicNumber: 'TS/01/001/0001',
      wardNumber: 1,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('starts logged out', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.user()).toBeNull();
    expect(service.token()).toBeNull();
  });

  it('stores the session after a voter login and exposes role helpers', async () => {
    const pending = service.loginVoter({ epicNumber: 'TS/01/001/0001', otp: '123456' });

    const req = http.expectOne('/api/auth/voter/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ epicNumber: 'TS/01/001/0001', otp: '123456' });
    req.flush(voterResponse);

    const user = await pending;
    expect(user.name).toBe('Lakshmi Goud');
    expect(service.isLoggedIn()).toBe(true);
    expect(service.isVoter()).toBe(true);
    expect(service.isAdmin()).toBe(false);
    expect(service.token()).toBe('jwt-token');
    expect(localStorage.getItem('gp-election.session')).toContain('jwt-token');
  });

  it('treats Officer as admin', async () => {
    const pending = service.loginAdmin({ username: 'officer', password: 'x' });
    http.expectOne('/api/auth/admin/login').flush({
      ...voterResponse,
      user: {
        id: 2,
        name: 'Polling Officer',
        role: 'Officer',
        voterId: null,
        epicNumber: null,
        wardNumber: null,
      },
    });
    await pending;
    expect(service.isAdmin()).toBe(true);
    expect(service.isVoter()).toBe(false);
  });

  it('logout clears the session', async () => {
    const pending = service.loginVoter({ epicNumber: 'X', otp: '000000' });
    http.expectOne('/api/auth/voter/login').flush(voterResponse);
    await pending;

    service.logout(false);

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('gp-election.session')).toBeNull();
  });

  it('ignores an expired stored session on startup', () => {
    localStorage.setItem(
      'gp-election.session',
      JSON.stringify({ ...voterResponse, expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fresh = TestBed.inject(AuthService);
    expect(fresh.isLoggedIn()).toBe(false);
    http = TestBed.inject(HttpTestingController);
  });
});
