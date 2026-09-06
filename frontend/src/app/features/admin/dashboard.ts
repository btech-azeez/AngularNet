import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom, switchMap } from 'rxjs';
import { ELECTION_PHASES, ElectionPhase } from '../../core/models';
import { ElectionService } from '../../core/services/election.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/api-error';
import { PhaseStepper } from '../../shared/phase-stepper';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, PhaseStepper],
  template: `
    @if (dash.isLoading() && !dash.hasValue()) {
      <div class="skeleton" style="height: 320px"></div>
    } @else if (dash.error() && !dash.hasValue()) {
      <div class="alert error">{{ errorText(dash.error()) }}</div>
    } @else if (dash.value(); as d) {
      <header class="row between">
        <div>
          <h1>{{ d.election.title }}</h1>
          <p class="muted">
            {{ d.election.villageName }} · Polling {{ d.election.pollingDate | date: 'd MMM y' }} ·
            <span class="badge" [class]="'badge ' + d.election.phase">{{ d.election.phase }}</span>
          </p>
        </div>
        <button type="button" class="btn sm" (click)="dash.reload()">↻ Refresh</button>
      </header>

      <section class="card stack">
        <app-phase-stepper [phase]="d.election.phase" />

        <div class="row between phase-ctl">
          <div>
            <h3 style="margin:0">Phase control</h3>
            <p class="muted small" style="margin:0">{{ phaseHelp(d.election.phase) }}</p>
          </div>
          <div class="row">
            @if (nextPhase(d.election.phase); as np) {
              <button
                type="button"
                class="btn primary"
                [disabled]="busy() || !canAdvance()"
                (click)="advance(np)"
                [title]="advanceBlockedReason() ?? ''"
              >
                {{ busy() ? 'Working…' : 'Move to ' + np + ' →' }}
              </button>
            }
            @if (d.election.phase === 'Counting') {
              <button type="button" class="btn success" [disabled]="busy()" (click)="declare()">
                🏆 Declare result
              </button>
            }
            @if (d.election.phase === 'Declared') {
              <a routerLink="/results" class="btn">View declared result</a>
            }
          </div>
        </div>
        @if (advanceBlockedReason(); as why) {
          <div class="alert warn">{{ why }}</div>
        }
      </section>

      <section class="grid cols-4">
        <div class="card">
          <div class="card-title">Voter roll</div>
          <div class="stat">{{ d.votersTotal | number }}</div>
          <div class="muted small">{{ d.wards.length }} wards</div>
        </div>
        <div class="card">
          <div class="card-title">Pending scrutiny</div>
          <div class="stat" [style.color]="d.pendingNominations ? 'var(--warning)' : ''">
            {{ d.pendingNominations }}
          </div>
          <a routerLink="../nominations" class="small">Review nominations →</a>
        </div>
        <div class="card">
          <div class="card-title">Candidates on ballot</div>
          <div class="stat">{{ d.acceptedCandidates }}</div>
          <div class="muted small">{{ d.rejectedNominations }} rejected</div>
        </div>
        <div class="card">
          <div class="card-title">Turnout</div>
          <div class="stat">{{ d.turnoutPercent | number: '1.1-1' }}%</div>
          <div class="bar green"><span [style.width.%]="d.turnoutPercent"></span></div>
          <div class="muted small">{{ d.votersVoted | number }} voted</div>
        </div>
      </section>

      <section class="grid cols-2">
        <div class="card">
          <h3>Ward-wise turnout</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Ward</th>
                <th class="num">Voters</th>
                <th style="width: 45%">Turnout</th>
              </tr>
            </thead>
            <tbody>
              @for (w of d.wards; track w.id) {
                <tr>
                  <td>
                    <strong>{{ w.number }}</strong> · {{ w.name }}
                  </td>
                  <td class="num">{{ w.voterCount | number }}</td>
                  <td>
                    <div class="row" style="gap:0.5rem">
                      <div class="bar green" style="flex:1">
                        <span [style.width.%]="wardTurnout(w.id)"></span>
                      </div>
                      <span class="small" style="width:3rem;text-align:right">
                        {{ wardTurnout(w.id) | number: '1.0-0' }}%
                      </span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Votes by hour</h3>
          @if (d.hourlyTurnout.length === 0) {
            <p class="empty">No votes yet.</p>
          } @else {
            <div class="chart" role="img" aria-label="Votes cast per hour">
              @for (h of d.hourlyTurnout; track h.hour) {
                <div class="col">
                  <div class="v">{{ h.votes }}</div>
                  <div class="b" [style.height.%]="(h.votes / maxHourly()) * 100"></div>
                  <div class="l">{{ h.hour }}</div>
                </div>
              }
            </div>
          }
        </div>
      </section>

      <section class="card danger-zone">
        <div class="row between">
          <div>
            <h3 style="margin:0">Demo data</h3>
            <p class="muted small" style="margin:0">
              Reset the database to the seeded state (nominations, voters and votes are recreated).
            </p>
          </div>
          <button type="button" class="btn danger sm" [disabled]="busy()" (click)="resetDemo()">
            Reset demo data
          </button>
        </div>
      </section>
    }
  `,
  styles: `
    .phase-ctl {
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }
    .chart {
      display: flex;
      align-items: flex-end;
      gap: 0.4rem;
      height: 180px;
      padding-top: 1.25rem;
    }
    .col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
      min-width: 0;
    }
    .col .b {
      width: 100%;
      background: var(--navy);
      border-radius: 6px 6px 0 0;
      min-height: 2px;
    }
    .col .v {
      font-size: 0.75rem;
      font-weight: 700;
      margin-bottom: 0.2rem;
    }
    .col .l {
      font-size: 0.7rem;
      color: var(--muted);
      margin-top: 0.3rem;
      white-space: nowrap;
    }
    .danger-zone {
      border-color: #f5c2c0;
    }
  `,
})
export class Dashboard {
  private readonly api = inject(ElectionService);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);

  protected readonly dash = rxResource({
    stream: () => this.api.getCurrentElection().pipe(switchMap((e) => this.api.getDashboard(e.id))),
  });

  protected readonly maxHourly = computed(() =>
    Math.max(1, ...(this.dash.value()?.hourlyTurnout.map((h) => h.votes) ?? [1])),
  );

  /** Server-side rules mirrored here for a friendlier UI. */
  protected readonly advanceBlockedReason = computed<string | null>(() => {
    const d = this.dash.value();
    if (!d) return null;
    switch (d.election.phase) {
      case 'Scrutiny':
        if (d.pendingNominations > 0)
          return `${d.pendingNominations} nomination(s) still await scrutiny. Accept or reject them before opening polling.`;
        if (d.acceptedCandidates < 1) return 'At least one accepted candidate is required to open polling.';
        return null;
      case 'Nomination':
        if (d.acceptedCandidates + d.pendingNominations === 0)
          return 'No nominations have been filed yet.';
        return null;
      default:
        return null;
    }
  });
  protected readonly canAdvance = computed(() => this.advanceBlockedReason() === null);

  protected nextPhase(p: ElectionPhase): ElectionPhase | null {
    const i = ELECTION_PHASES.indexOf(p);
    if (i < 0 || i >= ELECTION_PHASES.length - 1) return null;
    const next = ELECTION_PHASES[i + 1];
    // "Declared" is reached via the dedicated declare action, not the generic advance button.
    return next === 'Declared' ? null : next;
  }

  protected phaseHelp(p: ElectionPhase): string {
    switch (p) {
      case 'Scheduled':
        return 'The election has been notified. Open nominations when the window begins.';
      case 'Nomination':
        return 'Aspirants may file nominations. Close nominations to begin scrutiny.';
      case 'Scrutiny':
        return 'Accept or reject every nomination; serial numbers are allotted on acceptance.';
      case 'Polling':
        return 'Voters may cast ballots. Close polling to start counting.';
      case 'Counting':
        return 'Tallies are public and refresh live. Declare the result when counting is complete.';
      case 'Declared':
        return 'The result has been declared. The election is closed.';
    }
  }

  protected wardTurnout(wardId: number): number {
    const w = this.dash.value()?.wards.find((x) => x.id === wardId);
    if (!w || w.voterCount === 0) return 0;
    return (w.votedCount / w.voterCount) * 100;
  }

  protected async advance(to: ElectionPhase): Promise<void> {
    if (!confirm(`Move the election to the "${to}" phase? This cannot be reversed.`)) return;
    await this.run(async () => {
      await firstValueFrom(this.api.advancePhase(this.dash.value()!.election.id, to));
      this.toast.success(`Election is now in the ${to} phase.`);
    });
  }

  protected async declare(): Promise<void> {
    if (!confirm('Declare the result now? The leading candidate will be recorded as the elected Sarpanch.'))
      return;
    await this.run(async () => {
      const e = await firstValueFrom(this.api.declareResults(this.dash.value()!.election.id));
      this.toast.success(`${e.winnerName} declared elected as ${e.post}.`);
    });
  }

  protected async resetDemo(): Promise<void> {
    if (!confirm('Reset ALL demo data? Every nomination and vote will be recreated from the seed.')) return;
    await this.run(async () => {
      const r = await firstValueFrom(this.api.resetDemo());
      this.toast.success(r.message);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.dash.reload();
    } catch (e) {
      this.toast.error(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
