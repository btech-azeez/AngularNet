import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('prefers ProblemDetails.detail', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: { title: 'Conflict', status: 409, detail: 'You have already voted in this election.' },
    });
    expect(apiErrorMessage(err)).toBe('You have already voted in this election.');
  });

  it('surfaces the first validation error', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { Age: ['A candidate must be between 21 and 100 years old.'] },
      },
    });
    expect(apiErrorMessage(err)).toBe('A candidate must be between 21 and 100 years old.');
  });

  it('explains a network failure', () => {
    const err = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });
    expect(apiErrorMessage(err)).toContain('Cannot reach the election server');
  });

  it('falls back for unknown errors', () => {
    expect(apiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
