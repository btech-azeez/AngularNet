import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { interval, switchMap } from 'rxjs';
import { ElectionService } from '../../core/services/election.service';
import { apiErrorMessage } from '../../core/utils/api-error';

@Component({
  selector: 'app-results',
  imports: [RouterLink, DatePipe, DecimalPipe],
  template: `
    @if (results.isLoading() && !results.hasValue()) {
      <div class="skeleton" style="height: 360px"></div>
    } @else if (results.error() && !results.hasValue()) {
      <div class="alert error">{{ errorText(results.error()) }}</div>
    } @else if (results.value(); as r) {
      <header class="row between">
        <div>
          <h1>{{ r.phase === 'Declared' ? 'Declared result' : 'Results' }}</h1>
          <p class="muted">{{ r.title }}</p>
        </div>
        <div class="row">
          @if (isLive()) {
            <span class="badge red live">● LIVE</span>
            <span class="muted small"
              >Auto-refreshing every 5s · Updated {{ lastUpdated() | date: 'h:mm:ss a' }}</span
            >
          }
          <span class="badge" [class]="'badge ' + r.phase">{{ r.phase }}</span>
        </div>
      </header>

      @switch (r.phase) {
        @case ('Scheduled') {
          <div class="card empty">
            <h2>Results will be published after polling.</h2>
            <a routerLink="/" class="btn">Back to home</a>
          </div>
        }
        @case ('Nomination') {
          <div class="card empty">
            <h2>Nominations are in progress.</h2>
            <p class="muted">Counting begins after polling day.</p>
            <a routerLink="/candidates" class="btn">View nominations</a>
          </div>
        }
        @case ('Scrutiny') {
          <div class="card empty">
            <h2>Nominations are being scrutinised.</h2>
            <a routerLink="/candidates" class="btn">View candidates</a>
          </div>
        }
        @case ('Polling') {
          <div class="card empty">
            <h2>Polling is under way 🗳️</h2>
            <p class="muted">
              Vote counts are sealed until polls close. Turnout so far:
              <strong>{{ r.votesCast | number }}</strong> of {{ r.totalVoters | number }} voters ({{
                r.turnoutPercent | number: '1.1-1'
              }}%).
            </p>
            <div class="bar green" style="max-width: 480px; margin: 0.5rem auto 1rem">
              <span [style.width.%]="r.turnoutPercent"></span>
            </div>
            <a routerLink="/vote" class="btn success">Cast your vote</a>
          </div>
        }
        @default {
          <!-- Counting or Declared -->
          @if (r.winner; as w) {
            <section class="card winner">
              <div class="trophy">🏆</div>
              <div>
                <p class="card-title" style="color:#7a4a00">
                  {{ r.phase === 'Declared' ? 'Elected Sarpanch' : 'Currently leading' }}
                </p>
                <h2>{{ w.symbolEmoji }} {{ w.fullName }}</h2>
                <p class="muted" style="margin:0">
                  {{ w.votes | number }} votes ({{ w.percent | number: '1.1-1' }}%) · Winning margin
                  <strong>{{ r.margin | number }}</strong> votes
                  @if (r.declaredAt) {
                    · Declared {{ r.declaredAt | date: 'd MMM y, h:mm a' }}
                  }
                </p>
              </div>
            </section>
          }

          <section class="grid cols-4">
            <div class="card">
              <div class="card-title">Total voters</div>
              <div class="stat">{{ r.totalVoters | number }}</div>
            </div>
            <div class="card">
              <div class="card-title">Votes polled</div>
              <div class="stat">{{ r.votesCast | number }}</div>
            </div>
            <div class="card">
              <div class="card-title">Turnout</div>
              <div class="stat">{{ r.turnoutPercent | number: '1.1-1' }}%</div>
            </div>
            <div class="card">
              <div class="card-title">NOTA</div>
              <div class="stat">{{ r.nota | number }}</div>
            </div>
          </section>

          <section class="card">
            <h3>Candidate-wise tally</h3>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Candidate</th>
                    <th>Symbol</th>
                    <th class="num">Votes</th>
                    <th style="width: 34%">Share</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of r.candidates; track c.candidateId) {
                    <tr [class.lead]="c.isWinner">
                      <td>
                        <strong>{{ c.rank }}</strong>
                        @if (c.isWinner) {
                          <span class="badge green">{{
                            r.phase === 'Declared' ? 'WON' : 'LEADING'
                          }}</span>
                        }
                      </td>
                      <td>
                        <a [routerLink]="['/candidates', c.candidateId]">{{ c.fullName }}</a>
                        <div class="muted small">Ward {{ c.wardNumber }}</div>
                      </td>
                      <td>{{ c.symbolEmoji }} {{ c.symbol }}</td>
                      <td class="num">
                        <strong>{{ c.votes | number }}</strong>
                      </td>
                      <td>
                        <div class="row" style="gap: 0.5rem">
                          <div class="bar" [class.green]="c.isWinner" style="flex: 1">
                            <span [style.width.%]="c.percent"></span>
                          </div>
                          <span class="small" style="width: 3.5rem; text-align: right">
                            {{ c.percent | number: '1.1-1' }}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  }
                  <tr class="nota">
                    <td>—</td>
                    <td>NOTA</td>
                    <td>✖ None of the above</td>
                    <td class="num">{{ r.nota | number }}</td>
                    <td>
                      <div class="row" style="gap: 0.5rem">
                        <div class="bar" style="flex: 1">
                          <span [style.width.%]="notaPercent()"></span>
                        </div>
                        <span class="small" style="width: 3.5rem; text-align: right">
                          {{ notaPercent() | number: '1.1-1' }}%
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="card">
            <h3>Ward-wise breakdown</h3>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Ward</th>
                    <th class="num">Voters</th>
                    <th class="num">Polled</th>
                    <th class="num">Turnout</th>
                    @for (c of r.candidates; track c.candidateId) {
                      <th class="num" [title]="c.fullName">{{ c.symbolEmoji }}</th>
                    }
                    <th>Leading</th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of r.wards; track w.wardId) {
                    <tr>
                      <td>
                        <strong>Ward {{ w.wardNumber }}</strong>
                        <div class="muted small">{{ w.wardName }}</div>
                      </td>
                      <td class="num">{{ w.totalVoters | number }}</td>
                      <td class="num">{{ w.votesCast | number }}</td>
                      <td class="num">{{ w.turnoutPercent | number: '1.0-0' }}%</td>
                      @for (c of r.candidates; track c.candidateId) {
                        <td class="num" [class.hi]="w.leadingCandidateId === c.candidateId">
                          {{ w.candidateVotes[c.candidateId] ?? 0 }}
                        </td>
                      }
                      <td>{{ w.leadingCandidateName ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .live {
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.55;
      }
    }
    .winner {
      display: flex;
      gap: 1.25rem;
      align-items: center;
      background: linear-gradient(135deg, #fff7e0, #ffffff 60%);
      border-color: #f3dc9d;
    }
    .winner .trophy {
      font-size: 3.2rem;
    }
    tr.lead td {
      background: #f2faf4;
    }
    tr.nota td {
      color: var(--muted);
    }
    td.hi {
      font-weight: 700;
      color: var(--success);
    }
  `,
})
export class Results {
  private readonly api = inject(ElectionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly lastUpdated = signal(new Date());

  protected readonly results = rxResource({
    stream: () => this.api.getCurrentElection().pipe(switchMap((e) => this.api.getResults(e.id))),
  });

  protected readonly isLive = computed(() => this.results.value()?.phase === 'Counting');

  protected readonly notaPercent = computed(() => {
    const r = this.results.value();
    if (!r || r.votesCast === 0) return 0;
    return (r.nota / r.votesCast) * 100;
  });

  constructor() {
    // Poll for fresh numbers while counting is in progress.
    interval(5000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isLive()) {
          this.results.reload();
          this.lastUpdated.set(new Date());
        }
      });
  }

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
