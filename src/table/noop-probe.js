/**
 * Sonda „oferta bez skutku" (M103, L15) — mechaniczne wsparcie Żywego
 * Testera (tools/table-tester) dla wzorca audytu z M102 U8/U9/U10:
 * „czy panel oferuje akcję, która nic nie zmienia albo jest pewną stratą?"
 *
 * Dotąd wzorzec wymagał ręcznego czytania transkryptów; sonda automatyzuje
 * pomiar: wykonuje KOMENDĘ Z PANELU na klonie stanu (structuredClone)
 * z w pełni PASYWNYM przeciwnikiem (polityka: zawsze pass) i porównuje
 * fingerprint stanu przed/po. Wynik klasyfikuje detektor
 * `detectNoEffectOffers` w tools/table-tester/detectors.mjs.
 *
 * Sonda jest czysto mechaniczna i deterministyczna (ADR 0005): klon + te
 * same komendy dają ten sam wynik. NIGDY nie dotyka prawdziwej partii —
 * prawdziwy stan jest tylko odczytywany do sklonowania.
 *
 * Moduł nie dotyka DOM-u — testowalny headless (test/noop-probe.test.js).
 */
import { execute, playerView } from '../engine/game-state.js';
import { stateFingerprint } from '../engine/fingerprint.js';

/** Bezpiecznik: tyle komend pass-pętli symulacji rozstrzygania. */
const MAX_PROBE_COMMANDS = 200;

/**
 * Głęboka kopia stanu przenośna między realmami: w jsdom (artefakt Żywego
 * Testera) nie ma structuredClone, więc sonda używa własnego klona dla
 * Map/Set/tablic/obiektów. W Node (testy) bierzemy natywny structuredClone.
 */
function deepClone(value) {
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([k, v]) => [k, deepClone(v)]));
  }
  if (value instanceof Set) return new Set([...value].map((v) => deepClone(v)));
  if (Array.isArray(value)) return value.map((v) => deepClone(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return out;
  }
  return value;
}

function cloneState(state) {
  return typeof structuredClone === 'function' ? structuredClone(state) : deepClone(state);
}

/**
 * Dyf ścieżkowy dwóch fingerprintów (JSON z stateFingerprint). Zwraca
 * ścieżki w zapisie `objects[i].<pole>` (indeks w tablicy obiektów),
 * `players[i].<pole>`, `zones.<strefa>`, `turn.<pole>`...
 * Czysta funkcja — testy bez engine.
 */
export function diffFingerprintPaths(beforeFp, afterFp) {
  const before = JSON.parse(beforeFp);
  const after = JSON.parse(afterFp);
  const paths = [];
  const walk = (a, b, prefix) => {
    if (Object.is(a, b)) return;
    if (a === null || b === null || typeof a !== typeof b || typeof a !== 'object') {
      paths.push(prefix);
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        paths.push(prefix);
        return;
      }
      for (let i = 0; i < a.length; i += 1) walk(a[i], b[i], `${prefix}[${i}]`);
      return;
    }
    const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
    for (const key of keys) walk(a[key], b[key], prefix ? `${prefix}.${key}` : key);
  };
  walk(before, after, '');
  return paths;
}

/** Czy komenda ma dany rodzaj kosztu (do klasyfikacji „tylko koszt"). */
function costSignatureOf(state, cmd) {
  if (!cmd) return {};
  if (cmd.type === 'activate_ability') {
    const obj = state.objects.get(cmd.objectId);
    const ability = Number.isInteger(cmd.abilityIndex) ? obj?.abilities?.[cmd.abilityIndex] : null;
    const cost = ability?.cost ?? {};
    const sig = {
      mana: (cost.mana ?? 0) > 0,
      tap: Boolean(cost.tap),
      tapCreature: Boolean(cost.tapCreature),
      life: (cost.life ?? 0) > 0,
    };
    // Equip (CR 702.6): koszt siedzi w deskryptorze equipment, nie w ability.
    if (ability?.keyword === 'equip' && obj?.equipment) {
      sig.mana = sig.mana || (obj.equipment.equip ?? 0) > 0;
    }
    return sig;
  }
  if (['cast_spell', 'cast_permanent', 'cast_aura', 'cast_cleave', 'cast_escape',
    'cast_flashback', 'cast_adventure', 'cast_adventure_creature'].includes(cmd.type)) {
    return { mana: true, tap: false, tapCreature: false, life: false };
  }
  return {};
}

