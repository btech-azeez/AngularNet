import { Component, computed, input } from '@angular/core';
import { ELECTION_PHASES, ElectionPhase } from '../core/models';

@Component({
  selector: 'app-phase-stepper',
  template: `
    <ol class="stepper" aria-label="Election phases">
      @for (p of phases; track p; let i = $index) {
        <li
          class="step"
          [class.done]="i < currentIndex()"
          [class.active]="i === currentIndex()"
          [attr.aria-current]="i === currentIndex() ? 'step' : null"
        >
          <span class="dot">{{ i < currentIndex() ? '✓' : i + 1 }}</span>
          <span class="label">{{ p }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    .stepper {
      display: flex;
      gap: 0;
      list-style: none;
      margin: 0;
      padding: 0;
      overflow-x: auto;
    }
    .step {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      position: relative;
      min-width: 88px;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .step:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 14px;
      left: 50%;
      width: 100%;
      height: 2px;
      background: var(--border);
      z-index: 0;
    }
    .step.done:not(:last-child)::after {
      background: var(--success);
    }
    .dot {
      z-index: 1;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--surface);
      border: 2px solid var(--border);
      font-weight: 600;
    }
    .step.done .dot {
      background: var(--success);
      border-color: var(--success);
      color: #fff;
    }
    .step.active .dot {
      border-color: var(--saffron);
      background: var(--saffron);
      color: #fff;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--saffron) 25%, transparent);
    }
    .step.active .label {
      color: var(--text);
      font-weight: 600;
    }
  `,
})
export class PhaseStepper {
  readonly phase = input.required<ElectionPhase>();
  readonly phases = ELECTION_PHASES;
  readonly currentIndex = computed(() => this.phases.indexOf(this.phase()));
}
