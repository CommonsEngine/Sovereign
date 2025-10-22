export function createSandbox(manifest) {
  return {
    manifest,
    dispose() {},
  };
}
