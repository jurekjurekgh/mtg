// PMSSB-41 (2026-10-03b) — cztery uwagi właściciela z testów gry:
//   A `weftblade-enhancer` (warp bez celu i bez porównania z rzutem normalnym),
//   B `nanoform-sentinel` (trigger untapa celował w permanent PRZECIWNIKA),
//   C `wedgelight-rammer` (Station tapował słabsze stwory PRZED mocniejszymi),
//   D `xu-ifit-osteoharmonist` (brak badge'ów po reanimacji: „Skeleton", „bez zdolności").
// Plan: `docs/plans/PLAN_2026-10-03b-pmssb41-uwagi-testow.md`.
//
// POMIAR PRZED (`/tmp/pr/probe-uwagi.mjs`, `probe-uwagi2.mjs`):
//   A: warp = 66 identycznie bez stworów i z flierem (brak wymiaru celu), wybierany przy
//      3 lądach bez żadnego stworu na stole;
//   B: oferta triggera `friendly=false` dla wszystkich celów → wybór `foeLand` (58)
//      nad własnym stworem (−29);
//   C: obie oferty (`tapOtherCreatureId` 2/2 i 4/4) miały IDENTYCZNĄ notę 9 → wygrywała
//      pierwsza z enumeracji (2/2), więc charge 6 → 8 → 12 zamiast 6 → 10;
//   D: PlayerView niósł `abilitiesStripped` i podtypy, ale nakładka kafla miała 0 badge'ów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { cardInfo, buildStateOverlay } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function game(main = 'main1') {
  const s = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, main, 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.turn.number = 6;
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 20; i += 1) put(s, `lib-${p}-${i}`, 'basic-plains', p, 'library');
  }
  return s;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const objectOnBoardId = (state, id) => state.objects.get(id)?.controllerId ?? null;

const lands = (s, n) => { for (let i = 0; i < n; i += 1) put(s, `L${i}`, 'basic-plains', 'p1', 'battlefield', { kind: 'land' }); };

