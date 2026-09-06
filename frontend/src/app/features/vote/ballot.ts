import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin, of, switchMap } from 'rxjs';
import { Candidate, CastVoteResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ElectionService } from '../../core/services/election.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/api-error';

/** Sentinel candidate id used for "None of the above". */
export const NOTA_ID = 0;

@Component({
  selector: 'app-ballot',
  imports: [RouterLink, DatePipe],
  template: `
    @if (data.isLoading()) {
      <div class="skeleton" style="height: 400px"></div>
    } @else if (data.error()) {
      <div class="alert error">{{ errorText(data.error()) }}</div>
    } @else if (data.value(); as d) {
      <!-- Receipt after a successful vote -------------------------------- -->
      @if (receipt(); as r) {
        <section class="card receipt">
          <div class="ink">🖊️</div>
          <h1>Your vote has been recorded</h1>
          <p class="muted">{{ r.message }}</p>
          <dl>
            <dt>Receipt number</dt>
            <dd><code>{{ r.receiptNumber }}</code></dd>
            <dt>Time</dt>
            <dd>{{ r.castAt | date: 'd MMM y, h:mm:ss a' }}</dd>
            <dt>Voter</dt>
            <dd>{{ d.voter.fullName }} · {{ d.voter.epicNumber }} · Ward {{ d.voter.wardNumber }}</dd>
          </dl>
          <p class="small muted">
            Your ballot is secret — the receipt proves that you voted, not whom you voted for.
          </p>
          <div class="row">
            <a routerLink="/results" class="btn primary">Follow the count</a>
            <button type="button" class="btn" (click)="auth.logout()">Sign out</button>
          </div>
        </section>
      } @else if (d.voter.hasVoted) {
        <section class="card receipt">
          <div class="ink">✅</div>
          <h1>You have already voted</h1>
          <p class="muted">
            A ballot was cast for {{ d.voter.fullName }} ({{ d.voter.epicNumber }}) on
            {{ d.voter.votedAt | date: 'd MMM y, h:mm a' }}. Each elector may vote only once.
          </p>
          <div class="row">
            <a routerLink="/results" class="btn primary">See results</a>
            <button type="button" class="btn" (click)="auth.logout()">Sign out</button>
          </div>
        </section>
      } @else if (d.election.phase !== 'Polling') {
        <section class="card empty">
          <h2>Polling is not open</h2>
          <p class="muted">
            The election is currently in the <strong>{{ d.election.phase }}</strong> phase. Voting is only
            possible on polling day between {{ d.election.pollingStartsAt }} and {{ d.election.pollingEndsAt }}.
          </p>
          <a routerLink="/" class="btn">Back to home</a>
        </section>
      } @else {
        <!-- The ballot paper ------------------------------------------------ -->
        <section class="paper card">
          <header>
            <p class="muted small" style="margin: 0">{{ d.election.villageName }} Gram Panchayat</p>
            <h1>Ballot Paper — Election of {{ d.election.post }}</h1>
            <p class="muted">
              Voter: <strong>{{ d.voter.fullName }}</strong> · EPIC {{ d.voter.epicNumber }} · Ward
              {{ d.voter.wardNumber }}
            </p>
            <div class="alert info">
              Select <strong>one</strong> candidate (or NOTA), then press <strong>Cast vote</strong>. You will be
              asked to confirm. Once cast, a vote cannot be changed.
            </div>
          </header>

          <ol class="ballot" role="radiogroup" aria-label="Candidates">
            @for (c of d.candidates; track c.id) {
              <li>
                <button
                  type="button"
                  role="radio"
                  class="option"
                  [attr.aria-checked]="selected() === c.id"
                  [class.selected]="selected() === c.id"
                  (click)="selected.set(c.id)"
                  [disabled]="busy()"
                >
                  <span class="sl">{{ c.serialNumber }}</span>
                  <span class="who">
                    <strong>{{ c.fullName }}</strong>
                    <small>{{ c.fatherOrSpouseName }} · Ward {{ c.wardNumber }} · {{ c.symbol }}</small>
                  </span>
                  <span class="sym">{{ c.symbolEmoji }}</span>
                  <span class="mark" aria-hidden="true">{{ selected() === c.id ? '✔' : '' }}</span>
                </button>
              </li>
            }
            <li>
              <button
                type="button"
                role="radio"
                class="option nota"
                [attr.aria-checked]="selected() === NOTA"
                [class.selected]="selected() === NOTA"
                (click)="selected.set(NOTA)"
                [disabled]="busy()"
              >
                <span class="sl">{{ d.candidates.length + 1 }}</span>
                <span class="who">
                  <strong>NOTA</strong>
                  <small>None of the above</small>
                </span>
                <span class="sym">✖</span>
                <span class="mark" aria-hidden="true">{{ selected() === NOTA ? '✔' : '' }}</span>
              </button>
            </li>
          </ol>

          @if (error()) {
            <div class="alert error">{{ error() }}</div>
          }

          <footer class="row between">
            <span class="muted small">
              @if (selectedCandidate(); as sc) {
                Selected: <strong>{{ sc.fullName }}</strong> ({{ sc.symbol }})
              } @else if (selected() === NOTA) {
                Selected: <strong>NOTA</strong>
              } @else {
                No selection yet
              }
            </span>
            <button
              type="button"
              class="btn success lg"
              [disabled]="selected() === null || busy()"
              (click)="confirming.set(true)"
            >
              🗳️ Cast vote
            </button>
          </footer>
        </section>

        <!-- Confirm dialog --------------------------------------------------- -->
        @if (confirming()) {
          <div class="backdrop" (click)="confirming.set(false)"></div>
          <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">Confirm your vote</h2>
            <p>
              You are voting for
              @if (selectedCandidate(); as sc) {
                <strong>{{ sc.symbolEmoji }} {{ sc.fullName }}</strong> ({{ sc.symbol }}).
              } @else {
                <strong>NOTA — None of the above</strong>.
              }
            </p>
            <p class="muted small">This action is final and cannot be undone.</p>
            <div class="row" style="justify-content: flex-end">
              <button type="button" class="btn" (click)="confirming.set(false)" [disabled]="busy()">
                Go back
              </button>
              <button type="button" class="btn success" (click)="cast()" [disabled]="busy()">
                {{ busy() ? 'Recording…' : 'Yes, cast my vote' }}
              </button>
            </div>
          </div>
        }
      }
    }
  `,
  styles: `
    .paper {
      max-width: 760px;
      margin-inline: auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      border-top: 6px solid var(--saffron);
    }
    .ballot {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .option {
      width: 100%;
      display: grid;
      grid-template-columns: 40px 1fr 56px 40px;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      border: 2px solid var(--border);
      background: #fff;
      cursor: pointer;
      font: inherit;
      text-align: left;
      transition:
        border-color 0.15s,
        background 0.15s;
    }
    .option:hover {
      border-color: #c9ced6;
    }
    .option.selected {
      border-color: var(--success);
      background: #eef8f1;
    }
    .option .sl {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #f1f3f6;
      font-weight: 700;
      font-size: 0.9rem;
    }
    .option .who {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .option .who small {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .option .sym {
      font-size: 2rem;
      text-align: center;
    }
    .option .mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 2px solid var(--border);
      display: grid;
      place-items: center;
      font-weight: 800;
      color: var(--success);
    }
    .option.selected .mark {
      border-color: var(--success);
    }
    .option.nota .sym {
      color: var(--muted);
    }
    .receipt {
      max-width: 620px;
      margin-inline: auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      border-top: 6px solid var(--success);
    }
    .receipt .ink {
      font-size: 3rem;
    }
    .receipt dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.35rem 1.25rem;
      text-align: left;
      margin: 0.5rem 0;
    }
    .receipt dt {
      color: var(--muted);
    }
    .receipt dd {
      margin: 0;
      font-weight: 600;
    }
    .receipt code {
      font-size: 1.05rem;
      background: #f1f3f6;
      padding: 0.15rem 0.5rem;
      border-radius: 6px;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 90;
    }
    .modal {
      position: fixed;
      z-index: 100;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(460px, calc(100vw - 2rem));
    }
  `,
})
export class Ballot {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ElectionService);
  private readonly toast = inject(ToastService);

  protected readonly NOTA = NOTA_ID;
  protected readonly selected = signal<number | null>(null);
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly receipt = signal<CastVoteResponse | null>(null);

  protected readonly data = rxResource({
    stream: () =>
      this.api.getCurrentElection().pipe(
        switchMap((election) =>
          forkJoin({
            election: of(election),
            voter: this.api.getMyVoterStatus(),
            candidates: this.api.getCandidates(election.id, 'Accepted'),
          }),
        ),
      ),
  });

  protected readonly selectedCandidate = computed<Candidate | null>(() => {
    const id = this.selected();
    if (id === null || id === NOTA_ID) return null;
    return this.data.value()?.candidates.find((c) => c.id === id) ?? null;
  });

  protected async cast(): Promise<void> {
    const election = this.data.value()?.election;
    const choice = this.selected();
    if (!election || choice === null) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.castVote(election.id, { candidateId: choice }));
      this.receipt.set(res);
      this.confirming.set(false);
      this.toast.success('Vote recorded. Thank you for voting!');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
      this.confirming.set(false);
      // If the server says we already voted, refresh status so the page reflects it.
      this.data.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
