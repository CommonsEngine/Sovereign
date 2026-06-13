import { describe, expect, it } from 'vitest';
import { validateRootPlugin } from './root-plugin';
import type { PluginRouteInfo } from './route-guard';

const plugins: PluginRouteInfo[] = [
  { id: 'fs.sovereign.console', routePrefix: '/console', adminOnly: true },
  { id: 'fs.sovereign.launcher', routePrefix: '/launcher' },
  { id: 'fs.example.tasks', routePrefix: '/tasks' },
];
const none = new Set<string>();

describe('validateRootPlugin', () => {
  it('accepts an installed, enabled, non-adminOnly plugin', () => {
    expect(validateRootPlugin('fs.sovereign.launcher', plugins, none)).toEqual({ ok: true });
    expect(validateRootPlugin('fs.example.tasks', plugins, none)).toEqual({ ok: true });
  });

  it('rejects a plugin that is not installed', () => {
    expect(validateRootPlugin('fs.missing', plugins, none)).toEqual({
      ok: false,
      reason: 'not-installed',
    });
  });

  it('rejects a disabled plugin', () => {
    const disabled = new Set(['fs.example.tasks']);
    expect(validateRootPlugin('fs.example.tasks', plugins, disabled)).toEqual({
      ok: false,
      reason: 'disabled',
    });
  });

  it('rejects an adminOnly plugin', () => {
    expect(validateRootPlugin('fs.sovereign.console', plugins, none)).toEqual({
      ok: false,
      reason: 'admin-only',
    });
  });
});