/** Decyzja bota: wybrana komenda + mapa etykieta → wynik (ślad). */
function decyzja(s, params) {
  const bot = createHeuristicBot({ seed: 5, params });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const wynik = (s, label, params) => {
  const { scores } = decyzja(s, params);
  assert.ok(label in scores, `oferta „${label}” istnieje (są: ${Object.keys(scores).join(' | ')})`);
  return scores[label];
};

// ── A. Weftblade Enhancer — warp tylko z godnym celem i bez rzutu normalnego ──
function scenaWarp({ n = 3, hosts = [], foe = null } = {}) {
  const s = game();
  lands(s, n);
  put(s, 'h0', 'weftblade-enhancer');
  hosts.forEach(([id, card, patch]) => put(s, id, card, 'p1', 'battlefield', { ...READY, ...(patch ?? {}) }));
  if (foe) put(s, 'b', foe, 'p2', 'battlefield', READY);
  return s;
}

test('A1: mam manę na rzut normalny → wybieram rzut, nie warp (karta zostaje na stole)', () => {
  const s = scenaWarp({ n: 6, hosts: [['h1', 'hill-giant']] });
  const { cmd } = decyzja(s);
  assert.equal(cmd.type, 'cast_permanent');
  assert.ok(wynik(s, 'warp_card') < wynik(s, 'cast_permanent(h0)'), 'warp przegrywa z rzutem normalnym');
});

test('A2: tylko warp osiągalny i BRAK moich stworów → bot NIE rzuca (warp pod passem)', () => {
  const s = scenaWarp({ n: 3 });
  const { cmd } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority', 'bez celu dla licznika warp to strata karty');
  assert.ok(wynik(s, 'warp_card') < 0, 'warp schodzi pod pass');
});

test('A3: tylko warp osiągalny + stwór wart wzmocnienia (3/3) → warp wybrany', () => {
  const s = scenaWarp({ n: 3, hosts: [['h1', 'hill-giant']] });
  const { cmd } = decyzja(s);
  assert.equal(cmd.type, 'warp_card');
  assert.ok(wynik(s, 'warp_card') > 0);
});

test('A4: jedyny cel to token 2/2 → warp NIE jest wybierany (token nie jest wart oddania karty)', () => {
  const s = scenaWarp({ n: 3, hosts: [['t1', 'token_robot']] });
  assert.equal(decyzja(s).cmd.type, 'pass_priority');
  assert.ok(wynik(s, 'warp_card') < 0);
});

test('A5: dwa godne stwory → payoff rośnie („up to two” liczy oba liczniki)', () => {
  const jeden = scenaWarp({ n: 3, hosts: [['h1', 'hill-giant']] });
  const dwa = scenaWarp({ n: 3, hosts: [['h1', 'hill-giant'], ['h2', 'hill-giant']] });
  assert.ok(wynik(dwa, 'warp_card') > wynik(jeden, 'warp_card'));
});

test('A6: flier przy blokerze dostaje premie ewazji (gospodarz „z flying”) → warp wybrany', () => {
  const s = scenaWarp({ n: 3, hosts: [['h1', 'jeskai-windscout']], foe: 'hill-giant' });
  assert.equal(decyzja(s).cmd.type, 'warp_card');
});

test('A7 (M429): pokrętło `warpFutileEtbPenalty` ×0 zdejmuje karę za bezcelowy warp (sama bramka zostaje)', () => {
  const s = scenaWarp({ n: 3 });
  const zKara = wynik(s, 'warp_card');
  const bezKary = wynik(s, 'warp_card', { warpFutileEtbPenalty: 0 });
  assert.ok(bezKary > zKara, 'kara realnie działa');
  assert.equal(bezKary, zKara + 90);
});

test('A8 (M429): pokrętło `warpRedundantPenalty` ×0 przywraca dawną dominację warpa nad rzutem', () => {
  const s = scenaWarp({ n: 6, hosts: [['h1', 'hill-giant']] });
  const zKara = wynik(s, 'warp_card');
  const bezKary = wynik(s, 'warp_card', { warpRedundantPenalty: 0 });
  assert.equal(bezKary - zKara, 60);
  assert.ok(bezKary > wynik(s, 'cast_permanent(h0)', { warpRedundantPenalty: 0 }),
    'bez kary warp wygrywałby z rzutem normalnym — to jest wymiar, który zgłosił właściciel');
});

test('A9 (runda 2, zgłoszenie właściciela): LANDWALK to ewazja — 2/2 forestwalk u obrońcy z Lasem jest wart wzmocnienia', () => {
  // PRZED (pomiar /tmp/pr/probe-landwalk.mjs): widok NIE niósł `landwalk`,
  // więc `farbog-explorer` (swampwalk) i `emerald-oryx` (forestwalk) byli dla
  // bota gołym 2/3 — gospodarz nie przechodził progu i warp schodził pod pass
  // MIMO że ataku nie da się zablokować (CR 702.14).
  const s = scenaWarp({ n: 3, hosts: [['h1', 'emerald-oryx', { power: 2, toughness: 2 }]], foe: 'hill-giant' });
  put(s, 'las', 'basic-forest', 'p2', 'battlefield', { kind: 'land' });
  assert.equal(decyzja(s).cmd.type, 'warp_card', 'forestwalk z Lasem obrońcy = gospodarz wart wzmocnienia');
  assert.ok(wynik(s, 'warp_card') > 0);
});

test('A10 (kontrola CR 702.14): bez lądu obrońcy landwalk NIE ucieka — 2/2 bez ewazji nie przechodzi progu', () => {
  const s = scenaWarp({ n: 3, hosts: [['h1', 'emerald-oryx', { power: 2, toughness: 2 }]], foe: 'hill-giant' });
  assert.equal(decyzja(s).cmd.type, 'pass_priority', 'forestwalk bez Lasu obrońcy to zwykłe 2/2');
  assert.ok(wynik(s, 'warp_card') < 0);
});

test('A12: zdolności ewazji rozstrzygają NIEZALEŻNIE — flying+menace ucieka jednemu blokerowi z flying', () => {
  // PRZED: gałąź `flying` kończyła się `return false`, gdy bloker miał flying —
  // menace na TYM SAMYM stworze nie był sprawdzany (CR: „nie może być
  // blokowany” to suma warunków, nie alternatywa pierwszego słowa kluczowego).
  // Wycena liczona ścieżką CZARU (dragonscale-boon), bo próg bramki warp
  // (20) maskuje różnicę przy małym ciele: bez blokerów 104, z blokerem
  // nie-do-zatrzymania 111,5. PRZED: bloker z flying → 104 (menace pominięty).
  const scen = (bloker) => {
    const s = game();
    for (let i = 0; i < 4; i += 1) put(s, `F${i}`, 'basic-forest', 'p1', 'battlefield', { kind: 'land' });
    put(s, 'h0', 'dragonscale-boon');
    put(s, 'host', 'tackle-artist', 'p1', 'battlefield', { ...READY, power: 5, toughness: 5, keywords: ['flying', 'menace'] });
    if (bloker) put(s, 'blok', bloker, 'p2', 'battlefield', READY);
    return s;
  };
  const bez = wynik(scen(null), 'cast_spell(h0->host)');
  assert.equal(wynik(scen('jeskai-windscout'), 'cast_spell(h0->host)'), wynik(scen('hill-giant'), 'cast_spell(h0->host)'),
    'bloker z flying (2/1) i bloker naziemny (3/3) dają TĘ SAMĄ ewazję — menace przy jednym blokerze');
  assert.ok(wynik(scen('jeskai-windscout'), 'cast_spell(h0->host)') > bez,
    'gospodarz, którego nie da się zatrzymać, jest wart więcej niż ten sam gospodarz przy pustym stole');
});

test('A11: widok niesie landwalk jako deskryptor podtypu (ADR 0017/0002, bez nazwy karty)', () => {
  const s = scenaWarp({ n: 3, hosts: [['h1', 'emerald-oryx']] });
  const wpis = playerView(s, 'p1').zones.battlefield.find((o) => o.id === 'h1');
  assert.equal(wpis.landwalk, 'Forest');
});

// ── B. Nanoform Sentinel — trigger odkręca WŁASNY tapnięty permanent ─────────
function scenaNanoform() {
  const s = game();
  put(s, 'ns', 'nanoform-sentinel', 'p1', 'battlefield', READY);
  put(s, 'myCre', 'hill-giant', 'p1', 'battlefield', { ...READY, tapped: true });
  put(s, 'myLand', 'basic-plains', 'p1', 'battlefield', { kind: 'land', tapped: true });
  put(s, 'foeLand', 'basic-plains', 'p2', 'battlefield', { kind: 'land', tapped: true });
  put(s, 'foeCre', 'maritime-guard', 'p2', 'battlefield', { ...READY, tapped: true });
  // Atak Nanoformem = legalne tapnięcie własnego stwora (trigger self_becomes_tapped).
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.priorityPlayerId = 'p1';
  execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ns'] });
  for (let i = 0; i < 6 && s.turn.priorityPlayerId !== 'p1'; i += 1) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  return s;
}

test('B1 (silnik): trigger odkręcający cel jest PRZYJAZNY — oferta niesie `friendly: true`', () => {
  const oferty = playerView(scenaNanoform(), 'p1').legalCommands
    .filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(oferty.length >= 4, `oferty celów triggera (${oferty.length})`);
  assert.ok(oferty.every((c) => c.friendly === true),
    'odkręcenie to efekt przyjazny dla celu (dla każdego z 4 kandydatów)');
});

test('B2: bot wybiera WŁASNY TAPNIĘTY stwór, nie permanent przeciwnika', () => {
  const { cmd, scores } = decyzja(scenaNanoform());
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'myCre');
  assert.ok(scores['resolve_trigger_target(myCre)'] > scores['resolve_trigger_target(foeLand)']);
});

