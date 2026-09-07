import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, castPermanent } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { manifestCardFaceDown } from '../src/engine/effects.js';
import { turnFaceUp, wardAmountOf } from '../src/engine/permanents.js';
import {
  createSession, HUMAN_ID, BOT_ID, faceDownLabel, FACE_DOWN_CAUSE_LABELS,
} from '../src/table/session.js';

/**
 * M333 (audyt PR #102, rodzina F6 — F6c): PRZYCZYNA zakrycia musi być jawna dla
 * WSZYSTKICH mechanik, nie tylko cloaka.
 *
 * Stan przed naprawą: pole `faceDownCause` nosił wyłącznie cloak (M326), a
 * `faceDownCauseTag`/`faceDownLabel` wyglądały tak:
 *
 *     object?.faceDownCause === 'cloak' ? „Cloak N\" : FACE_DOWN_LABEL   // „Morph\"
 *
 * Czyli zmanifestowany 2/2 (CR 701.40a) i megamorph (702.37b) dalej były
 * podpisywane „Morph\" — to dokładnie to samo kłamstwo co F6, tylko o jeden
 * mechanizm dalej. Ruling WotC 2024-02-02 (Veiled Ascension) wymaga, żeby
 * face-down permanenty były łatwo rozróżnialne, w szczególności PO PRZYCZYNIE
 * zakrycia (disguise / cloak / manifest / morph). Naprawa idzie przez TE SAME
 * punkty co M326/M331: silnik zapisuje przyczynę przy tworzeniu zakrycia
 * (manifest, rzut twarzą w dół przez morph), a stół ma z tego JEDNĄ tabelę.
 *
 * Megamorph dostaje przyczynę 'morph', bo CR 702.37b definiuje go jako WARIANT
 * morpha (ten sam kształt 2/2 i ten sam {3}; różni się obrotem: licznik +1/+1)
 * — nie ma więc osobnej etykiety do pokazania.
 *
 * Asercje idą po faktach silnika i po prawdziwych widokach (L137), nie po
 * ręcznie sklejachanych obiektach.
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 333, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null, ...extra,
  });
  return state.objects.get(id);
}

/** Ręka pełna Manifest Dread, biblioteka: stwór na wierzchu, instant pod spodem. */
function manifestState() {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  put(state, 'md', 'manifest-dread', 'p1', 'hand');
  put(state, 'creat', 'razorfoot-griffin', 'p1', 'library');
  put(state, 'noncreat', 'shock', 'p1', 'library');
  state.zones.library = ['creat', 'noncreat'];
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'md');
  assert.ok(cast, 'Manifest Dread można rzucić');
  assert.ok(execute(state, cast).ok, 'rzut Manifest Dread');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const r = execute(state, { type: 'resolve_manifest_dread', playerId: 'p1', cardId: 'creat' });
  assert.ok(r.ok, `resolve manifest odrzucone: ${r.events?.[0]?.reason}`);
  const faceDown = [...state.objects.values()].find((o) => o.faceDown && o.zone === 'battlefield');
  assert.ok(faceDown, 'zmanifestowany permanent na polu bitwy');
  return { state, faceDown };
}

test('M333/A: manifest zapisuje przyczynę zakrycia w stanie i w WIDOKU obu graczy', () => {
  const { state, faceDown } = manifestState();
  assert.equal(faceDown.faceDownCause, 'manifest', 'silnik: przyczyną jest manifest');
  for (const viewer of ['p1', 'p2']) {
    const entry = playerView(state, viewer).zones.battlefield.find((o) => o.id === faceDown.id);
    assert.equal(entry.faceDownCause, 'manifest', `widok ${viewer} niesie przyczynę`);
  }
  // Tożsamość karty NADAL ukryta przed przeciwnikiem (CR 708.2a) — jawna jest
  // wyłącznie mechanika. Bez tego sprawdzenia naprawa etykiety mogłaby się
  // okazać wyciekiem (F6 w audycie #102 rozstrzygnął to na „nie\" — M258).
  const enemy = playerView(state, 'p2').zones.battlefield.find((o) => o.id === faceDown.id);
  assert.equal(enemy.cardId ?? null, null, 'przeciwnik nie widzi cardId zakrycia');
});

