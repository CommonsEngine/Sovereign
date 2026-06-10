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
