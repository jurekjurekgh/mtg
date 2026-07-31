/** Mały, tekstowy zapis partii: konfiguracja/seed plus lista komend. */
import { stateFingerprint } from './fingerprint.js';

export function createReplay(seed, commands = []) {
  if (!Number.isInteger(seed) || !Array.isArray(commands)) throw new TypeError('Nieprawidłowy replay');
  return { version: 1, seed, commands: commands.map((c) => ({ ...c })) };
}

/** Tworzy zapis z zaakceptowanych komend bieżącej partii. */
export function replayFromState(state) {
  return createReplay(state.seed, state.commands ?? []);
}

export function serializeReplay(replay) {
  return `${JSON.stringify(replay)}\n`;
}

export function parseReplay(text) {
  try {
    const replay = JSON.parse(text);
    if (replay?.version !== 1 || !Number.isInteger(replay.seed) || !Array.isArray(replay.commands)) throw new Error();
    return createReplay(replay.seed, replay.commands);
  } catch {
    throw new TypeError('Nieprawidłowy format zapisu partii');
  }
}

/** Odtwarza komendy od stanu początkowego, zwracając wynik każdego kroku. */
export function playReplay(replay, createState, onCommand = () => {}) {
  const state = createState(replay.seed);
  const results = [];
  for (const cmd of replay.commands) {
    const result = onCommand(state, cmd);
    results.push(result);
  }
  return { state, results };
}

/** Odtwarza replay dwa razy i porównuje fingerprint końcowego stanu. */
export function verifyReplay(replay, createState, apply) {
  const first = playReplay(replay, createState, apply);
  const second = playReplay(replay, createState, apply);
  const firstFingerprint = stateFingerprint(first.state);
  const secondFingerprint = stateFingerprint(second.state);
  return { deterministic: firstFingerprint === secondFingerprint, fingerprint: firstFingerprint, state: first.state, results: first.results };
}
