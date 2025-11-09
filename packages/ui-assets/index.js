import { iconRegistry, getIcon } from "./icons.js";
import { paletteTokens, getPaletteColor } from "./palettes.js";

export { iconRegistry, paletteTokens, getIcon, getPaletteColor };

export function hasIcon(name) {
  return Boolean(iconRegistry[name]);
}

export function hasPaletteToken(token) {
  return Object.prototype.hasOwnProperty.call(paletteTokens, token);
}
