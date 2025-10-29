export default async function createExtHost(manifest) {
  // TODO: Review usefulness of this file.
  return {
    ...manifest,
    plugins: manifest.plugins,
    enabledPlugins: manifest.enabledPlugins,
    __assets: manifest.__assets,
  };
}
