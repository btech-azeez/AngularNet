import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/api-error';

type Mode = 'voter' | 'admin';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="login">
      <div class="card">
        <div class="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'voter'"
            [class.active]="mode() === 'voter'"
            (click)="switchMode('voter')"
          >
            🗳️ Voter
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'admin'"
            [class.active]="mode() === 'admin'"
            (click)="switchMode('admin')"
          >
            🛡️ Election Officer
          </button>
        </div>

        @if (mode() === 'voter') {
          <h2>Voter sign in</h2>
          <p class="muted small">
            Enter the EPIC number printed on your voter ID card. We'll send a one-time password to
            your registered mobile.
          </p>

          <form (ngSubmit)="voterLogin()" #f="ngForm" novalidate>
            <div class="field">
              <label for="epic">EPIC / Voter ID number</label>
              <input
                id="epic"
                name="epic"
                [(ngModel)]="epic"
                required
                minlength="6"
                autocomplete="username"
                placeholder="e.g. TS/01/001/0001"
                [disabled]="otpSent()"
                style="text-transform: uppercase"
              />
            </div>

            @if (!otpSent()) {
              <button type="button" class="btn primary block" (click)="requestOtp()" [disabled]="busy() || !epic">
                {{ busy() ? 'Sending…' : 'Send OTP' }}
              </button>
            } @else {
              <div class="field">
                <label for="otp">One-time password</label>
                <input
                  id="otp"
                  name="otp"
                  [(ngModel)]="otp"
                  required
                  inputmode="numeric"
                  pattern="[0-9]{6}"
                  maxlength="6"
                  autocomplete="one-time-code"
                  placeholder="6-digit OTP"
                />
                @if (demoOtp()) {
                  <span class="hint">
                    Demo mode — no SMS is sent. Your OTP is <strong>{{ demoOtp() }}</strong>.
                  </span>
                }
              </div>
              <div class="row">
                <button type="submit" class="btn success" [disabled]="busy() || f.invalid">
                  {{ busy() ? 'Verifying…' : 'Verify & sign in' }}
                </button>
                <button type="button" class="btn ghost" (click)="reset()" [disabled]="busy()">
                  Change EPIC
                </button>
              </div>
            }
          </form>
        } @else {
          <h2>Election Officer sign in</h2>
          <p class="muted small">Reserved for the Returning Officer and polling staff.</p>

          <form (ngSubmit)="adminLogin()" #a="ngForm" novalidate>
            <div class="field">
              <label for="username">Username</label>
              <input id="username" name="username" [(ngModel)]="username" required autocomplete="username" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                [(ngModel)]="password"
                required
                autocomplete="current-password"
              />
            </div>
            <button type="submit" class="btn primary block" [disabled]="busy() || a.invalid">
              {{ busy() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        }

        @if (error()) {
          <div class="alert error" style="margin-top: 1rem">{{ error() }}</div>
        }
      </div>

      <aside class="card flat demo">
        <h3>Demo credentials</h3>
        <p class="small muted">The database is seeded with sample data so you can explore every role.</p>
        <table class="table small">
          <tbody>
            <tr>
              <td><strong>Returning Officer</strong></td>
              <td><code>admin</code> / <code>Admin@123</code></td>
            </tr>
            <tr>
              <td><strong>Voter (Ward 1)</strong></td>
              <td><code>TS/01/001/0001</code></td>
            </tr>
            <tr>
              <td><strong>Voter (Ward 3)</strong></td>
              <td><code>TS/01/003/0001</code></td>
            </tr>
          </tbody>
        </table>
        <p class="small muted" style="margin: 0.5rem 0 0">
          Voter OTPs are shown on screen in demo mode. The admin console also has a “Voters” page listing
          every EPIC number.
        </p>
      </aside>
    </div>
  `,
  styles: `
    .login {
      display: grid;
      grid-template-columns: minmax(0, 460px) minmax(0, 360px);
      gap: 1.5rem;
      justify-content: center;
      align-items: start;
    }
    @media (max-width: 860px) {
      .login {
        grid-template-columns: 1fr;
      }
    }
    .tabs {
      display: flex;
      gap: 0.25rem;
      background: #f1f3f6;
      padding: 0.25rem;
      border-radius: 10px;
      margin-bottom: 1.25rem;
    }
    .tabs button {
      flex: 1;
      border: 0;
      background: transparent;
      padding: 0.55rem;
      border-radius: 8px;
      font: inherit;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
    }
    .tabs button.active {
      background: #fff;
      color: var(--text);
      box-shadow: var(--shadow);
    }
    .demo code {
      background: #f1f3f6;
      padding: 0.1rem 0.35rem;
      border-radius: 6px;
    }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Bound from the query string via withComponentInputBinding(). */
  readonly as = input<string | undefined>();
  readonly returnUrl = input<string | undefined>();

  protected readonly mode = signal<Mode>('voter');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly otpSent = signal(false);
  protected readonly demoOtp = signal<string | null>(null);

  protected epic = '';
  protected otp = '';
  protected username = '';
  protected password = '';

  constructor() {
    // Pick the initial tab from ?as=admin|voter
    queueMicrotask(() => {
      if (this.as() === 'admin') this.mode.set('admin');
    });
  }

  protected switchMode(m: Mode): void {
    this.mode.set(m);
    this.error.set(null);
  }

  protected reset(): void {
    this.otpSent.set(false);
    this.demoOtp.set(null);
    this.otp = '';
    this.error.set(null);
  }

  protected async requestOtp(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.auth.requestOtp(this.epic.trim().toUpperCase());
      this.otpSent.set(true);
      this.demoOtp.set(res.demoOtp ?? null);
      this.toast.show(res.message, 'info');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async voterLogin(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.loginVoter({
        epicNumber: this.epic.trim().toUpperCase(),
        otp: this.otp.trim(),
      });
      this.toast.success(`Welcome, ${user.name}`);
      await this.router.navigateByUrl(this.returnUrl() || '/vote');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async adminLogin(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.loginAdmin({ username: this.username.trim(), password: this.password });
      this.toast.success(`Signed in as ${user.name}`);
      await this.router.navigateByUrl(this.returnUrl() || '/admin');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