test('M333/B: etykiety idą przez tabelę przyczyn — własny „(Manifest)\", cudzy bez nazwy', () => {
  const { state, faceDown } = manifestState();
  const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? cardId;
  const own = faceDownLabel(faceDown, nameOf);
  assert.match(own, /Manifest/, `własny manifest mówi, co go zakryło: ${own}`);
  assert.doesNotMatch(own, /Morph|Cloak/, `znacznik nie przypisuje innej mechaniki: ${own}`);
  // Przeciwnik (FoW): tylko nazwa mechaniki, bez nazwy karty.
  const foe = faceDownLabel({ ...faceDown, cardId: null }, () => null);
  assert.equal(foe, 'Manifest', `cudzy manifest: ${foe}`);
  const view = playerView(state, 'p2').zones.battlefield.find((o) => o.id === faceDown.id);
  assert.equal(view.faceDown, true, 'widok potwierdza zakrycie');
});

test('M333/C: log stołu nazywa manifest po przyczynie (nameOfObject, obie bramy)', () => {
  const deck = [...Array.from({ length: 20 }, () => 'basic-forest')];
  const session = createSession({
    seed: 3333, registry: REGISTRY,
    decks: new Map([[HUMAN_ID, deck], [BOT_ID, deck]]),
  });
  const state = session.state;
  const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === HUMAN_ID);
  assert.ok(topId, 'karta na wierzchu biblioteki człowieka');
  const newId = manifestCardFaceDown(state, topId, HUMAN_ID);
  assert.ok(newId, 'manifest utworzył permanent');
  const label = session.nameOfObject(newId);
  assert.match(label, /\(Manifest\)$|Manifest/, `log: ${label}`);
  assert.doesNotMatch(label, /Morph/, `log nie mówi „Morph\" o manifeście: ${label}`);
  const observed = session.nameOfObject(newId, { fogOfWar: true });
  assert.equal(observed, 'Manifest', `obserwator dla AI: ${observed}`);
});

test('M333/D: obrót twarzą do góry zdejmuje przyczynę — w obu procedurach (manifest i morph)', () => {
  // (1) manifest: specjalna akcja `turn_manifest_face_up` (CR 701.40b)
  const m = manifestState();
  const flip = playerView(m.state, 'p1').legalCommands.find(
    (c) => c.type === 'turn_manifest_face_up' && c.objectId === m.faceDown.id,
  );
  assert.ok(flip, 'obrót zmanifestowanej karty STWORA jest oferowany');
  assert.ok(execute(m.state, flip).ok, 'obrót przyjęty');
  const after = m.state.objects.get(m.faceDown.id);
  assert.equal(after.faceDown, false, 'permanent jest face-up');
  assert.ok(after.faceDownCause == null, `przyczyna zdjęta: ${after.faceDownCause}`);
  assert.ok(!('faceDownCause' in (playerView(m.state, 'p1').zones.battlefield.find((o) => o.id === after.id) ?? {})),
    'widok face-up nie niesie już przyczyny');

  // (2) morph: rzut twarzą w dół i obrót zdolnością (CR 702.37c/702.37e) —
  // drugi punkt wejścia do odsłonięcia; sprzątanie mieszka w punkcie zbierającym
  // `turnFaceUp` (M322/F9), więc obie ścieżki muszą zostawić TEN SAM stan pól.
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  const flock = put(state, 'flock', 'monastery-flock', 'p1', 'hand');
  assert.ok(flock.morph, 'Monastery Flock ma morph (deskryptor, nie nazwa)');
  castPermanent(state, 'p1', 'flock', { faceDown: true });
  // castPermanent kładzie NA STOSIE nowy obiekt (stare id ręki znika) —
  // przyczynę sprawdzamy najpierw na czarze, potem na permanencie.
  const stacked = state.objects.get(state.zones.stack[state.zones.stack.length - 1]);
  assert.equal(stacked.faceDown, true, 'na stosie leży face-down czar');
  assert.equal(stacked.faceDownCause, 'morph', 'rzut twarzą w dół zapisuje przyczynę');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const permanent = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(permanent, 'morph wszedł twarzą w dół');
  assert.equal(permanent.faceDownCause, 'morph', 'przyczyna przeżyła przejście stos → permanent');
  const activate = playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'activate_ability' && c.objectId === permanent.id,
  );
  assert.ok(activate, 'obrót morpha oferowany jako zdolność');
  assert.ok(execute(state, activate).ok, 'obrót przyjęty');
  const faceUp = state.objects.get(permanent.id);
  assert.equal(faceUp.faceDown, false, 'morph jest face-up');
  assert.ok(faceUp.faceDownCause == null, `przyczyna zdjęta: ${faceUp.faceDownCause}`);
});

