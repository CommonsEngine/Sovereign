import { describe, expect, it } from 'vitest';
import { NotImplementedError, NotAuthenticatedError, sdk } from './index';

describe('sdk', () => {
  it('exposes the full v1 surface', () => {
    expect(typeof sdk.auth.getSession).toBe('function');
    expect(typeof sdk.auth.requireSession).toBe('function');
    expect(typeof sdk.db.getClient).toBe('function');
    expect(typeof sdk.mailer.send).toBe('function');
    expect(typeof sdk.platform.getConfig).toBe('function');
    expect(typeof sdk.storage.put).toBe('function');
    expect(typeof sdk.storage.get).toBe('function');
    expect(typeof sdk.notifications.send).toBe('function');
    expect(typeof sdk.events.publish).toBe('function');
    expect(typeof sdk.events.subscribe).toBe('function');
  });

  it('db and platform stubs throw NotImplementedError (wired in Task 0.5.05)', () => {
    expect(() => sdk.db.getClient()).toThrow(NotImplementedError);
    expect(() => sdk.platform.getConfig()).toThrow(NotImplementedError);
  });

  it('post-v1 surfaces throw NotImplementedError with a clear v1 message', () => {
    expect(() => sdk.storage.put('k', Buffer.from('x'))).toThrow(/not implemented in Sovereign v1/);
    expect(() => sdk.notifications.send('u', 'hi')).toThrow(NotImplementedError);
    expect(() => sdk.events.subscribe('e', () => undefined)).toThrow(NotImplementedError);
  });

  it('exports NotAuthenticatedError', () => {
    const err = new NotAuthenticatedError();
    expect(err.name).toBe('NotAuthenticatedError');
    expect(err).toBeInstanceOf(Error);
  });
});
