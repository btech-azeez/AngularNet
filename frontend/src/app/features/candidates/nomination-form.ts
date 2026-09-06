import { Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ElectionService } from '../../core/services/election.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/api-error';

/** Free symbols allotted to independent candidates in Panchayat polls. */
export const SYMBOLS: { name: string; emoji: string }[] = [
  { name: 'Coconut', emoji: '🥥' },
  { name: 'Bicycle', emoji: '🚲' },
  { name: 'Tractor', emoji: '🚜' },
  { name: 'Water Pot', emoji: '🏺' },
  { name: 'Lantern', emoji: '🏮' },
  { name: 'Umbrella', emoji: '☂️' },
  { name: 'Kite', emoji: '🪁' },
  { name: 'Bell', emoji: '🔔' },
  { name: 'Drum', emoji: '🥁' },
  { name: 'Mango', emoji: '🥭' },
  { name: 'Sun', emoji: '☀️' },
  { name: 'Cricket Bat', emoji: '🏏' },
  { name: 'Sewing Machine', emoji: '🧵' },
  { name: 'Whistle', emoji: '📯' },
  { name: 'Book', emoji: '📗' },
  { name: 'Truck', emoji: '🚚' },
];

@Component({
  selector: 'app-nomination-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <a routerLink="/candidates" class="muted small">← Candidates</a>
    <div class="wrap">
      <div class="card">
        <h1>File nomination for Sarpanch</h1>

        @if (meta.value(); as m) {
          @if (m.election.phase !== 'Nomination') {
            <div class="alert warn">
              Nominations are not open right now (current phase:
              <strong>{{ m.election.phase }}</strong
              >).
            </div>
          } @else {
            <p class="muted">
              Nominations close on <strong>{{ m.election.nominationEndsOn.slice(0, 10) }}</strong
              >. All fields are mandatory. The Returning Officer will scrutinise your application.
            </p>
          }

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="grid cols-2">
              <div class="field">
                <label for="fullName">Full name</label>
                <input id="fullName" formControlName="fullName" placeholder="As on voter ID" />
                @if (invalid('fullName')) {
                  <span class="err">Enter your full name (min 3 characters).</span>
                }
              </div>
              <div class="field">
                <label for="father">Father's / Spouse's name</label>
                <input id="father" formControlName="fatherOrSpouseName" />
                @if (invalid('fatherOrSpouseName')) {
                  <span class="err">Required.</span>
                }
              </div>
              <div class="field">
                <label for="age">Age</label>
                <input id="age" type="number" formControlName="age" min="21" max="100" />
                <span class="hint">Must be 21 or older on the date of nomination.</span>
                @if (invalid('age')) {
                  <span class="err">Age must be between 21 and 100.</span>
                }
              </div>
              <div class="field">
                <label for="gender">Gender</label>
                <select id="gender" formControlName="gender">
                  <option value="">Select…</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
                @if (invalid('gender')) {
                  <span class="err">Required.</span>
                }
              </div>
              <div class="field">
                <label for="ward">Home ward</label>
                <select id="ward" formControlName="wardId">
                  <option [ngValue]="null">Select…</option>
                  @for (w of m.wards; track w.id) {
                    <option [ngValue]="w.id">Ward {{ w.number }} — {{ w.name }}</option>
                  }
                </select>
                @if (invalid('wardId')) {
                  <span class="err">Choose your ward.</span>
                }
              </div>
              <div class="field">
                <label for="education">Education</label>
                <input
                  id="education"
                  formControlName="education"
                  placeholder="e.g. B.A., SSC, Intermediate"
                />
                @if (invalid('education')) {
                  <span class="err">Required.</span>
                }
              </div>
              <div class="field">
                <label for="occupation">Occupation</label>
                <input
                  id="occupation"
                  formControlName="occupation"
                  placeholder="e.g. Farmer, Teacher"
                />
                @if (invalid('occupation')) {
                  <span class="err">Required.</span>
                }
              </div>
            </div>

            <div class="field">
              <label>Choose an election symbol</label>
              <div class="symbols">
                @for (s of symbols; track s.name) {
                  <button
                    type="button"
                    class="sym"
                    [class.taken]="taken().has(s.name)"
                    [class.selected]="form.value.symbol === s.name"
                    [disabled]="taken().has(s.name)"
                    (click)="pick(s)"
                    [attr.aria-pressed]="form.value.symbol === s.name"
                    [title]="taken().has(s.name) ? s.name + ' (already allotted)' : s.name"
                  >
                    <span class="e">{{ s.emoji }}</span>
                    <span class="n">{{ s.name }}</span>
                  </button>
                }
              </div>
              @if (invalid('symbol')) {
                <span class="err">Pick a symbol.</span>
              }
            </div>

            <div class="field">
              <label for="manifesto">Manifesto / promises to the village</label>
              <textarea
                id="manifesto"
                formControlName="manifesto"
                placeholder="What will you do for the village in the next 5 years?"
              ></textarea>
              <span class="hint"
                >{{ form.value.manifesto?.length || 0 }}/1000 characters (min 30).</span
              >
              @if (invalid('manifesto')) {
                <span class="err">Write at least 30 characters.</span>
              }
            </div>

            <label class="declare">
              <input type="checkbox" formControlName="declaration" style="width: auto" />
              <span>
                I solemnly declare that I am an elector of this Gram Panchayat, I am not
                disqualified under the Panchayat Raj Act, and the particulars given above are true.
              </span>
            </label>

            @if (error()) {
              <div class="alert error">{{ error() }}</div>
            }

            <div class="row" style="margin-top: 1rem">
              <button
                type="submit"
                class="btn primary lg"
                [disabled]="busy() || m.election.phase !== 'Nomination'"
              >
                {{ busy() ? 'Submitting…' : 'Submit nomination' }}
              </button>
              <a routerLink="/candidates" class="btn ghost">Cancel</a>
            </div>
          </form>
        } @else if (meta.error()) {
          <div class="alert error">{{ errorText(meta.error()) }}</div>
        } @else {
          <div class="skeleton" style="height: 320px"></div>
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      margin-top: 1rem;
      max-width: 860px;
    }
    .symbols {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 0.5rem;
    }
    .sym {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;
      padding: 0.6rem 0.25rem;
      border-radius: 12px;
      border: 2px solid var(--border);
      background: #fff;
      cursor: pointer;
      font: inherit;
    }
    .sym .e {
      font-size: 1.7rem;
    }
    .sym .n {
      font-size: 0.72rem;
      color: var(--muted);
    }
    .sym.selected {
      border-color: var(--saffron);
      background: var(--saffron-soft);
    }
    .sym.taken {
      opacity: 0.4;
      cursor: not-allowed;
      text-decoration: line-through;
    }
    .declare {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      font-size: 0.9rem;
      margin-block: 0.5rem;
    }
  `,
})
export class NominationForm {
  private readonly api = inject(ElectionService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly symbols = SYMBOLS;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly meta = rxResource({
    stream: () =>
      forkJoin({
        election: this.api.getCurrentElection(),
        wards: this.api.getWards(),
      }),
  });

  /** Symbols already allotted in this election (fetched lazily once the election id is known). */
  protected readonly taken = signal(new Set<string>());

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    fatherOrSpouseName: ['', [Validators.required, Validators.maxLength(80)]],
    age: [null as number | null, [Validators.required, Validators.min(21), Validators.max(100)]],
    gender: ['', Validators.required],
    wardId: [null as number | null, Validators.required],
    education: ['', [Validators.required, Validators.maxLength(80)]],
    occupation: ['', [Validators.required, Validators.maxLength(80)]],
    symbol: ['', Validators.required],
    symbolEmoji: [''],
    manifesto: ['', [Validators.required, Validators.minLength(30), Validators.maxLength(1000)]],
    declaration: [false, Validators.requiredTrue],
  });

  constructor() {
    // Once we know the election, load the existing candidates to grey out taken symbols.
    void this.loadTaken();
  }

  private async loadTaken(): Promise<void> {
    try {
      const election = await firstValueFrom(this.api.getCurrentElection());
      const cands = await firstValueFrom(this.api.getCandidates(election.id));
      this.taken.set(
        new Set(
          cands
            .filter((c) => c.status !== 'Rejected' && c.status !== 'Withdrawn')
            .map((c) => c.symbol),
        ),
      );
    } catch {
      /* non-fatal — the API will still reject duplicates */
    }
  }

  protected pick(s: { name: string; emoji: string }): void {
    this.form.patchValue({ symbol: s.name, symbolEmoji: s.emoji });
    this.form.controls.symbol.markAsTouched();
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    const election = this.meta.value()?.election;
    if (!election) return;

    this.busy.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    try {
      const created = await firstValueFrom(
        this.api.fileNomination(election.id, {
          fullName: v.fullName.trim(),
          fatherOrSpouseName: v.fatherOrSpouseName.trim(),
          age: Number(v.age),
          gender: v.gender,
          wardId: Number(v.wardId),
          education: v.education.trim(),
          occupation: v.occupation.trim(),
          symbol: v.symbol,
          symbolEmoji: v.symbolEmoji,
          manifesto: v.manifesto.trim(),
        }),
      );
      this.toast.success('Nomination filed. It will appear once the Returning Officer accepts it.');
      await this.router.navigate(['/candidates', created.id]);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected errorText(err: unknown): string {
    return apiErrorMessage(err);
  }
}
