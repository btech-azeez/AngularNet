import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from '../models';

/** Extracts a human-readable message from an ASP.NET Core ProblemDetails / validation error. */
export function apiErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the election server. Is the API running?';
    const body = err.error as ApiError | string | null;
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object') {
      if (body.errors) {
        const first = Object.values(body.errors).flat()[0];
        if (first) return first;
      }
      if (body.detail) return body.detail;
      if (body.title) return body.title;
    }
    if (err.status === 401) return 'Please sign in to continue.';
    if (err.status === 403) return 'You are not allowed to do that.';
    if (err.status === 404) return 'Not found.';
  }
  return fallback;
}
