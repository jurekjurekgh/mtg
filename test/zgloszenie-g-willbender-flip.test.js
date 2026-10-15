// Zgłoszenie G (2026-10-14), część (b): KIEDY bot obraca kartę z morphem
// i NA CO przekierowuje cel wrogiego czaru.
// Właściciel: „(…) trzymał go w formie face-down i czekał z odkręceniem, aż
// przeciwnik zagra jakiś czar celujący, wtedy odkrywał go i przekierowywał cel
// na jak najmniej korzystny dla przeciwnika cel (buff przeciwnika → twój stwór,
// damage w ciebie → w przeciwnika, debuff na twoim stworze → stwór przeciwnika
// itp.)”.
//
// Reguły (deskryptorowo, ADR 0002; w komentarzach bez nazw kart):
//  • przekierować można tylko na INNY LEGALNY cel tego samego czaru, a przy
//    braku kandydata oryginalny cel zostaje (CR 115.7a),
//  • obrót twarzą do góry to akcja specjalna (CR 116.2b: „Turning a face-down
//    creature face up is a special action"), więc okno reakcji jest wtedy, gdy
//    na stosie leży czar/zdolność WROGA z dokładnie jednym celem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: data.types ?? [],
    colors: data.colors ?? [], cardName: def.name, morph: data.morph ?? null,
    aura: def.aura ?? null, ...extra,
  });
  return state.objects.get(id);
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((p) => p.id === playerId);
  player.mana = amount;
  player.manaPool = { ...colors };
}

/** Scena bazowa: bot (p1) ma Willbendera ZAKRYTEGO na stole, po jednym
 *  stworze z każdej strony i manę na obrót ({1}{U} = 3 pkt many). */
function scenaBazowa({ zWrogimCzarem = false, czar = 'shock', celCzaru = 'mojSredni' } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  put(state, 'wb', 'willbender', 'p1', 'hand');
  giveMana(state, 'p1', 3, {});
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wb', faceDown: true });
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const wb = [...state.objects.values()].find((o) => o.cardId === 'willbender');
  // `seismic-monstrosaur` = 6/5, `skymarch-bloodletter` = 3/2 z lataniem:
  // „duży” i „mały” cel, żeby wybór celu miał jednoznaczne kryterium ciała.
  put(state, 'mojMal', 'seismic-monstrosaur', 'p1', 'battlefield');
  put(state, 'mojSredni', 'skymarch-bloodletter', 'p1', 'battlefield');
  put(state, 'wrogMal', 'seismic-monstrosaur', 'p2', 'battlefield');
  put(state, 'wrogSredni', 'skymarch-bloodletter', 'p2', 'battlefield');
  if (zWrogimCzarem) {
    // Wróg rzuca czar z JEDNYM celem (okno ambushu otwarte).
    state.turn.activePlayerId = 'p2';
    state.turn.priorityPlayerId = 'p2';
    put(state, 'czar', czar, 'p2', 'hand');
    giveMana(state, 'p2', 6, { R: 1, W: 1, B: 1, G: 1, U: 1 });
    const r = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'czar', targets: [celCzaru] });
    if (!r.ok) {
      const r2 = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'czar', targets: [celCzaru] });
      assert.ok(r2.ok, `wróg musi móc zagrać czar: ${r.events?.[0]?.reason} / ${r2.events?.[0]?.reason}`);
    }
    execute(state, { type: 'pass_priority', playerId: 'p2' });
    state.turn.priorityPlayerId = 'p1';
  }
  return { state, wb };
}

/** Komenda obrotu Willbendera widziana przez bota (albo null). */
function komendaObrutu(view, wbId) {
  return view.legalCommands.find(
    (c) => c.type === 'activate_ability' && c.objectId === wbId,
  ) ?? null;
}

