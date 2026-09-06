import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ElectionService } from '../../core/services/election.service';
import { apiErrorMessage } from '../../core/utils/api-error';
import { PhaseStepper } from '../../shared/phase-stepper';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, DecimalPipe, PhaseStepper],
  template: `
    @if (data.isLoading()) {
      <div class="stack">
        <div class="skeleton" style="height: 120px"></div>
        <div class="skeleton" style="height: 80px"></div>
      </div>
    } @else if (data.error()) {
      <div class="alert error">{{ errorText(data.error()) }}</div>
    } @else if (data.value(); as d) {
      <section class="hero card">
        <div class="row between">
          <div>
            <p class="muted small" style="margin: 0">
              {{ d.village.name }} Gram Panchayat · {{ d.village.mandal }} Mandal ·
              {{ d.village.district }} District, {{ d.village.state }}
            </p>
            <h1>{{ d.election.title }}</h1>
            <p class="muted">
              Election to the office of <strong>{{ d.election.post }}</strong> · Polling on
              <strong>{{ d.election.pollingDate | date: 'EEEE, d MMMM y' }}</strong>
              ({{ d.election.pollingStartsAt }} – {{ d.election.pollingEndsAt }})
            </p>
          </div>
          <span class="badge" [class]="'badge ' + d.election.phase">{{ d.election.phase }}</span>
        </div>

        <app-phase-stepper [phase]="d.election.phase" />

        <div class="actions row">
          @switch (d.election.phase) {
            @case ('Nomination') {
              <a routerLink="/candidates/nominate" class="btn primary lg">File a nomination</a>
              <a routerLink="/candidates" class="btn lg">View nominations</a>
            }
            @case ('Polling') {
              @if (auth.isVoter()) {
                <a routerLink="/vote" class="btn success lg">🗳️ Cast your vote</a>
              } @else {
                <a routerLink="/login" [queryParams]="{ as: 'voter' }" class="btn success lg">
                  🗳️ Voter sign in to vote
                </a>
              }
              <a routerLink="/candidates" class="btn lg">See the ballot</a>
            }
            @case ('Counting') {
              <a routerLink="/results" class="btn primary lg">Live counting</a>
            }
            @case ('Declared') {
              <a routerLink="/results" class="btn primary lg">🏆 View declared result</a>
            }
            @default {
              <a routerLink="/candidates" class="btn lg">Candidates</a>
            }
          }
          @if (auth.isAdmin()) {
            <a routerLink="/admin" class="btn ghost">Go to admin console →</a>
          }
        </div>

        @if (d.election.phase === 'Declared' && d.election.winnerName) {
          <div class="alert success">
            🏆 <strong>{{ d.election.winnerName }}</strong> has been declared elected as
            {{ d.election.post }} of {{ d.village.name }}.
          </div>
        }
      </section>

      <section class="grid cols-4 stats">
        <div class="card">
          <div class="card-title">Registered voters</div>
          <div class="stat">{{ d.election.totalVoters | number }}</div>
          <div class="muted small">across {{ d.wards.length }} wards</div>
        </div>
        <div class="card">
          <div class="card-title">Candidates</div>
          <div class="stat">{{ d.election.candidateCount }}</div>
          <div class="muted small">in the fray</div>
        </div>
        <div class="card">
          <div class="card-title">Votes cast</div>
          <div class="stat">{{ d.election.votesCast | number }}</div>
          <div class="bar green"><span [style.width.%]="d.election.turnoutPercent"></span></div>
        </div>
        <div class="card">
          <div class="card-title">Turnout</div>
          <div class="stat">{{ d.election.turnoutPercent | number: '1.1-1' }}%</div>
          <div class="muted small">of eligible voters</div>
        </div>
      </section>

      <section class="grid cols-2">
        <div class="card">
          <h3>Key dates</h3>
          <table class="table">
            <tbody>
              <tr>
                <td>Nominations open</td>
                <td class="num">{{ d.election.nominationStartsOn | date: 'd MMM y' }}</td>
              </tr>
              <tr>
                <td>Last date for nominations</td>
                <td class="num">{{ d.election.nominationEndsOn | date: 'd MMM y' }}</td>
              </tr>
              <tr>
                <td>Polling day</td>
                <td class="num">{{ d.election.pollingDate | date: 'd MMM y' }}</td>
              </tr>
              <tr>
                <td>Counting & declaration</td>
                <td class="num">{{ d.election.pollingDate | date: 'd MMM y' }} (after polls close)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Wards</h3>
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ward</th>
                <th class="num">Voters</th>
              </tr>
            </thead>
            <tbody>
              @for (w of d.wards; track w.id) {
                <tr>
                  <td>{{ w.number }}</td>
                  <td>{{ w.name }}</td>
                  <td class="num">{{ w.voterCount | number }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card how">
        <h3>How it works</h3>
        <ol>
          <li><strong>Nomination</strong> — aspirants file their nomination with ward, symbol and manifesto.</li>
          <li><strong>Scrutiny</strong> — the Returning Officer accepts or rejects each nomination and allots serial numbers.</li>
          <li><strong>Polling</strong> — voters sign in with their EPIC (voter ID) number and an OTP, then cast exactly one secret ballot (NOTA available).</li>
          <li><strong>Counting</strong> — ward-wise tallies are published live.</li>
          <li><strong>Declared</strong> — the candidate with the most votes is declared Sarpanch.</li>
        </ol>
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .hero {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      background:
        radial-gradient(1200px 300px at 100% -50%, var(--saffron-soft), transparent 60%),
        var(--surface);
    }
    .actions {
      gap: 0.75rem;
    }
    .how ol {
      margin: 0;
      padding-left: 1.25rem;
      display: grid;
      gap: 0.4rem;
    }
  `,
})
export class Home {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ElectionService);

  protected readonly data = rxResource({
    stream: () =>
      forkJoin({
        village: this.api.getVillage(),
        election: this.api.getCurrentElection(),
        wards: this.api.getWards(),
      }),
  });

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