/** Zdarzenia z fizzle, które dotyczą obiektów sondowanej komendy. */
function probeFizzled(clone, eventsBefore, relevantIds) {
  if (relevantIds.size === 0) return false;
  for (const e of clone.events.slice(eventsBefore)) {
    if (e?.fizzled !== true) continue;
    for (const key of ['fromId', 'objectId', 'sourceId', 'stackId']) {
      if (e[key] != null && relevantIds.has(e[key])) return true;
    }
  }
  return false;
}

/**
 * Sonda skutku komendy: wykonuje ją na klonie stanu z pasywnym przeciwnikiem
 * i dogrywa jej obiekty do zejścia ze stosu (bez żadnych decyzji graczy —
 * okna bez passu oznaczają blokujący wybór, czyli realny skutek).
 *
 * Zwraca opis różnic w kategoriach czytelnych dla detektora:
 *   ok            — komenda znaleziona i wykonana na klonie,
 *   changed       — fingerprint stanu przed != po,
 *   effectDiffs   — ścieżki różnic POZA kosztami (turn/priorytet, tapnięcia,
 *                   życie); puste + sam koszt = podejrzenie no-opu,
 *   ownLandTaps/ownOtherTaps/opponentTaps/ownUntaps/opponentUntaps — kierunki
 *                   zmian `tapped` z podziałem na strony i typy,
 *   humanLifeDelta — zmiana życia gracza sondy (ujemna = strata),
 *   fizzle        — obiekt komendy fizzlował przy pasywnym przeciwniku
 *                   (U8: cel poświęcony jako własny koszt),
 *   costSignature — jakiego rodzaju koszt ma komenda.
 */
