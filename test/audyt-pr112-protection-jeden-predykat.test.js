// Audyt PR #112, znalezisko F2 (sesja arena/01a08d0e, 2026-09-10).
//
// Reguła „protection blokuje CELOWANIE" (CR 702.16b, DEBT: T — mtg.wiki:
// „Targeted by spells with the specified quality, or by abilities from sources
// of that quality") istniała w PIĘCIU ręcznych kopiach:
//   1. `validateTargets`      (spells.js)  — jakości + kolory,
//   2. `legalTargetCandidates`(spells.js)  — jakości + kolory,
//   3. `castFireball`         (spells.js)  — TYLKO kolory,
//   4. `legalFireballCasts`   (spells.js)  — TYLKO kolory,
//   5. `protectedBlocked`     (triggers.js)— jakości + kolory (nowa w PR #112).
// Dwie kopie Fireballa nie znały ochrony od JAKOŚCI — klasa L41/L107/L140:
// kopie tej samej reguły rozjeżdżają się cicho, a różnica wychodzi dopiero przy
// nowej karcie. Naprawa: jeden predykat `isTargetingBlockedByProtection`
// (attachments.js) używany przez wszystkie pięć miejsc.
//
// Ten plik ma dwie nogi (L5): (a) zachowanie przez REALNE ścieżki — oferta,
// walidacja, triggery, Fireball; (b) strażnik źródła — każda z pięciu funkcji
// woła predykat i żadna nie czyta ochrony samodzielnie (komentarze wycięte
// przed skanem).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isTargetingBlockedByProtection } from '../src/engine/attachments.js';
import { legalFireballCasts, legalTargetCandidates, validateTargets } from '../src/engine/spells.js';
import { triggerTargetCandidates } from '../src/engine/triggers.js';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Źródło syntetyczne (engine nie zna rejestru — ADR 0002). */
function putSource(state, id, controllerId, { colors = [], subtypes = [], kind = 'creature' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-source', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind, name: 'Źródło testowe', colors, types: ['Creature'],
    subtypes, power: 1, toughness: 1,
  });
  return state.objects.get(id);
}

// ---------------------------------------------------------------------------
// (a) Predykat: oba źródła ochrony, w obie strony
// ---------------------------------------------------------------------------

test('F2/1: predykat blokuje cel chroniony KOLOREM źródła i puszcza inny kolor', () => {
  const state = game();
  const target = putCard(state, 't', 'gloomfang-mauler', 'p2', 'battlefield', { protectionFromColors: ['R'] });
  const red = putSource(state, 'red', 'p1', { colors: ['R'] });
  const blue = putSource(state, 'blue', 'p1', { colors: ['U'] });
  assert.equal(isTargetingBlockedByProtection(state, target, red), true, 'czerwone źródło zablokowane');
  assert.equal(isTargetingBlockedByProtection(state, target, blue), false, 'niebieskie źródło legalne');
});

test('F2/2: predykat blokuje cel chroniony JAKOŚCIĄ źródła (anty-over-fix: inna jakość legalna)', () => {
  const state = game();
  const target = putCard(state, 't', 'gloomfang-mauler', 'p2');
  state.untilEndOfTurnProtections.push({ objectIds: ['t'], quality: { kind: 'creature', notSubtype: 'Human' } });
  const giant = putSource(state, 'giant', 'p1', { subtypes: ['Giant'] });
  const human = putSource(state, 'human', 'p1', { subtypes: ['Human'] });
  assert.equal(isTargetingBlockedByProtection(state, target, giant), true, 'non-Human creature zablokowane');
  assert.equal(isTargetingBlockedByProtection(state, target, human), false, 'Human legalny');
});

test('F2/3: `sourceColors` nadpisuje kolory obiektu (ścieżka walidacji rzutu)', () => {
  const state = game();
  const target = putCard(state, 't', 'gloomfang-mauler', 'p2', 'battlefield', { protectionFromColors: ['R'] });
  const bezbarwne = putSource(state, 'src', 'p1', { colors: [] });
  assert.equal(isTargetingBlockedByProtection(state, target, bezbarwne), false, 'bez podanych kolorów źródło bezbarwne');
  assert.equal(isTargetingBlockedByProtection(state, target, bezbarwne, { sourceColors: ['R'] }), true,
    'jawnie podane kolory źródła rozstrzygają');
});

// ---------------------------------------------------------------------------
// (b) Ta sama reguła w czterech ścieżkach produkcyjnych
// ---------------------------------------------------------------------------

test('F2/4: walidacja czaru, oferta celów i triggery odrzucają ten sam chroniony cel', () => {
  const state = game();
  const source = putCard(state, 'src', 'inferno-titan', 'p1'); // czerwony Giant
  putCard(state, 'ok', 'gloomfang-mauler', 'p2');
  putCard(state, 'prot', 'gloomfang-mauler', 'p2', 'battlefield', { protectionFromColors: ['R'] });

  // 1. walidacja (validateTargets) — rzuca
  assert.throws(
    () => validateTargets(state, [{ type: 'creature' }], ['prot'], 'p1', ['R'], source),
    /protection/, 'walidacja odrzuca chroniony cel',
  );
  assert.doesNotThrow(
    () => validateTargets(state, [{ type: 'creature' }], ['ok'], 'p1', ['R'], source),
    'zwykły cel przechodzi',
  );

  // 2. oferta (legalTargetCandidates)
  const offered = legalTargetCandidates(state, 'p1', { type: 'creature' }, source);
  assert.ok(offered.includes('ok'), 'zwykły cel oferowany');
  assert.ok(!offered.includes('prot'), 'chroniony cel nieoferowany (L48: oferta = walidacja)');

  // 3. triggery (triggerTargetCandidates)
  const triggered = triggerTargetCandidates(state, { type: 'creature' }, source, {});
  assert.ok(triggered.includes('ok'), 'trigger: zwykły cel');
  assert.ok(!triggered.includes('prot'), 'trigger: chroniony cel wykluczony');
});

