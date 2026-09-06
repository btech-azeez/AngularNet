import { DatePipe } from '@angular/common';
import { Component, inject, input, numberAttribute } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ElectionService } from '../../core/services/election.service';
import { apiErrorMessage } from '../../core/utils/api-error';

@Component({
  selector: 'app-candidate-detail',
  imports: [RouterLink, DatePipe],
  template: `
    <a routerLink="/candidates" class="muted small">← All candidates</a>

    @if (candidate.isLoading()) {
      <div class="skeleton" style="height: 260px; margin-top: 1rem"></div>
    } @else if (candidate.error()) {
      <div class="alert error" style="margin-top: 1rem">{{ errorText(candidate.error()) }}</div>
    } @else if (candidate.value(); as c) {
      <article class="card detail">
        <header class="row">
          <div class="symbol">{{ c.symbolEmoji }}</div>
          <div>
            <h1>{{ c.fullName }}</h1>
            <div class="row">
              <span class="badge" [class]="'badge ' + c.status">{{ c.status }}</span>
              @if (c.serialNumber) {
                <span class="badge saffron">Ballot Sl. No. {{ c.serialNumber }}</span>
              }
              <span class="badge">Ward {{ c.wardNumber }}</span>
            </div>
          </div>
        </header>

        @if (c.status === 'Rejected' && c.rejectionReason) {
          <div class="alert error">Nomination rejected: {{ c.rejectionReason }}</div>
        }

        <dl class="facts">
          <dt>Election symbol</dt>
          <dd>{{ c.symbolEmoji }} {{ c.symbol }}</dd>
          <dt>Father / Spouse</dt>
          <dd>{{ c.fatherOrSpouseName }}</dd>
          <dt>Age & gender</dt>
          <dd>{{ c.age }} · {{ c.gender }}</dd>
          <dt>Education</dt>
          <dd>{{ c.education }}</dd>
          <dt>Occupation</dt>
          <dd>{{ c.occupation }}</dd>
          <dt>Nomination filed</dt>
          <dd>{{ c.nominatedOn | date: 'd MMM y, h:mm a' }}</dd>
        </dl>

        <section>
          <h3>Manifesto</h3>
          <p class="manifesto">{{ c.manifesto }}</p>
        </section>
      </article>
    }
  `,
  styles: `
    .detail {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .symbol {
      width: 84px;
      height: 84px;
      border-radius: 20px;
      display: grid;
      place-items: center;
      font-size: 3rem;
      background: var(--saffron-soft);
      border: 1px solid #ffd9c2;
    }
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.4rem 1.5rem;
      margin: 0;
    }
    .facts dt {
      color: var(--muted);
      font-size: 0.85rem;
    }
    .facts dd {
      margin: 0;
      font-weight: 600;
    }
    .manifesto {
      white-space: pre-line;
      line-height: 1.65;
    }
  `,
})
export class CandidateDetail {
  private readonly api = inject(ElectionService);

  readonly id = input.required({ transform: numberAttribute });

  protected readonly candidate = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) =>
      this.api.getCurrentElection().pipe(switchMap((e) => this.api.getCandidate(e.id, id))),
  });

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
