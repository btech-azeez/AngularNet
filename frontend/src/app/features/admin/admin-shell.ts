import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin">
      <aside class="side card flat">
        <p class="card-title">Election console</p>
        <nav>
          <a routerLink="dashboard" routerLinkActive="active">📊 Dashboard</a>
          <a routerLink="nominations" routerLinkActive="active">📝 Nominations</a>
          <a routerLink="voters" routerLinkActive="active">🧾 Voter roll</a>
        </nav>
        <hr />
        <nav>
          <a routerLink="/candidates">Public candidate list ↗</a>
          <a routerLink="/results">Public results ↗</a>
        </nav>
      </aside>
      <section class="content">
        <router-outlet />
      </section>
    </div>
  `,
  styles: `
    .admin {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 800px) {
      .admin {
        grid-template-columns: 1fr;
      }
    }
    .side nav {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .side a {
      padding: 0.5rem 0.65rem;
      border-radius: 8px;
      color: var(--text);
      font-weight: 600;
      font-size: 0.92rem;
      text-decoration: none !important;
    }
    .side a:hover {
      background: #f1f3f6;
    }
    .side a.active {
      background: var(--saffron-soft);
      color: #b44a0b;
    }
    .side hr {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 0.75rem 0;
    }
    .content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
  `,
})
export class AdminShell {}
