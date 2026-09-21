// Sesja 2026-09-21, krok 3 — granica aura–host (CR 303.4f) domknięta pomiarem
// na żywo (Żywy Tester: decyzja „Zaczaruj: …" z 6 kandydatami i pełnym
// rozstrzygnięciem — `scratch/w/aura-batch/p106.txt`, seed 106).
//
//  G/1. Aura „Enchant player" (Curse of the Pierced Heart) ma gospodarza-
//       GRACZA: CR 303.4f mówi „a legal object OR PLAYER", a w pojedynku
//       kandydatami są obaj gracze. Pin mierzy predykaty (permanent milczy,
//       gracz przechodzi), pełną ścieżkę zwrotu z grobu (Annie Flash →
//       trigger → decyzja → wybór gracza), etykietę oferty („Zaczaruj:
//       Nieprzyjaciel") i zdarzenie logu. Kształt obiektu po wejściu jest
//       IDENTYCZNY z kształtem po rzucie z ręki (spells.js `resolveAuraSpell`:
//       `kind: 'enchantment'` + `enchantedPlayerId`, bez `attachedTo` — gracz
//       nie jest permanentem, więc SBA „aura bez gospodarza" (CR 704.5m) jej
//       nie dotyczy).
//  G/2. Granica „ile gospodarzy = decyzja": JEDEN legalny gospodarz domyka
//       wybór sam (L41 — wybór bez alternatywy nie jest decyzją), DOPIERO
//       drugi otwiera `pendingAuraHost`. Ta sama reguła, którą na żywo
//       pokazała partia p106 (kandydaci: 6, wybrano Kor Cartographer).
//  G/3. Walidacja wyboru gracza na ścieżce wykonania: obcy gospodarz i cudza
//       decyzja odrzucone, wybór samego decydenta legalny (Oracle nie zawęża
//       „enchant player" do przeciwnika), widok decydenta niesie oba zbiory
//       kandydatów.
//  G/4. Boty: wycena gracza-kandydata nie może wypaść jako „niewycenione",
//       a wroga klątwa nie może zaczarować samego bota (L41 — polaryzacja ta
//       sama, co dla gospodarzy-permanentów).
//
// Reguła wejścia aury z grobu żyje w JEDNYM miejscu (effects.js
// `returnPermanentFromGraveyardOutcome`, wzorzec L41) — dlatego pin mierzy
// zachowanie przez pełną ścieżkę: rzut Annie Flash (trigger ETB) → cel → wynik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { isLegalAuraHost, isLegalAuraPlayerHost, legalAuraHosts } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { commandLabel } from '../src/table/render.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 303, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const id of ['p1', 'p2']) for (let i = 0; i < 4; i += 1) put(state, `lib-${id}-${i}`, 'basic-swamp', id, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  return execute(s, cmd);
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const reasonOf = (result) => result.events.find((e) => e.type === 'command_rejected')?.reason;

/** Rzut Annie Flash + rozstrzygnięcie triggera (cel wskazuje `targetId`). */
function annieReturns(s, targetId, { extraCreatures = 0 } = {}) {
  for (let i = 0; i < extraCreatures; i += 1) put(s, `sw-${i}`, 'lightwalker', 'p1', 'battlefield');
  put(s, 'annie', 'annie-flash-the-veteran');
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  const cast = run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  assert.ok(cast.ok, 'Annie rzucona');
  const wskazuje = (c) => c.targetId === targetId || (c.targetIds ?? []).includes(targetId);
  for (let i = 0; i < 40 && s.zones.stack.length > 0 && !s.pendingAuraHost; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type === 'resolve_trigger_target' && wskazuje(c))
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    if (!pick) break;
    run(s, pick);
  }
  assert.equal(find(s, 'annie-flash-the-veteran', 'battlefield') != null, true, 'Annie na polu bitwy');
}