test('B3: cudzy permanent i własny LĄD to kara, nietapnięty stwór to 0 wartości (−4)', () => {
  const s = scenaNanoform();
  assert.equal(wynik(s, 'resolve_trigger_target(foeCre)'), -25);
  assert.equal(wynik(s, 'resolve_trigger_target(foeLand)'), -25);
  assert.equal(wynik(s, 'resolve_trigger_target(myLand)'), -4);
});

test('B4 (L41): ta sama miara w ścieżce CZARU — Dragonscale Boon woli własnego tapniętego stwora', () => {
  // Uwaga: High Stride/Savage Surge są „savage-like" (pump + untap) i mają
  // ŚWIADOMIE wycenę łączną w bloku pump — dlatego regresję mierzymy na
  // czarze, który odkręca bez pumpa (liczniki + untap).
  const s = game();
  // Dragonscale Boon jest zielony ({3}{G}) — lądy muszą dawać ZIELONĄ manę.
  for (let i = 0; i < 4; i += 1) put(s, `F${i}`, 'basic-forest', 'p1', 'battlefield', { kind: 'land' });
  put(s, 'h0', 'dragonscale-boon');
  put(s, 'myCre', 'hill-giant', 'p1', 'battlefield', { ...READY, tapped: true });
  put(s, 'foeCre', 'maritime-guard', 'p2', 'battlefield', { ...READY, tapped: true });
  assert.ok(wynik(s, 'cast_spell(h0->myCre)') > wynik(s, 'cast_spell(h0->foeCre)'));
});

