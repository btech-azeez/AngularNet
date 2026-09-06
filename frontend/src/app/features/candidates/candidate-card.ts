import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Candidate } from '../../core/models';

@Component({
  selector: 'app-candidate-card',
  imports: [RouterLink],
  template: `
    <article class="card cand" [class.rejected]="candidate().status === 'Rejected'">
      <div class="row between top">
        <div class="symbol" [attr.aria-label]="candidate().symbol">{{ candidate().symbolEmoji }}</div>
        <div class="right">
          @if (candidate().serialNumber; as sn) {
            <span class="badge saffron">Sl. No. {{ sn }}</span>
          }
          @if (showStatus()) {
            <span class="badge" [class]="'badge ' + candidate().status">{{ candidate().status }}</span>
          }
        </div>
      </div>
      <h3>
        <a [routerLink]="['/candidates', candidate().id]">{{ candidate().fullName }}</a>
      </h3>
      <p class="muted small" style="margin: 0 0 0.25rem">
        {{ candidate().gender }}, {{ candidate().age }} · S/o, D/o, W/o {{ candidate().fatherOrSpouseName }}
      </p>
      <p class="muted small">
        Symbol: <strong>{{ candidate().symbol }}</strong> · Ward {{ candidate().wardNumber }} ·
        {{ candidate().occupation }}
      </p>
      <p class="manifesto">{{ candidate().manifesto }}</p>
      <ng-content />
    </article>
  `,
  styles: `
    .cand {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      height: 100%;
    }
    .cand.rejected {
      opacity: 0.7;
    }
    .top {
      align-items: flex-start;
    }
    .symbol {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      font-size: 2rem;
      background: var(--saffron-soft);
      border: 1px solid #ffd9c2;
    }
    .right {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    h3 {
      margin-top: 0.25rem;
    }
    .manifesto {
      font-size: 0.9rem;
      color: #384150;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }
  `,
})
export class CandidateCard {
  readonly candidate = input.required<Candidate>();
  readonly showStatus = input(true);
}