test('G/1: „Enchant player" wybiera GRACZA — predykaty, decyzja, etykieta, zdarzenie (CR 303.4f)', () => {
  const s = game();
  put(s, 'gy-curse', 'curse-of-the-pierced-heart', 'p1', 'graveyard'); // MV 2, „Enchant player"
  const curse = find(s, 'curse-of-the-pierced-heart', 'graveyard');
  assert.equal(curse.aura?.enchant, 'player', 'deskryptor karty dotarł do obiektu (enchant: player)');

  // Predykaty: permanent NIE jest gospodarzem klątwy, gracz JEST (i tylko
  // gracze z partii — obce id nie przechodzi).
  const annieDummy = { id: 'x', zone: 'battlefield', kind: 'creature', controllerId: 'p1', types: ['Creature'] };
  assert.equal(isLegalAuraHost(curse, annieDummy), false, 'stwór nie jest gospodarzem aury „Enchant player"');
  assert.equal(isLegalAuraPlayerHost(s, curse, 'p2'), true, 'drugi gracz JEST legalnym gospodarzem (CR 303.4f)');
  assert.equal(isLegalAuraPlayerHost(s, curse, 'nie-ma-takiego'), false, 'gracz spoza partii nie jest kandydatem');
  assert.deepEqual(
    legalAuraHosts(s, curse), { objectIds: [], playerIds: ['p1', 'p2'] },
    'jedno źródło kandydatów (permanenty + gracze)',
  );

  annieReturns(s, 'gy-curse');
  assert.ok(s.pendingAuraHost, 'dwóch kandydatów-graczy = decyzja czeka na gracza');
  assert.deepEqual(s.pendingAuraHost.candidateIds, [], 'brak kandydatów-permanentów');
  assert.deepEqual(s.pendingAuraHost.candidatePlayerIds, ['p1', 'p2'], 'kontrakt niesie kandydatów-graczy');

  const view = playerView(s, 'p1');
  assert.deepEqual(view.pendingAuraHost?.candidatePlayerIds, ['p1', 'p2'], 'widok decydenta niesie kandydatów-graczy');
  const oferta = view.legalCommands.filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferta.length, 2, 'oferta ma oba warianty (L48: oferta = walidacja)');
  assert.equal(commandLabel(oferta[0], {}, view), 'Zaczaruj: Ty', 'etykieta nazywa gracza (nie szuka obiektu)');
  assert.equal(commandLabel(oferta[1], {}, view), 'Zaczaruj: Nieprzyjaciel', '…także przeciwnika');

  const wybor = run(s, oferta.find((c) => c.auraHostId === 'p2'));
  assert.ok(wybor.ok, 'wybór przyjęty');
  assert.equal(s.pendingAuraHost ?? null, null, 'decyzja zamknięta');
  const weszla = find(s, 'curse-of-the-pierced-heart', 'battlefield');
  assert.ok(weszla, 'aura weszła na pole bitwy (nie zostaje w grobie)');
  assert.equal(weszla.kind, 'enchantment', 'kształt jak przy rzucie z ręki (spells.js: kind „enchantment")');
  assert.equal(weszla.enchantedPlayerId, 'p2', 'gospodarza czyta `enchantedPlayerId` (jedno źródło dla obu wejść)');
  assert.equal(weszla.attachedTo ?? null, null, 'gracz nie jest permanentem — brak `attachedTo`');
  assert.ok(
    s.events.some((e) => e.type === 'aura_attached_to_player' && e.playerId === 'p2' && e.cardId === 'curse-of-the-pierced-heart'),
    'zdarzenie nazywa zaczarowanego gracza (log: „…zaczarowuje: Nieprzyjaciel")',
  );
  assert.equal(s.events.filter((e) => e.type === 'aura_attached_to_player').length, 1, 'jedno zdarzenie załączenia');
  const nosi = [...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.attachedTo === weszla.id);
  assert.equal(nosi.length, 0, 'żaden permanent nie nosi klątwy');
});