test('B5 (L41): ta sama miara w ścieżce AKTYWACJI — Sylvanus Invoker woli własny tapnięty LĄD', () => {
  // Sylvanus' Invoker: {8}, „untap target land you control, animate 8/8" —
  // deskryptor ogranicza cel do WŁASNYCH lądów, więc pin mierzy samą miarę
  // (własny ląd −4 za odkręcanie vs cudzy −25), a nie wybór spośród stron.
  const s = game();
  lands(s, 8);
  put(s, 'si', 'silvanuss-invoker', 'p1', 'battlefield', READY);
  put(s, 'foeLand', 'basic-plains', 'p2', 'battlefield', { kind: 'land', tapped: true });
  const oferty = playerView(s, 'p1').legalCommands.filter((c) => c.type === 'activate_ability');
  assert.ok(oferty.length >= 1, `oferty aktywacji (${oferty.length})`);
  const naMoj = oferty.find((c) => objectOnBoardId(s, (c.targets ?? [])[0]) === 'p1');
  assert.ok(naMoj, 'oferta na własny ląd istnieje');
  assert.equal(wynik(s, `activate_ability(si#${naMoj.abilityIndex}->L0)`),
    wynik(s, `activate_ability(si#${naMoj.abilityIndex}->L1)`), 'własne lądy remisują (ta sama wartość)');
});

// ── C. Wedgelight Rammer — kolejność tapowania do Station ───────────────────
function scenaStation(charge, stwory) {
  const s = game('main2');
  put(s, 'wr', 'wedgelight-rammer', 'p1', 'battlefield', { counters: { charge } });
  for (const [id, card, patch] of stwory) put(s, id, card, 'p1', 'battlefield', { ...READY, ...(patch ?? {}) });
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', READY);
  return s;
}
const DWA = [['c2', 'maritime-guard', { power: 2, toughness: 2 }], ['c4', 'hill-giant']];

test('C1: charge 6 — bot tapuje stwora o mocy 4 (domyka próg 9), nie 2/2 (zgłoszenie właściciela)', () => {
  const { cmd } = decyzja(scenaStation(6, DWA));
  assert.equal(cmd.type, 'activate_ability');
  assert.equal(cmd.tapOtherCreatureId, 'c4', 'wybór mocniejszego stwora');
});