test('M333/E: rodzina przyczyny — punkty tworzące, punkty czyszczące i jedna tabela etykiet', () => {
  const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
  // (1) KAŻDY punkt tworzący zakryty permanent na polu bitwy podaje przyczynę.
  // Ciało funkcji = wycinek od nagłówka do następnego `export ` — bez liczenia
  // znaków w oknie (komentarze regulaminowe rosną i taki limit fałszywie czerwienieje).
  function body(file, anchor) {
    const text = src(file);
    const from = text.indexOf(anchor);
    assert.notEqual(from, -1, `brak kotwicy ${anchor} w ${file}`);
    const rest = text.slice(from + anchor.length);
    const next = rest.search(/^export (function|const) /m);
    return next === -1 ? rest : rest.slice(0, next);
  }
  const sites = [
    ['src/engine/effects.js', 'export function manifestCardFaceDown', "faceDownCause: 'manifest'", 'manifest'],
    ['src/engine/effects.js', "if (effect.type === 'cloak') {", "faceDownCause: 'cloak'", 'cloak'],
    ['src/engine/resources.js', 'export function castPermanent', "patch.faceDownCause = object.morph ? 'morph'", 'morph (rzut twarzą w dół)'],
  ];
  for (const [file, anchor, needle, name] of sites) {
    assert.ok(body(file, anchor).includes(needle),
      `punkt tworzący zakrycie „${name}\" musi pisać przyczynę (${file} → ${needle})`);
  }
  // (2) Punkt zbierający zdejmujący zakrycie czyści przyczynę (permanents.turnFaceUp)
  // — oba wejścia do odsłonięcia (701.40b, 702.37e) idą przez niego (M322/F9).
  assert.ok(body('src/engine/permanents.js', 'export function turnFaceUp').includes('faceDownCause: null'),
    'turnFaceUp musi zdejmować przyczynę — inaczej face-up permanent zostaje z „(Manifest)\"');
  // (3) Widoki: stół (battlefield) i stos. Bez tego panel „Stos\" i log
  // wracają do stałej etykiety (szósty konsument z L137).
  assert.match(src('src/engine/game-state.js'), /if \(object\.faceDownCause\) entry\.faceDownCause = object\.faceDownCause;/,
    'playerView pola bitwy exportuje przyczynę');
  assert.match(src('src/engine/game-state.js'), /\.\.\.\(object\.faceDownCause \? \{ faceDownCause: object\.faceDownCause \} : \{\}\)/,
    'playerView stosu exportuje przyczynę (panel „Stos\")');
  // (4) Żaden konsument nie podkłada „Morph\" pod nieobecność znacznika —
  // M260/B1 zostawia null dla zakrytego wygnania celowo.
  const render = src('src/table/render.js');
  assert.doesNotMatch(render, /morphBadge \?\? FACE_DOWN_LABEL/,
    'render nie może uzupełniać etykiety po znaku braku (M260/B1 — zakryte wygnanie to nie morph)');
  // (5) Tabela przyczyn = wyliczenie z routingu WotC (disguise/cloak/manifest/morph).
  assert.deepEqual(Object.keys(FACE_DOWN_CAUSE_LABELS).sort(), ['cloak', 'disguise', 'manifest', 'morph'],
    'tabela znaczników obejmuje dokładnie cztery mechaniki zakrywania');
  assert.equal(FACE_DOWN_CAUSE_LABELS.morph, 'Morph', 'morph zachował dzisiejszą pisownię (M127) — zero zmian dla istniejących partii');
});

