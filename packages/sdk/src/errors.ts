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

/**
 * Thrown by `sdk.data.query()` when the current user has not granted the calling
 * (consumer) plugin consent to read the requested provider contract — the
 * consent-gated cross-plugin data-sharing mechanism (RFC 0002). Reserved
 * alongside that surface; not raised until the mechanism is implemented.
 */
export class ConsentRequiredError extends Error {
  constructor(message = 'User consent is required to access this plugin data.') {
    super(message);
    this.name = 'ConsentRequiredError';
  }
}