test('C2: mocniejszy stwór ma WYŻSZĄ notę od słabszego (oferty przestały remisować)', () => {
  const s = scenaStation(6, DWA);
  const mocny = wynik(s, 'activate_ability(wr#1+station:c4)');
  const slaby = wynik(s, 'activate_ability(wr#1+station:c2)');
  assert.ok(mocny > slaby, `c4=${mocny} vs c2=${slaby}`);
});

test('C3: charge 8 — domyka 2/2 (nadmiar 1), więc wybór pada na SŁABSZEGO (minimalny nadmiar)', () => {
  const { cmd } = decyzja(scenaStation(8, DWA));
  assert.equal(cmd.tapOtherCreatureId, 'c2');
});

test('C4: próg osiągnięty (charge 9) → bot passuje, nie pompuje dalej', () => {
  assert.equal(decyzja(scenaStation(9, DWA)).cmd.type, 'pass_priority');
});

test('C7: próg 9 przy charge 7 — moc 2 (nadmiar 0, domyka) bije moc 5 (nadmiar 3), mimo że mocniejszy jest pierwszy w enumeracji', () => {
  // Mutacje „progress bez clampu" i „bez kary za nadmiar" wypłaszczają obie
  // oferty do remisu, a remis rozstrzyga PIERWSZA z enumeracji — dlatego
  // mocniejszy stwór jest tu dodany jako pierwszy.
  const { cmd } = decyzja(scenaStation(7, [['c5', 'hill-giant', { power: 5, toughness: 5 }], ['c2', 'maritime-guard', { power: 2, toughness: 2 }]]));
  assert.equal(cmd.type, 'activate_ability');
  assert.equal(cmd.tapOtherCreatureId, 'c2', 'nadmiar 3 nie ma wartości — wygrywa domknięcie bez marnotrawstwa');
});

test('C8: premia za domknięcie progu — charge 5: moc 6 (nadmiar 2, DOMYKA próg) bije moc 2 (próg nadal otwarty)', () => {
  // Bez `stationCloseBonus` wygrywałby słabszy (mniejszy nadmiar), a artefakt
  // zostałby o 1 charge od progu — czyli stwór-typ dostajemy turę później.
  // charge 5 → do progu 4: moc 2 daje 2 (próg nadal otwarty), moc 6 daje 4
  // i domyka próg z nadmiarem 2. Mocniejszy jest dodany DRUGI, więc remis
  // (wariant bez premii) rozstrzygnąłby enumeracja na rzecz słabszego.
  const { cmd } = decyzja(scenaStation(5, [['c2', 'maritime-guard', { power: 2, toughness: 2 }], ['c6', 'hill-giant', { power: 6, toughness: 6 }]]));
  assert.equal(cmd.type, 'activate_ability');
  assert.equal(cmd.tapOtherCreatureId, 'c6');
});

test('C5 (M429): `stationCloseBonus` ×0 zostawia poprawkę KOLEJNOŚCI (mocniejszy nadal pierwszy)', () => {
  const s = scenaStation(6, DWA);
  const params = { stationCloseBonus: 0 };
  assert.ok(wynik(s, 'activate_ability(wr#1+station:c4)', params)
    > wynik(s, 'activate_ability(wr#1+station:c2)', params));
});

test('C6 (M153/A2): poza własną Główną 2 station nadal schodzi pod pass', () => {
  const s = scenaStation(6, DWA);
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  assert.ok(wynik(s, 'activate_ability(wr#1+station:c4)') < 0);
});