test('M333/F: pod zakryciem nie ma drukowanego warda — morph i manifest (CR 708.2a)', () => {
  // `wardAmountOf` w gałęzi face-down czyta wprost `object.ward != null`
  // (permanents.js), więc dopóki punkty tworzące zakrycie nie zerowały pola,
  // zmanifestowany/zblokowany wardem stwór miał ward pod zakryciem — a
  // face-down permanent nie ma zdolności (CR 708.2a); ward {2} ma CLOAK, bo
  // to definicja zakrycia z 701.56a. Dziś w katalogu nie ma karty z drukowanym
  // wardem (zmierzone w audycie PR #102: 0 definicji), więc test buduje stan
  // ręcznie — to celowo SYNTETYCZNY obiekt, a nie nowa karta (ADR 0029).
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  const withWard = (id, cardId, zone) => {
    put(state, id, cardId, 'p1', zone);
    const patched = Object.freeze({ ...state.objects.get(id), ward: 3, keywords: [...(state.objects.get(id).keywords ?? []), 'ward'] });
    state.objects.set(id, patched);
    return patched;
  };

  // (1) manifest: ward chowany do migawki, wraca przy obrocie.
  withWard('wardy', 'razorfoot-griffin', 'library');
  assert.equal(wardAmountOf(state.objects.get('wardy'), state), 3, 'na wierzchu biblioteki ward widać');
  const newId = manifestCardFaceDown(state, 'wardy', 'p1');
  const manifested = state.objects.get(newId);
  assert.equal(manifested.faceDownCause, 'manifest', 'manifest zapisuje przyczynę');
  assert.equal(wardAmountOf(manifested, state), null, 'pod zakryciem NIE MA warda (CR 708.2a)');
  assert.equal(manifested.faceDownOriginal.ward, 3, 'drukowany ward czeka w migawce');
  const flipped = turnFaceUp(state, newId);
  assert.equal(wardAmountOf(flipped, state), 3, 'obrót przywraca drukowany ward (701.40b)');
  assert.ok(flipped.faceDownCause == null, 'obrót zdejmuje przyczynę (ten sam punkt zbierający)');

  // (2) morph: to samo przy rzucie twarzą w dół (702.37c) i obrocie (702.37e).
  const state2 = game('p1', 'main');
  addMana(state2, 'p1', 10);
  put(state2, 'morphward', 'monastery-flock', 'p1', 'hand');
  state2.objects.set('morphward', Object.freeze({
    ...state2.objects.get('morphward'), ward: 4, keywords: [...(state2.objects.get('morphward').keywords ?? []), 'ward'],
  }));
  castPermanent(state2, 'p1', 'morphward', { faceDown: true });
  const spell = state2.objects.get(state2.zones.stack[state2.zones.stack.length - 1]);
  assert.equal(wardAmountOf(spell, state2), null, 'face-down czar nie ma warda');
  assert.equal(spell.faceDownOriginal.ward, 4, 'ward czeka w migawce morpha');
  // Czar musi się rozstrzygnąć (dwa pasy priorytetu) — przed tym na stole nie
  // ma jeszcze permanentu, a zakrycie jest na stosie (CR 708.2).
  execute(state2, { type: 'pass_priority', playerId: 'p1' });
  execute(state2, { type: 'pass_priority', playerId: 'p2' });
  const permanent = [...state2.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.equal(wardAmountOf(permanent, state2), null, 'permanent po wejściu nadal bez warda');
  const flip = playerView(state2, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === permanent.id);
  assert.ok(execute(state2, flip).ok, 'obrót morpha przyjęty');
  assert.equal(wardAmountOf(state2.objects.get(permanent.id), state2), 4, 'obrót morpha przywraca ward');
});
