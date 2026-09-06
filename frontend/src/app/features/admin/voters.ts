import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, forkJoin, of, switchMap } from 'rxjs';
import { ElectionService } from '../../core/services/election.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/api-error';

@Component({
  selector: 'app-admin-voters',
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <header class="row between">
      <div>
        <h1>Voter roll</h1>
        <p class="muted">
          Electoral roll for the current election. Voters sign in with their EPIC number.
        </p>
      </div>
      <button type="button" class="btn primary sm" (click)="adding.set(!adding())">
        {{ adding() ? 'Close' : '+ Add voter' }}
      </button>
    </header>

    @if (adding()) {
      <form class="card grid cols-4" (ngSubmit)="add()" #f="ngForm" novalidate>
        <div class="field">
          <label for="v-name">Full name</label>
          <input id="v-name" name="fullName" [(ngModel)]="draft.fullName" required minlength="3" />
        </div>
        <div class="field">
          <label for="v-age">Age</label>
          <input
            id="v-age"
            name="age"
            type="number"
            [(ngModel)]="draft.age"
            required
            min="18"
            max="120"
          />
        </div>
        <div class="field">
          <label for="v-gender">Gender</label>
          <select id="v-gender" name="gender" [(ngModel)]="draft.gender" required>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label for="v-ward">Ward</label>
          <select id="v-ward" name="wardId" [(ngModel)]="draft.wardId" required>
            @for (w of meta.value()?.wards ?? []; track w.id) {
              <option [ngValue]="w.id">Ward {{ w.number }} — {{ w.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="v-house">House no.</label>
          <input id="v-house" name="houseNumber" [(ngModel)]="draft.houseNumber" required />
        </div>
        <div class="field">
          <label for="v-mobile">Mobile</label>
          <input
            id="v-mobile"
            name="mobile"
            [(ngModel)]="draft.mobile"
            required
            pattern="[6-9][0-9]{9}"
            placeholder="10 digits"
          />
        </div>
        <div class="field" style="justify-content: flex-end">
          <button type="submit" class="btn success" [disabled]="busy() || f.invalid">
            {{ busy() ? 'Saving…' : 'Add to roll' }}
          </button>
        </div>
      </form>
    }

    <div class="card row">
      <input
        type="search"
        placeholder="Search by name, EPIC or house number…"
        [ngModel]="search()"
        (ngModelChange)="onSearch($event)"
        style="max-width: 360px"
      />
      <select [ngModel]="wardId()" (ngModelChange)="onWard($event)" style="max-width: 220px">
        <option [ngValue]="0">All wards</option>
        @for (w of meta.value()?.wards ?? []; track w.id) {
          <option [ngValue]="w.id">Ward {{ w.number }} — {{ w.name }}</option>
        }
      </select>
      <span class="spacer"></span>
      @if (page.value(); as p) {
        <span class="muted small">{{ p.total | number }} voters</span>
      }
    </div>

    @if (page.isLoading() && !page.hasValue()) {
      <div class="skeleton" style="height: 320px"></div>
    } @else if (page.error()) {
      <div class="alert error">{{ errorText(page.error()) }}</div>
    } @else if (page.value(); as p) {
      <div class="card table-wrap" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>EPIC</th>
              <th>Name</th>
              <th>Age / Gender</th>
              <th>Ward</th>
              <th>House</th>
              <th>Mobile</th>
              <th>Voted</th>
            </tr>
          </thead>
          <tbody>
            @for (v of p.items; track v.id) {
              <tr>
                <td>
                  <code>{{ v.epicNumber }}</code>
                </td>
                <td>
                  <strong>{{ v.fullName }}</strong>
                </td>
                <td>{{ v.age }} / {{ v.gender.charAt(0) }}</td>
                <td>{{ v.wardNumber }}</td>
                <td>{{ v.houseNumber }}</td>
                <td>{{ v.mobile }}</td>
                <td>
                  @if (v.hasVoted) {
                    <span class="badge green">✓ {{ v.votedAt | date: 'h:mm a' }}</span>
                  } @else {
                    <span class="badge">—</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty">No voters match.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="row between">
        <span class="muted small">Page {{ p.page }} of {{ totalPages() }}</span>
        <div class="row">
          <button
            type="button"
            class="btn sm"
            [disabled]="p.page <= 1"
            (click)="pageNo.set(p.page - 1)"
          >
            ← Prev
          </button>
          <button
            type="button"
            class="btn sm"
            [disabled]="p.page >= totalPages()"
            (click)="pageNo.set(p.page + 1)"
          >
            Next →
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    code {
      background: #f1f3f6;
      padding: 0.1rem 0.4rem;
      border-radius: 6px;
      font-size: 0.85rem;
    }
  `,
})
export class Voters {
  private readonly api = inject(ElectionService);
  private readonly toast = inject(ToastService);

  protected readonly search = signal('');
  protected readonly wardId = signal(0);
  protected readonly pageNo = signal(1);
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);

  protected draft = {
    fullName: '',
    age: 18,
    gender: 'Female',
    wardId: 0,
    houseNumber: '',
    mobile: '',
  };
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly meta = rxResource({
    stream: () => forkJoin({ election: this.api.getCurrentElection(), wards: this.api.getWards() }),
  });

  protected readonly page = rxResource({
    params: () => ({ search: this.search(), wardId: this.wardId(), page: this.pageNo() }),
    stream: ({ params }) =>
      this.api.getCurrentElection().pipe(
        switchMap((e) =>
          this.api.getVoters(e.id, {
            search: params.search || undefined,
            wardId: params.wardId || undefined,
            page: params.page,
            pageSize: 25,
          }),
        ),
      ),
  });

  protected readonly totalPages = computed(() => {
    const p = this.page.value();
    return p ? Math.max(1, Math.ceil(p.total / p.pageSize)) : 1;
  });

  protected onSearch(term: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.pageNo.set(1);
      this.search.set(term);
    }, 250);
  }

  protected onWard(id: number): void {
    this.pageNo.set(1);
    this.wardId.set(Number(id));
  }

  protected async add(): Promise<void> {
    const election = this.meta.value()?.election;
    if (!election) return;
    if (!this.draft.wardId) this.draft.wardId = this.meta.value()?.wards[0]?.id ?? 0;
    this.busy.set(true);
    try {
      const v = await firstValueFrom(
        this.api.addVoter(election.id, { ...this.draft, age: Number(this.draft.age) }),
      );
      this.toast.success(`${v.fullName} added — EPIC ${v.epicNumber}`);
      this.draft = {
        fullName: '',
        age: 18,
        gender: 'Female',
        wardId: this.draft.wardId,
        houseNumber: '',
        mobile: '',
      };
      this.adding.set(false);
      this.page.reload();
      this.meta.reload();
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
