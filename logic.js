/* DREADNOUGHT is a single-player, client-side game: all rules run in the browser
 * (game.js). The hosting platform still requires a rules module at the archive
 * root, so this is the canonical solo stub — no imports, no timers. */
export const meta = { game: "dreadnought", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
