import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ToastHost } from './shared/toast-host';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost],
  selector: 'app-root',
  template: `
    <div class="tricolor"></div>
    <header class="topbar">
      <div class="container row between">
        <a routerLink="/" class="brand">
          <span class="emblem" aria-hidden="true">🏛️</span>
          <span>
            <strong>Gram Panchayat Elections</strong>
            <small>Sarpanch Election Portal</small>
          </span>
        </a>

        <nav class="nav" aria-label="Main">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
            >Home</a
          >
          <a routerLink="/candidates" routerLinkActive="active">Candidates</a>
          <a routerLink="/results" routerLinkActive="active">Results</a>
          @if (auth.isVoter()) {
            <a routerLink="/vote" routerLinkActive="active" class="cta">Cast Vote</a>
          }
          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active">Admin</a>
          }
        </nav>

        <div class="row user">
          @if (auth.user(); as u) {
            <span class="who">
              <strong>{{ u.name }}</strong>
              <small
                >{{ u.role }}
                @if (u.wardNumber) {
                  · Ward {{ u.wardNumber }}
                }
              </small>
            </span>
            <button type="button" class="btn sm" (click)="auth.logout()">Sign out</button>
          } @else {
            <a routerLink="/login" class="btn sm primary">Sign in</a>
          }
        </div>
      </div>
    </header>

    <main class="container page">
      <router-outlet />
    </main>

    <footer class="footer">
      <div class="container row between">
        <span class="muted small"
          >Demo application — Angular 22 · ASP.NET Core 10 · SQL Server</span
        >
        <span class="muted small">Built for the Gram Panchayat Sarpanch election workflow</span>
      </div>
    </footer>

    <app-toast-host />
  `,
  styles: `
    .topbar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .topbar .container {
      min-height: 64px;
      gap: 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--text);
      text-decoration: none !important;
    }
    .brand .emblem {
      font-size: 1.7rem;
    }
    .brand strong {
      display: block;
      line-height: 1.1;
    }
    .brand small {
      display: block;
      color: var(--muted);
      font-size: 0.75rem;
    }
    .nav {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
    .nav a {
      padding: 0.45rem 0.8rem;
      border-radius: 8px;
      color: var(--muted);
      font-weight: 600;
      font-size: 0.92rem;
      text-decoration: none !important;
    }
    .nav a:hover {
      background: #f1f3f6;
      color: var(--text);
    }
    .nav a.active {
      background: var(--saffron-soft);
      color: #b44a0b;
    }
    .nav a.cta {
      color: var(--success);
    }
    .user .who {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
      text-align: right;
    }
    .user .who small {
      color: var(--muted);
      font-size: 0.75rem;
    }
    .page {
      padding-block: 1.75rem 3rem;
      min-height: calc(100vh - 64px - 60px);
    }
    .footer {
      border-top: 1px solid var(--border);
      padding-block: 1rem;
      background: var(--surface);
    }
    @media (max-width: 760px) {
      .topbar .container {
        flex-direction: column;
        align-items: flex-start;
        padding-block: 0.75rem;
      }
      .user .who {
        text-align: left;
      }
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