test('Zgłoszenie G/(b): pusty stos — bot NIE obraca zakrytej karty (ambush czeka)', () => {
  const { state, wb } = scenaBazowa();
  giveMana(state, 'p1', 3, { U: 1 }); // mana na obrót: {1}{U}
  const view = playerView(state, 'p1');
  const obrot = komendaObrutu(view, wb.id);
  assert.ok(obrot, 'silnik oferuje obrót twarzą do góry (akcja specjalna, CR 116.2b)');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view);
  const obraca = wybor.type === 'activate_ability' && wybor.objectId === wb.id;
  assert.equal(obraca, false,
    `bez czaru wroga na stosie obrót spala ambush — bot ma czekać (wybrał: ${wybor.type})`);
});

test('Zgłoszenie G/(b): wrogi czar z jednym celem na stosie — bot obraca twarzą do góry', () => {
  const { state, wb } = scenaBazowa({ zWrogimCzarem: true, czar: 'shock', celCzaru: 'mojSredni' });
  giveMana(state, 'p1', 3, { U: 1 }); // mana na obrót: {1}{U}
  const view = playerView(state, 'p1');
  const stos = view.zones.stack ?? [];
  assert.equal(stos.length, 1, 'na stosie leży czar wroga');
  assert.equal(stos[0].controllerId, 'p2', 'czar należy do wroga');
  assert.equal((stos[0].targets ?? []).length, 1, 'czar ma dokładnie jeden cel (CR 115.7a)');
  const obrot = komendaObrutu(view, wb.id);
  assert.ok(obrot, 'obrót jest oferowany');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view);
  assert.equal(wybor.type, 'activate_ability', `okno ambushu: bot obraca kartę (wybrał: ${wybor.type})`);
  assert.equal(wybor.objectId, wb.id, 'obraca właśnie zakrytą kartę z morphem');
});

test('Zgłoszenie G/(b): wroga aura-kotwica na moim stworze → przekierowanie na NAJWIĘKSZEGO wroga', () => {
  // „debuff na twoim stworze → stwór przeciwnika”: wroga aura (Pacifism)
  // celuje w moje 3/2, a bot ma przenieść ją na stwora wroga — i to na
  // NAJGORSZEGO dla przeciwnika (6/5), nie na pierwszego z listy ofert.
  const { state, wb } = scenaBazowa({ zWrogimCzarem: true, czar: 'pacifism', celCzaru: 'mojSredni' });
  giveMana(state, 'p1', 3, { U: 1 });
  const view1 = playerView(state, 'p1');
  const obrot = view1.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === wb.id);
  assert.ok(obrot, 'obrót oferowany przy wrogiej aurze na stosie');
  execute(state, obrot);
  for (let i = 0; i < 8 && !state.pendingRedirectChoice; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingRedirectChoice, 'silnik pyta o nowy cel (CR 115.7a)');
  const view2 = playerView(state, 'p1');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view2);
  assert.equal(wybor.type, 'resolve_redirect_choice', `bot rozstrzyga przekierowanie: ${wybor.type}`);
  assert.equal(wybor.targetId, 'wrogMal',
    'wroga aura-kotwica ląduje na największym stworze wroga (nie na moim, nie na pierwszym z listy)');
});

test('Zgłoszenie G/(b): wrogi buff na JEGO stworze → przekierowanie na MOJE (przejęcie buffu)', () => {
  // „buff przeciwnika → twój stwór”: wróg wzmacnia swoje 3/2 (+3/+3), a bot
  // przejmuje wzmocnienie na własne 6/5 — zysk podwójny: wróg traci, ja
  // zyskuję. Pomiar PRZED: kandydaci remisowali (0 pkt) i wygrywała
  // pierwsza oferta.
  const { state, wb } = scenaBazowa({ zWrogimCzarem: true, czar: 'brute-force', celCzaru: 'wrogSredni' });
  giveMana(state, 'p1', 3, { U: 1 });
  const view1 = playerView(state, 'p1');
  const obrot = view1.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === wb.id);
  assert.ok(obrot, 'obrót oferowany przy wrogim buffie na stosie');
  execute(state, obrot);
  for (let i = 0; i < 8 && !state.pendingRedirectChoice; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingRedirectChoice, 'silnik pyta o nowy cel');
  const view2 = playerView(state, 'p1');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view2);
  assert.equal(wybor.type, 'resolve_redirect_choice', `bot rozstrzyga przekierowanie: ${wybor.type}`);
  assert.equal(wybor.targetId, 'mojMal',
    'buff przechodzi na MOJE największe stworzenie (przejęcie efektu, nie oddanie go wrogowi)');
});