test('G/2: jeden legalny gospodarz domyka wybór sam; decyzja otwiera się dopiero przy dwóch', () => {
  // Dokładnie jeden stwór na polu bitwy (Annie sama) → brak decyzji, aura wchodzi.
  const s1 = game();
  put(s1, 'gy-aegis', 'containment-membrane', 'p1', 'graveyard'); // „Enchant creature”, MV 3
  annieReturns(s1, 'gy-aegis');
  assert.equal(s1.pendingAuraHost ?? null, null, 'jeden kandydat = brak decyzji (L41)');
  const weszla = find(s1, 'containment-membrane', 'battlefield');
  assert.ok(weszla, 'aura weszła bez pytania gracza');
  const annie = find(s1, 'annie-flash-the-veteran', 'battlefield');
  assert.equal(weszla.attachedTo, annie.id, 'załączona do jedynego legalnego gospodarza');

  // Drugi stwór → ta sama aura i ten sam moment, ale wybór jest REALNY.
  const s2 = game();
  put(s2, 'gy-aegis', 'containment-membrane', 'p1', 'graveyard');
  annieReturns(s2, 'gy-aegis', { extraCreatures: 1 });
  assert.ok(s2.pendingAuraHost, 'dwóch kandydatów = decyzja czeka na gracza');
  const oferta = commands(s2).filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferta.length, 2, 'oferta ma oba warianty (L48: oferta = walidacja)');
  const wybor = run(s2, oferta[1]);
  assert.ok(wybor.ok, 'wybór przyjęty');
  assert.equal(find(s2, 'containment-membrane', 'battlefield').attachedTo, oferta[1].auraHostId, 'aura u wybranego gospodarza');
});

test('G/3: wybór gracza walidowany przy wykonaniu (CR 608.2b) — obcy id i cudza decyzja odrzucone', () => {
  const s = game();
  put(s, 'gy-curse', 'curse-of-the-pierced-heart', 'p1', 'graveyard');
  annieReturns(s, 'gy-curse');
  const oferta = commands(s).filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferta.length, 2, 'dwa warianty (obaj gracze)');

  const obcy = execute(s, { type: 'resolve_aura_host', playerId: 'p1', auraHostId: 'permanent-999' });
  assert.equal(obcy.ok, false, 'gospodarz spoza listy kandydatów odrzucony');
  assert.equal(reasonOf(obcy), 'illegal_aura_host', 'powód odrzucenia nazwany');
  assert.ok(s.pendingAuraHost, 'decyzja nadal otwarta po odrzuceniu');

  const nieDecydent = execute(s, { type: 'resolve_aura_host', playerId: 'p2', auraHostId: 'p2' });
  assert.equal(nieDecydent.ok, false, 'decyduje kontroler aury, nie dowolny gracz');
  assert.ok(s.pendingAuraHost, 'decyzja nadal otwarta');

  // Wybór SIEBIE jest legalny (Oracle „enchant player" nie zawęża do
  // przeciwnika) — dopiero teraz decyzja się domyka.
  const wybor = run(s, oferta.find((c) => c.auraHostId === 'p1'));
  assert.ok(wybor.ok, 'wybór samego decydenta przyjęty');
  assert.equal(find(s, 'curse-of-the-pierced-heart', 'battlefield')?.enchantedPlayerId, 'p1', 'klątwa na decydencie');
  assert.equal(s.pendingAuraHost ?? null, null, 'decyzja zamknięta');
});

test('G/4: wroga klątwa nie zaczarowuje samego bota (wycena i aggro widzą kandydata-gracza)', () => {
  const s = game();
  put(s, 'gy-curse', 'curse-of-the-pierced-heart', 'p1', 'graveyard');
  annieReturns(s, 'gy-curse');
  const view = playerView(s, 'p1'); // decydentem jest p1; bot gra z tej perspektywy

  const wybor = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(wybor?.type, 'resolve_aura_host', 'heurystyk rozstrzyga decyzję (nie „niewycenione")');
  assert.equal(wybor.auraHostId, 'p2', 'wroga klątwa idzie na przeciwnika, nigdy na siebie');

  const aggro = createAggroBot().chooseCommand(view);
  assert.equal(aggro?.type, 'resolve_aura_host', 'aggro też rozstrzyga (komenda z listy prostej)');
  assert.equal(aggro.auraHostId, 'p2', 'aggro nie zaczarowuje siebie, gdy może przeciwnika');
});
