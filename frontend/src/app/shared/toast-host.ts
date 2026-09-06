import { Component, inject } from '@angular/core';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind" role="status">
          <span>{{ t.text }}</span>
          <button type="button" class="close" (click)="toasts.dismiss(t.id)" aria-label="Dismiss">
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 1000;
      max-width: min(360px, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      background: var(--text);
      color: #fff;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
      animation: slide-in 0.2s ease-out;
      font-size: 0.9rem;
    }
    .toast.success {
      background: var(--success);
    }
    .toast.error {
      background: var(--danger);
    }
    .close {
      background: transparent;
      border: 0;
      color: inherit;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      opacity: 0.8;
    }
    @keyframes slide-in {
      from {
        transform: translateY(8px);
        opacity: 0;
      }
      to {
        transform: none;
        opacity: 1;
      }
    }
  `,
})
export class ToastHost {
  readonly toasts = inject(ToastService);
}
