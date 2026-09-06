import { TestBed } from '@angular/core/testing';
import { PhaseStepper } from './phase-stepper';

describe('PhaseStepper', () => {
  it('marks earlier phases done and the current phase active', async () => {
    await TestBed.configureTestingModule({ imports: [PhaseStepper] }).compileComponents();
    const fixture = TestBed.createComponent(PhaseStepper);
    fixture.componentRef.setInput('phase', 'Polling');
    await fixture.whenStable();

    const steps = Array.from(fixture.nativeElement.querySelectorAll('li.step')) as HTMLElement[];
    expect(steps.length).toBe(6);
    expect(steps.slice(0, 3).every((s) => s.classList.contains('done'))).toBe(true);
    expect(steps[3].classList.contains('active')).toBe(true);
    expect(steps[3].textContent).toContain('Polling');
    expect(steps.slice(4).some((s) => s.classList.contains('done'))).toBe(false);
  });
});
