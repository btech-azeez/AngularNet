import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { NominationStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ElectionService } from '../../core/services/election.service';
import { apiErrorMessage } from '../../core/utils/api-error';
import { CandidateCard } from './candidate-card';

type Filter = 'All' | NominationStatus;

@Component({
  selector: 'app-candidate-list',
  imports: [RouterLink, CandidateCard],
  template: `
    <div class="row between head">
      <div>
        <h1>Candidates</h1>
        @if (data.value(); as d) {
          <p class="muted">
            {{ d.election.title }} · Phase: <span class="badge" [class]="'badge ' + d.election.phase">{{ d.election.phase }}</span>
          </p>
        }
      </div>
      @if (data.value()?.election?.phase === 'Nomination') {
        <a routerLink="/candidates/nominate" class="btn primary">+ File nomination</a>
      }
    </div>

    @if (data.isLoading()) {
      <div class="grid cols-3">
        <div class="skeleton" style="height: 220px"></div>
        <div class="skeleton" style="height: 220px"></div>
        <div class="skeleton" style="height: 220px"></div>
      </div>
    } @else if (data.error()) {
      <div class="alert error">{{ errorText(data.error()) }}</div>
    } @else if (data.value(); as d) {
      @if (auth.isAdmin()) {
        <div class="filters row">
          @for (f of filters; track f) {
            <button type="button" class="btn sm" [class.primary]="filter() === f" (click)="filter.set(f)">
              {{ f }}
              <span class="count">{{ countFor(f) }}</span>
            </button>
          }
        </div>
      }

      @if (visible().length === 0) {
        <div class="card empty">
          <p>No candidates to show yet.</p>
          @if (d.election.phase === 'Nomination') {
            <a routerLink="/candidates/nominate" class="btn primary">Be the first to file a nomination</a>
          }
        </div>
      } @else {
        <div class="grid cols-3">
          @for (c of visible(); track c.id) {
            <app-candidate-card [candidate]="c" [showStatus]="auth.isAdmin() || c.status !== 'Accepted'" />
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .head {
      align-items: flex-start;
    }
    .filters {
      gap: 0.4rem;
    }
    .count {
      background: rgba(0, 0, 0, 0.08);
      border-radius: 999px;
      padding: 0 0.45rem;
      font-size: 0.75rem;
    }
  `,
})
export class CandidateList {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ElectionService);

  protected readonly filters: Filter[] = ['All', 'Pending', 'Accepted', 'Rejected', 'Withdrawn'];
  protected readonly filter = signal<Filter>('All');

  protected readonly data = rxResource({
    stream: () =>
      this.api.getCurrentElection().pipe(
        switchMap((election) =>
          forkJoin({
            election: of(election),
            // Public users only see accepted candidates; officers see every nomination.
            candidates: this.auth.isAdmin()
              ? this.api.getCandidates(election.id)
              : this.api.getCandidates(election.id, 'Accepted'),
          }),
        ),
      ),
  });

  protected readonly visible = computed(() => {
    const list = this.data.value()?.candidates ?? [];
    const f = this.filter();
    return (f === 'All' ? list : list.filter((c) => c.status === f)).slice().sort((a, b) => {
      // Accepted candidates first (by serial number), then others by name.
      if (a.serialNumber && b.serialNumber) return a.serialNumber - b.serialNumber;
      if (a.serialNumber) return -1;
      if (b.serialNumber) return 1;
      return a.fullName.localeCompare(b.fullName);
    });
  });

  protected countFor(f: Filter): number {
    const list = this.data.value()?.candidates ?? [];
    return f === 'All' ? list.length : list.filter((c) => c.status === f).length;
  }

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
