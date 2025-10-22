export function createSandbox(manifest, _options = {}) {
  return {
    manifest,
    dispose() {},
  };
}