export function probeCommandEffect(state, cmd, { maxCommands = MAX_PROBE_COMMANDS } = {}) {
  const beforeFp = stateFingerprint(state);
  const before = JSON.parse(beforeFp);
  const eventsBefore = state.events.length;
  const playerId = cmd?.playerId;
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  const clone = cloneState(state);

  let exec;
  try {
    exec = execute(clone, cmd);
  } catch {
    return {
      ok: false, reason: 'execute_throw', changed: false, effectDiffs: [],
      ownLandTaps: 0, ownOtherTaps: 0, opponentTaps: 0,
      ownUntaps: 0, opponentUntaps: 0, humanLifeDelta: 0,
      fizzle: false, costSignature: costSignatureOf(state, cmd), steps: 0,
    };
  }
  if (!exec.ok) {
    return {
      ok: false, reason: 'rejected', changed: false, effectDiffs: [],
      ownLandTaps: 0, ownOtherTaps: 0, opponentTaps: 0,
      ownUntaps: 0, opponentUntaps: 0, humanLifeDelta: 0,
      fizzle: false, costSignature: costSignatureOf(state, cmd), steps: 0,
    };
  }

  // Obiekty, które komenda położyła na stosie — symulacja kończy się, gdy
  // wszystkie zejdą (rozstrzygnięcie komendy się domknęło).
  const stackBefore = new Set(state.zones.stack);
  const probedStackIds = new Set(clone.zones.stack.filter((id) => !stackBefore.has(id)));
  const relevantIds = new Set(probedStackIds);
  if (cmd.objectId) relevantIds.add(cmd.objectId);

  let steps = 0;
  while (clone.status === 'active' && steps < maxCommands) {
    if (steps > 0 && clone.zones.stack.every((id) => !probedStackIds.has(id))) break;
    const pid = clone.turn.priorityPlayerId;
    let view;
    try {
      view = playerView(clone, pid);
    } catch {
      break;
    }
    const choice = view.legalCommands.find((c) => c.type === 'pass_priority') ?? null;
    if (!choice) break;
    try {
      if (!execute(clone, choice).ok) break;
    } catch {
      break;
    }
    steps += 1;
  }

  const afterFp = stateFingerprint(clone);
  const after = JSON.parse(afterFp);
  const paths = diffFingerprintPaths(beforeFp, afterFp);
  // Obrona w głąb: jeśli po symulacji gra czeka na DECYZJĘ (brak passu w
  // oknie priorytetu), komenda wywołała skutek — wybór — nawet gdyby jego
  // pola nie było jeszcze w fingerprint (lista PENDING_DECISION_FIELDS).
  let blockedByChoice = false;
  if (clone.status === 'active') {
    try {
      const view = playerView(clone, clone.turn.priorityPlayerId);
      blockedByChoice = !view.legalCommands.some((c) => c.type === 'pass_priority');
    } catch {
      blockedByChoice = true;
    }
  }
  const manaOf = (players, index) => JSON.stringify([players[index]?.mana ?? null, players[index]?.manaPool ?? null]);
  const manaChanged = playerIndex >= 0 && manaOf(before.players, playerIndex) !== manaOf(after.players, playerIndex);

  let ownLandTaps = 0;
  let ownOtherTaps = 0;
  let opponentTaps = 0;
  let ownUntaps = 0;
  let opponentUntaps = 0;
  let humanLifeDelta = 0;
  const effectDiffs = [];
  for (const path of paths) {
    // fingerprint trzyma obiekty w TABLICY posortowanej po id — ścieżki
    // wyglądają jak `objects[3].tapped` (indeks w tablicy, nie id obiektu).
    const tapMatch = path.match(/^objects\[(\d+)\]\.tapped$/);
    if (tapMatch) {
      const beforeObj = before.objects?.[Number(tapMatch[1])];
      const afterObj = after.objects?.[Number(tapMatch[1])];
      const own = beforeObj?.controllerId === playerId;
      const isLand = (beforeObj?.types ?? []).some((t) => String(t).toLowerCase() === 'land');
      if (afterObj?.tapped === true && beforeObj?.tapped !== true) {
        if (own && isLand) ownLandTaps += 1;
        else if (own) ownOtherTaps += 1;
        else opponentTaps += 1;
      } else if (afterObj?.tapped === false && beforeObj?.tapped === true) {
        if (own) ownUntaps += 1;
        else opponentUntaps += 1;
      }
      continue;
    }
    const lifeMatch = path.match(/^players\[(\d+)\]\.life$/);
    if (lifeMatch) {
      if (Number(lifeMatch[1]) === playerIndex) {
        humanLifeDelta = (after.players[playerIndex]?.life ?? 0) - (before.players[playerIndex]?.life ?? 0);
        continue; // życie GRACZA sondy: koszt albo skutek — osobny licznik
      }
      // Życie PRZECIWNIKA to zawsze skutek (obrażenia, drenaż) — nie koszt.
      effectDiffs.push(path);
      continue;
    }
    // Pula many (player.mana / player.manaPool) to KOSZT lub produkcja —
    // nigdy „skutek" oferty w rozumieniu tego detektora.
    if (/^players\[\d+\]\.(mana|manaPool)/.test(path)) continue;
    if (/^turn\./.test(path)) continue; // priorytet/fazy to nie skutek oferty
    effectDiffs.push(path);
  }

  return {
    ok: true,
    changed: beforeFp !== afterFp,
    effectDiffs: effectDiffs.slice(0, 24),
    ownLandTaps,
    ownOtherTaps,
    opponentTaps,
    ownUntaps,
    opponentUntaps,
    humanLifeDelta,
    manaChanged,
    blockedByChoice,
    fizzle: probeFizzled(clone, eventsBefore, relevantIds),
    costSignature: costSignatureOf(state, cmd),
    steps,
  };
}
