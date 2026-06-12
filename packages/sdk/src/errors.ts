/**
 * Thrown by SDK surfaces that have no standalone implementation: the v1 methods
 * that the Sovereign runtime supplies at runtime, and the post-v1 surfaces
 * (storage, notifications, events) that are declared but not yet implemented.
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

/** Thrown by `sdk.auth.requireSession()` when no authenticated session is present. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('No authenticated session. The caller must be within an authenticated request.');
    this.name = 'NotAuthenticatedError';
  }
}