test('C9 (e2e, scenariusz właściciela): charge 6 + stwory 2/2 i 4/4 → po aktywacji 10 counterów, 2/2 NIETAPNIĘTY', () => {
  // Pełny tor silnika (nie tylko wycena): zgłoszenie „najpierw 2, potem 4 → 12
  // counterów; mógł odwrotnie i 2/2 w ogóle nie musiałby tapować".
  const s = scenaStation(6, [['c2', 'maritime-guard', { power: 2, toughness: 2 }], ['c4', 'hill-giant', { power: 4, toughness: 4 }]]);
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  assert.equal(cmd.type, 'activate_ability');
  assert.equal(cmd.tapOtherCreatureId, 'c4');
  execute(s, cmd);
  for (let i = 0; i < 10 && (s.zones.stack ?? []).length > 0; i += 1) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  const wr = s.objects.get('wr');
  assert.equal(wr.counters.charge, 10, '6 + 4 (moc tapniętego) — koniec, bez dobijania do 12');
  assert.ok((wr.types ?? []).includes('Creature'), 'próg 9 domknięty → artefakt jest stworzem');
  assert.equal(s.objects.get('c2').tapped, false, '2/2 został nietknięty (to była strata, którą zgłosił właściciel)');
  assert.equal(s.objects.get('c4').tapped, true, 'tapnięty został wyłącznie mocniejszy stwór');
});

// ── D. Xu-Ifit — badge'y przywróconego stwora ──────────────────────────────
function reanimuj() {
  const s = game();
  put(s, 'xu', 'xu-ifit-osteoharmonist', 'p1', 'battlefield', READY);
  put(s, 'g0', 'hill-giant', 'p1', 'graveyard');
  const akt = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'xu');
  execute(s, akt);
  for (let i = 0; i < 8 && s.zones.stack.length > 0; i += 1) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  return s;
}
const stubSession = (s) => ({
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: () => '',
  nameOrdinalSuffix: () => '',
  view: () => playerView(s, 'p1'),
  state: s,
});

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };
const badgeOf = (info) => {
  const el = new MiniEl('div');
  buildStateOverlay(el, info);
  return el.descendants()
    .filter((e) => String(e.className).split(' ').includes('ovl-badge'))
    .map((e) => e.textContent);
};

test('D1: PlayerView przywróconego stwora niesie utratę zdolności i migawkę podtypów', () => {
  const entry = playerView(reanimuj(), 'p1').zones.battlefield.find((o) => o.cardId === 'hill-giant');
  assert.equal(entry.abilitiesStripped, true);
  assert.deepEqual(entry.subtypesBeforeStrip, ['Giant']);
  assert.ok(entry.subtypes.includes('Skeleton'), 'Skeleton dodany (CR 613.1f)');
});

test('D2: kafel (cardInfo) nazywa dodany podtyp i utratę zdolności', () => {
  const s = reanimuj();
  const entry = playerView(s, 'p1').zones.battlefield.find((o) => o.cardId === 'hill-giant');
  const info = cardInfo(stubSession(s), entry);
  assert.equal(info.abilitiesStripped, true);
  assert.deepEqual(info.subtypesAdded, ['Skeleton']);
});

test('D3: nakładka kafla pokazuje badge „bez zdolności” i „typ: +Skeleton”', () => {
  const s = reanimuj();
  const entry = playerView(s, 'p1').zones.battlefield.find((o) => o.cardId === 'hill-giant');
  const badges = badgeOf(cardInfo(stubSession(s), entry));
  assert.ok(badges.includes('bez zdolności'), `badge utraty zdolności (${badges})`);
  assert.ok(badges.includes('typ: +Skeleton'), `badge dodanego podtypu (${badges})`);
});

test('D4 (kontrola): zwykły stwór nie dostaje żadnego z tych badge\'ów', () => {
  const s = game();
  const zwykly = put(s, 'g1', 'hill-giant', 'p1', 'battlefield', READY);
  const info = cardInfo(stubSession(s), playerView(s, 'p1').zones.battlefield.find((o) => o.id === zwykly.id));
  const badges = badgeOf(info);
  assert.ok(!badges.includes('bez zdolności'));
  assert.ok(!badges.some((b) => b.startsWith('typ: +')));
});
