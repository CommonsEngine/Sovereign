export default async function createExtHost(manifest) {
  return {
    ...manifest,
    plugins: manifest.plugins,
    enabledPlugins: manifest.enabledPlugins,
    __assets: manifest.__assets,
  };
}