test('Zgłoszenie G/(b) anty-over-fix: wrogi burn celujący we mnie → cel wroga', () => {
  // Scenariusz z opisu właściciela: „damage w ciebie → w przeciwnika”.
  // Obrażenia idą w twarz bota; przekierowanie na twarz wroga to wymiana
  // symetryczna pól życia, więc bot ma wybrać cel wroga (nie własny).
  const { state, wb } = scenaBazowa({ zWrogimCzarem: true, czar: 'shock', celCzaru: 'p1' });
  giveMana(state, 'p1', 3, { U: 1 });
  const view1 = playerView(state, 'p1');
  const obrot = view1.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === wb.id);
  assert.ok(obrot, 'obrót oferowany przy burnie w twarz');
  execute(state, obrot);
  for (let i = 0; i < 8 && !state.pendingRedirectChoice; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingRedirectChoice, 'silnik pyta o nowy cel');
  const view2 = playerView(state, 'p1');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view2);
  assert.equal(wybor.type, 'resolve_redirect_choice', `bot rozstrzyga przekierowanie: ${wybor.type}`);
  assert.notEqual(wybor.targetId, 'p1', 'nigdy nie zostawiamy burnu we własnej twarzy, gdy jest inny cel');
  // Cel musi należeć do wroga — twarz wroga albo jego stworzenie.
  const celGracz = wybor.targetId === 'p2';
  const celObiekt = state.objects.get(wybor.targetId);
  assert.ok(celGracz || celObiekt?.controllerId === 'p2',
    `przekierowany burn ląduje po stronie wroga (wybrano: ${wybor.targetId})`);
});

/** Scena ambushu z PŁATNOŚCIĄ, która mieli bibliotekę: bot ma zakrytą kartę
 *  z morphem i dokładnie DWA nietapnięte lądy, z czego jeden jest zaczarowany
 *  wrogą aurą „tapnięcie → miel 3” (deskryptor: trigger `enchanted_permanent_tapped`,
 *  efekt `mill_cards` z `applyTo: 'enchanted_controller'` — CR 702/„Enchant land”).
 *  Pula many bota = 0, więc obrót da się opłacić WYŁĄCZNIE tapnięciem tych lądów
 *  (jedno z nich zawsze mieli). Okno ambushu jest otwarte (wrogi czar z jednym
 *  celem w moje stworzenie).
 *
 *  Reguła właściciela (2026-09-23c, Chronic Flooding): „nie tapować przy
 *  bibliotece < ~30 kart” — drabina `libraryTapSafeMargin` (30) sprawia, że przy
 *  14 kartach tapnięcie mielącego źródła kosztuje 60 + 6 × (30 − 11) = 174 pkt,
 *  czyli ZNACZNIE więcej niż bonus okna ambushu (25). Poprawną decyzją jest pass.
 *  Pomiar w realnej partii (seed 207, ravnica vs dominaria-wu, tura 15, wrogi
 *  „deal damage to target creature with flying”): opcja obrotu −155, pass 0.
 *
 *  POKRYCIE (uczciwie): kara `morphFlipNoPayoffPenalty` i sama drabina
 *  biblioteczna są pinowane tym plikiem (mutacje: policy→usunięta ⇒ RED,
 *  `libraryTapSafeMargin` 30→0 ⇒ RED, aura mieląca pominięta ⇒ RED).
 *  Bonusu `morphFlipPayoffBonus` NIE pinuje żaden test jednostkowy — jest
 *  mierzony na realnych partiach (sonda pętli jakości, 45 partii, pary
 *  morphowe: 7/12 okien z ofertą obrotu wygrywa obrót; z bonusem 0 → 6/12).
 */