test('F2/5: Fireball — oferta i walidacja czytają TEŻ ochronę od jakości (przed F2 znały tylko kolory)', () => {
  const state = game();
  const fb = putCard(state, 'fb', 'fireball', 'p1', 'hand');
  putCard(state, 'ok', 'gloomfang-mauler', 'p2');
  putCard(state, 'prot', 'gloomfang-mauler', 'p2');
  // „Protection from red" wyrażona JAKOŚCIĄ (grant do końca tury), nie polem
  // protectionFromColors — dokładnie ten przypadek gubiły kopie Fireballa.
  state.untilEndOfTurnProtections.push({ objectIds: ['prot'], quality: { colors: ['R'] } });
  addMana(state, 'p1', 10, { colors: ['R'] });

  const oferty = legalFireballCasts(state, 'p1', 'fb', fb, 10);
  assert.ok(oferty.length > 0, 'setup: Fireball ma jakieś warianty');
  for (const wariant of oferty) {
    assert.ok(!(wariant.targets ?? []).includes('prot'),
      `oferta Fireballa nie może proponować celu chronionego jakością (wariant X=${wariant.xValue})`);
  }
  // Walidacja wykonania (castFireball przez execute — realna ścieżka).
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['prot'], xValue: 2 });
  assert.equal(r.ok, false, 'walidacja odrzuca cel chroniony jakością');
  assert.match(String(r.events?.[0]?.reason ?? r.reason ?? ''), /protection|illegal/i,
    'powód odrzucenia mówi o ochronie');
});

test('F2/6 (anty-over-fix): jakość NIEpasująca do czaru nie blokuje Fireballa', () => {
  const state = game();
  const fb = putCard(state, 'fb', 'fireball', 'p1', 'hand');
  putCard(state, 'cel', 'gloomfang-mauler', 'p2');
  // „Protection from non-Human creatures" (Spare from Evil): Fireball jest
  // czarem, nie stworem — jakość nie pasuje, celowanie zostaje legalne.
  state.untilEndOfTurnProtections.push({ objectIds: ['cel'], quality: { kind: 'creature', notSubtype: 'Human' } });
  addMana(state, 'p1', 10, { colors: ['R'] });
  const oferty = legalFireballCasts(state, 'p1', 'fb', fb, 10);
  assert.ok(oferty.some((w) => (w.targets ?? []).includes('cel')),
    'Fireball może celować w stwora z ochroną od nie-Człowieka (czar nie jest stworem)');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['cel'], xValue: 2 }).ok,
    'walidacja przepuszcza ten cel');
});

// ---------------------------------------------------------------------------
// (c) Strażnik źródła — jedno miejsce prawdy (L5: konstrukt, nie tekst)
// ---------------------------------------------------------------------------

const SCIEZKI = [
  ['src/engine/spells.js', 'validateTargets'],
  ['src/engine/spells.js', 'legalTargetCandidates'],
  ['src/engine/spells.js', 'castFireball'],
  ['src/engine/spells.js', 'legalFireballCasts'],
  ['src/engine/triggers.js', 'triggerTargetCandidates'],
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Ciało funkcji (dopasowanie nawiasów) z wyciętymi komentarzami. */
function functionBody(file, name) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const match = new RegExp(`function ${name}\\b|(?:const|let) ${name} = `).exec(src);
  assert.ok(match, `funkcja ${name} istnieje w ${file}`);
  const start = match.index;
  // Nawias ciała, nie pierwszy `{` po nazwie — sygnatura bywa
  // `extra = {}`, więc naiwne indexOf('{') zwraca domyślny parametr.
  let open = src.indexOf('{', start);
  const paren = src.indexOf('(', start);
  if (paren >= 0 && paren < open) {
    let depthParen = 0;
    for (let i = paren; i < src.length; i += 1) {
      if (src[i] === '(') depthParen += 1;
      else if (src[i] === ')') {
        depthParen -= 1;
        if (depthParen === 0) { open = src.indexOf('{', i); break; }
      }
    }
  }
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`nie znaleziono końca funkcji ${name}`);
}

test('F2/7: każda ścieżka celowania woła wspólny predykat i nie czyta ochrony samodzielnie', () => {
  for (const [file, name] of SCIEZKI) {
    const body = functionBody(file, name);
    assert.ok(body.includes('isTargetingBlockedByProtection('),
      `${name} (${file}) musi wołać wspólny predykat — inaczej reguła znów jest kopiowana`);
    assert.ok(!body.includes('effectiveProtectionFromColors('),
      `${name} (${file}) nie może czytać ochrony od kolorów samodzielnie (kopia reguły)`);
    assert.ok(!body.includes('isProtectedFromSource('),
      `${name} (${file}) nie może czytać ochrony od jakości samodzielnie (kopia reguły)`);
  }
});
