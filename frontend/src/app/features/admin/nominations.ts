import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin, of, switchMap } from 'rxjs';
import { Candidate, NominationStatus } from '../../core/models';
import { ElectionService } from '../../core/services/election.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/api-error';

type Filter = 'All' | NominationStatus;

@Component({
  selector: 'app-admin-nominations',
  imports: [RouterLink, DatePipe, FormsModule],
  template: `
    <header class="row between">
      <div>
        <h1>Nominations</h1>
        <p class="muted">Scrutinise every nomination. Accepting allots the next ballot serial number.</p>
      </div>
      @if (data.value(); as d) {
        <span class="badge" [class]="'badge ' + d.election.phase">{{ d.election.phase }}</span>
      }
    </header>

    @if (data.isLoading() && !data.hasValue()) {
      <div class="skeleton" style="height: 300px"></div>
    } @else if (data.error() && !data.hasValue()) {
      <div class="alert error">{{ errorText(data.error()) }}</div>
    } @else if (data.value(); as d) {
      @if (d.election.phase !== 'Scrutiny' && d.election.phase !== 'Nomination') {
        <div class="alert info">
          Nominations can only be reviewed during the Nomination and Scrutiny phases.
        </div>
      }

      <div class="row filters">
        @for (f of filters; track f) {
          <button type="button" class="btn sm" [class.primary]="filter() === f" (click)="filter.set(f)">
            {{ f }} <span class="count">{{ countFor(f) }}</span>
          </button>
        }
      </div>

      @if (visible().length === 0) {
        <div class="card empty">No nominations in this bucket.</div>
      } @else {
        <div class="card table-wrap" style="padding: 0">
          <table class="table">
            <thead>
              <tr>
                <th>Sl.</th>
                <th>Candidate</th>
                <th>Ward</th>
                <th>Symbol</th>
                <th>Filed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of visible(); track c.id) {
                <tr>
                  <td>{{ c.serialNumber ?? '—' }}</td>
                  <td>
                    <a [routerLink]="['/candidates', c.id]"><strong>{{ c.fullName }}</strong></a>
                    <div class="muted small">{{ c.gender }}, {{ c.age }} · {{ c.occupation }}</div>
                  </td>
                  <td>{{ c.wardNumber }}</td>
                  <td>{{ c.symbolEmoji }} {{ c.symbol }}</td>
                  <td class="small">{{ c.nominatedOn | date: 'd MMM, h:mm a' }}</td>
                  <td>
                    <span class="badge" [class]="'badge ' + c.status">{{ c.status }}</span>
                    @if (c.rejectionReason) {
                      <div class="muted small">{{ c.rejectionReason }}</div>
                    }
                  </td>
                  <td class="actions">
                    @if (c.status === 'Pending' && canReview(d.election.phase)) {
                      <button type="button" class="btn sm success" [disabled]="busy()" (click)="accept(c)">
                        Accept
                      </button>
                      <button type="button" class="btn sm danger" [disabled]="busy()" (click)="rejecting.set(c)">
                        Reject
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (rejecting(); as c) {
        <div class="backdrop" (click)="rejecting.set(null)"></div>
        <div class="modal card" role="dialog" aria-modal="true">
          <h2>Reject nomination</h2>
          <p>
            Rejecting <strong>{{ c.fullName }}</strong> ({{ c.symbol }}). Please record the reason — it is shown
            to the candidate.
          </p>
          <div class="field">
            <label for="reason">Reason</label>
            <textarea id="reason" [(ngModel)]="reason" placeholder="e.g. Under-age; not on the electoral roll; incomplete declaration"></textarea>
          </div>
          <div class="row" style="justify-content: flex-end">
            <button type="button" class="btn" (click)="rejecting.set(null)" [disabled]="busy()">Cancel</button>
            <button type="button" class="btn danger" (click)="reject(c)" [disabled]="busy() || reason.trim().length < 5">
              Reject nomination
            </button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .filters {
      gap: 0.4rem;
    }
    .count {
      background: rgba(0, 0, 0, 0.08);
      border-radius: 999px;
      padding: 0 0.45rem;
      font-size: 0.75rem;
    }
    .actions {
      white-space: nowrap;
      text-align: right;
    }
    .actions .btn + .btn {
      margin-left: 0.35rem;
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
      width: min(520px, calc(100vw - 2rem));
    }
  `,
})
export class Nominations {
  private readonly api = inject(ElectionService);
  private readonly toast = inject(ToastService);

  protected readonly filters: Filter[] = ['Pending', 'Accepted', 'Rejected', 'Withdrawn', 'All'];
  protected readonly filter = signal<Filter>('Pending');
  protected readonly busy = signal(false);
  protected readonly rejecting = signal<Candidate | null>(null);
  protected reason = '';

  protected readonly data = rxResource({
    stream: () =>
      this.api.getCurrentElection().pipe(
        switchMap((election) =>
          forkJoin({ election: of(election), candidates: this.api.getCandidates(election.id) }),
        ),
      ),
  });

  protected readonly visible = computed(() => {
    const list = this.data.value()?.candidates ?? [];
    const f = this.filter();
    return (f === 'All' ? list : list.filter((c) => c.status === f))
      .slice()
      .sort((a, b) => new Date(a.nominatedOn).getTime() - new Date(b.nominatedOn).getTime());
  });

  protected countFor(f: Filter): number {
    const list = this.data.value()?.candidates ?? [];
    return f === 'All' ? list.length : list.filter((c) => c.status === f).length;
  }

  protected canReview(phase: string): boolean {
    return phase === 'Scrutiny' || phase === 'Nomination';
  }

  protected async accept(c: Candidate): Promise<void> {
    await this.review(c, 'Accepted');
  }

  protected async reject(c: Candidate): Promise<void> {
    await this.review(c, 'Rejected', this.reason.trim());
    this.rejecting.set(null);
    this.reason = '';
  }

  private async review(c: Candidate, decision: 'Accepted' | 'Rejected', reason?: string): Promise<void> {
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(this.api.reviewNomination(c.electionId, c.id, decision, reason));
      this.toast.success(
        decision === 'Accepted'
          ? `${updated.fullName} accepted — ballot serial no. ${updated.serialNumber}.`
          : `${updated.fullName}'s nomination rejected.`,
      );
      this.data.reload();
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