function scenaZalanejKrainy({ zAura = true, biblioteka = 14 } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  put(state, 'wb', 'willbender', 'p1', 'hand');
  giveMana(state, 'p1', 3, {});
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wb', faceDown: true });
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  giveMana(state, 'p1', 0, {}); // płatność wyłącznie z lądów
  for (let i = 0; i < biblioteka; i += 1) put(state, `lib-${i}`, 'basic-island', 'p1', 'library');
  const landZalany = put(state, 'land-1', 'basic-island', 'p1', 'battlefield');
  put(state, 'land-2', 'basic-island', 'p1', 'battlefield');
  if (zAura) {
    // Załączenie wyłącznie przez API silnika (L21): `addObject` odrzuca
    // `attachedTo` („ginie po cichu”), a aura niezamocowana do niczego nie
    // wyzwala kary bibliotecznej — scena byłaby fałszywie zielona.
    const aura = put(state, 'aura-1', 'chronic-flooding', 'p2', 'battlefield');
    attachAuraToCreature(state, aura.id, landZalany.id);
  }
  put(state, 'mojSredni', 'skymarch-bloodletter', 'p1', 'battlefield');
  put(state, 'wrogSredni', 'seismic-monstrosaur', 'p2', 'battlefield');
  // Okno ambushu: czar wroga z JEDNYM celem w moje stworzenie.
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  put(state, 'czar', 'shock', 'p2', 'hand');
  giveMana(state, 'p2', 6, { R: 1 });
  const rzut = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'czar', targets: ['mojSredni'] });
  assert.ok(rzut.ok, `wróg musi móc zagrać czar: ${rzut.events?.[0]?.reason}`);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  state.turn.priorityPlayerId = 'p1';
  // Uwaga: `addObject` nadaje WŁASNE id (permanent-N) — cel testu czytamy
  // po cardId, tak jak `scenaBazowa` (L41: jedno źródło kształtu scen).
  return { state, wb: [...state.objects.values()].find((o) => o.cardId === 'willbender') };
}

test('Zgłoszenie G/(b): okno ambushu, ale płatność miele cienką bibliotekę → bot PASSuje', () => {
  const { state, wb } = scenaZalanejKrainy({ zAura: true, biblioteka: 14 });
  const view = playerView(state, 'p1');
  const stos = view.zones.stack ?? [];
  assert.equal(stos.length, 1, 'na stosie leży wrogi czar (okno otwarte)');
  assert.equal((stos[0].targets ?? []).length, 1, 'dokładnie jeden cel (CR 115.7a)');
  const obrot = komendaObrutu(view, wb.id);
  assert.ok(obrot, 'silnik OFERUJE obrót (płatny tapnięciem dwóch lądów)');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view);
  const obraca = wybor.type === 'activate_ability' && wybor.objectId === wb.id;
  assert.equal(obraca, false,
    `trafienie okna nie może kosztować 174 pkt kary bibliotecznej (wybrał: ${wybor.type})`);
});

test('Zgłoszenie G/(b) kontrola: ta sama scena bez wrogiej aury mielącej → bot OBRAca', () => {
  const { state, wb } = scenaZalanejKrainy({ zAura: false, biblioteka: 14 });
  const view = playerView(state, 'p1');
  assert.ok(komendaObrutu(view, wb.id), 'obrót oferowany');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view);
  assert.equal(wybor.type, 'activate_ability', `okno ambushu → obrót (wybrał: ${wybor.type})`);
  assert.equal(wybor.objectId, wb.id, 'obraca zakrytą kartę z morphem');
});

test('Zgłoszenie G/(b) kontrola: gruba biblioteka (≥ zapas 30) → obrót mimo aury', () => {
  const { state, wb } = scenaZalanejKrainy({ zAura: true, biblioteka: 35 });
  const view = playerView(state, 'p1');
  const stos = view.zones.stack ?? [];
  assert.equal(stos.length, 1, 'okno otwarte');
  const wybor = createHeuristicBot({ seed: 11 }).chooseCommand(view);
  assert.equal(wybor.type, 'activate_ability',
    `przy zapasie ≥ 30 kart tapnięcie mielącego źródła jest dopuszczalne (wybrał: ${wybor.type})`);
  assert.equal(wybor.objectId, wb.id, 'obraca zakrytą kartę z morphem');
});
