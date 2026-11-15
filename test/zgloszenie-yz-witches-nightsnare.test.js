// Zgłoszenia Y (Cuombajj Witches) i Z (Nightsnare) — piny z logu właściciela.
//
// Y(a): „Bot używa zdolności tej karty na mojej atakującej kreaturze 3/4. Bot
//       nie ma blokerów więc 1 dmg nic jej nie robi. Zmarnowana zdolność,
//       a jeszcze sam dostał 1 dmg od Cuombajj Witches."
//   Pomiar PRZED: trwająca walka + 3/4 atakujący + brak moich blokerów →
//   ocena wariantu 0 pkt, aktywacja wygrywa z passem (0 > 0? nie — 0 == pass,
//   ale wariant pierwszy z enumeracji przegrywa dopiero przy <0). Poza walką
//   ta sama scena dawała −80. Defekt: `damageTargetValue` w oknie walki
//   zwracał 0 dla chipa, który NIC nie zmienia — a 0 remisuje z passem.
//   Pomiar PO: −60 (bez blokerów), −86 (z blokerem, którego chip nie dobija),
//   +38 gdy chip REALNIE dobija (wróg 1/1).
//
// Y(b): kolejność UI jest zgodna z CR (oba cele przed zapłatą kosztów);
//   realna uwaga właściciela dotyczy jawności wyboru bota — DECYZJA, nie pin.
//
// Z: log jest POPRAWNY (trzy prawdziwe zdania z właściwymi podmiotami).
//   Pinuje, że gracz NIE jest nazywany rzucającym i że komunikat o rezygnacji
//   bota wskazuje GRACZA jako odrzucającego.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, game, playerView, addMana, execute } from './helpers/pmssb58.js';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Scena Y(a): bot (p2) ma Cuombajj Witches; gracz atakuje stworem p/t.
 * `bloker` = id mojego blokera (null = brak blokerów — przypadek właściciela).
 * Uwaga: `highland-game` to 2/1, nie 2/2 — do „dobicia po bloku" potrzeba 1/1.
 */
function scenaWitches({ p = 3, t = 4, bloker = null } = {}) {
  const s = game({ step: 'main2', active: 'p2' });
  put(s, 'witches', 'cuombajj-witches', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'atk', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false, power: p, toughness: t });
  if (bloker) put(s, 'blk', bloker, 'p2', 'battlefield', { summoningSickness: false });
  s.combat = {
    attackers: ['atk'], attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    blockers: new Map(), blockedAttackers: [], unblockedAttackers: ['atk'],
  };
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  const ocena = bot.trace().at(-1).options
    .filter((o) => o.cmd.startsWith('activate_ability(witches'))
    .map((o) => o.score);
  return { dec, ocena };
}

test('Y/1: 3/4 atakujący, BRAK moich blokerów — chip nic nie zmienia, bot NIE aktywuje', () => {
  // Dokładnie scena właściciela: „Bot nie ma blokerów więc 1 dmg nic jej nie robi.
  // Zmarnowana zdolność, a jeszcze sam dostał 1 dmg od Cuombajj Witches."
  const { dec, ocena } = scenaWitches({ p: 3, t: 4, bloker: null });
  assert.notEqual(dec.type === 'activate_ability' && dec.objectId === 'witches', true,
    `bot nie marnuje zdolności na 3/4: ${JSON.stringify(dec)}`);
  assert.ok((ocena[0] ?? 0) < 0,
    `chip bez dobicia MUSI być ujemny (0 remisuje z passem): ${JSON.stringify(ocena)}`);
});

test('Y/2: 2/2 atakujący + mój bloker 1/1 — chip DOBIJA po bloku, bot aktywuje', () => {
  // Kryterium właściciela Y/2: 2/2 atakujący + bloker 1/1 = dobicie po bloku.
  // Blok 1/1 vs 2/2: oba giną, ale chip sprawia, że atakujący ma 2 dmg
  // i pada nawet bez wymiany — bot ma realny zysk (ocena +18).
  const { dec } = scenaWitches({ p: 2, t: 2, bloker: 'soulmender' });
  assert.equal(dec.type, 'activate_ability',
    `chip realnie zmienia wynik bloku — warto aktywować: ${JSON.stringify(dec)}`);
  assert.equal(dec.objectId, 'witches');
  assert.deepEqual(dec.targets?.[0], 'atk', `cel = atakujący: ${JSON.stringify(dec.targets)}`);
});

test('Y/3: poza walką 3/4 — chip na stwora oceniony −80, bot go nie wybiera', () => {
  const s = game({ step: 'main1', active: 'p2' });
  put(s, 'witches', 'cuombajj-witches', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'atk', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false, power: 3, toughness: 4 });
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  assert.notEqual(dec.type === 'activate_ability' && dec.objectId === 'witches', true,
    `poza walką chip to strata: ${JSON.stringify(dec)}`);
  const ocena = bot.trace().at(-1).options
    .filter((o) => o.cmd.startsWith('activate_ability(witches')).map((o) => o.score);
  // Bez walki bot może wybrać twarz (−60), ale nigdy stwora 3/4 (−80):
  // chip nie zmienia jego stanu, więc zdolność byłaby zmarnowana.
  const naStwora = ocena.find((v) => v === -80);
  assert.ok(naStwora !== undefined, `ocena chipa na 3/4 = −80: ${JSON.stringify(ocena)}`);
  assert.ok(dec.type !== 'activate_ability' || dec.targets?.[0] !== 'atk',
    `bot nie kieruje chipa na 3/4 poza walką: ${JSON.stringify(dec)}`);
});

test('Y/4: wróg 1/1 — chip dobija natychmiast, bot aktywuje (kontrola)', () => {
  const { dec } = scenaWitches({ p: 1, t: 1, bloker: null });
  assert.equal(dec.type, 'activate_ability', `dobijający chip jest wart aktywacji: ${JSON.stringify(dec)}`);
  assert.deepEqual(dec.targets?.[0], 'atk');
});

test('Y/5: log nazywa cel BOTA, zanim gracz wybierze swój (oba cele jawne w session.log)', () => {
  // Zgłoszenie Y(b) właściciela: „Gdy bot używa tej zdolności to nie wiadomo do
  // kogo strzela — nie ma tej informacji w Rozgrywce do czasu aż wybiorę swój
  // cel". Kolejność w silniku jest poprawna (CR 601.2c: aktywujący wskazuje
  // pierwszy, oba cele jawne zanim ktokolwiek dostanie priorytet) — brakowało
  // jawności w logu. Zdarzenie `opponent_target_required` musi nieść cel
  // aktywującego, a `session.log` nazwać go PRZED wezwaniem gracza do wyboru
  // (Audyt PR #184 / F-3: wcześniejszy pin nie wołał session.js — klasa L34).
  const session = createSession({ seed: 424051, registry: REGISTRY, decks: TALIE() });
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  assert.ok(keep && session.apply(keep).ok, 'zatrzymanie ręki');
  const s = session.state;
  s.turn = jumpToStep(s.turn, 'main', BOT_ID);
  s.turn.activePlayerId = BOT_ID;
  s.turn.priorityPlayerId = BOT_ID;
  const defW = REGISTRY.get('cuombajj-witches');
  const defK = REGISTRY.get('segmented-krotiq');
  addObject(s, {
    id: 'witches', instanceId: 'i-witches', cardId: 'cuombajj-witches',
    controllerId: BOT_ID, ownerId: BOT_ID, zone: 'battlefield', summoningSickness: false,
    ...gameObjectDataOf(defW), types: defW.types ?? [], keywords: defW.keywords ?? [], subtypes: defW.subtypes ?? [],
  });
  addObject(s, {
    id: 'atk', instanceId: 'i-atk', cardId: 'segmented-krotiq',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield', summoningSickness: false,
    ...gameObjectDataOf(defK), power: 1, toughness: 1, types: defK.types ?? [], keywords: defK.keywords ?? [], subtypes: defK.subtypes ?? [],
  });
  const aktywacja = playerView(s, BOT_ID).legalCommands.find(
    (c) => c.type === 'activate_ability' && c.objectId === 'witches');
  assert.ok(aktywacja, 'bot ma ofertę aktywacji');
  const r = session.apply({ ...aktywacja, targets: ['atk'] });
  assert.equal(r.ok, true);
  assert.equal(s.pendingOpponentTarget?.playerId, HUMAN_ID, 'drugi cel wskazuje gracz');
  const log = session.log.map((l) => l.text).join('\n');
  assert.match(
    log,
    /Cuombajj Witches: Nieprzyjaciel wskazuje Segmented Krotiq, wskazujesz drugi cel obrażeń/,
    `log stołu nazywa cel bota przed wyborem gracza:\n${log}`,
  );
});

test('Y/6 (Audyt PR #184 / F-3): cel będący graczem-człowiekiem używa biernika „Ciebie" (zarówno w session.log, jak i w czystym describeGameEvent)', () => {
  // 1) Żywa sesja stołu: nameOfObject(HUMAN_ID) zwraca „Ty", więc bez biernika
  // log stołu pisał „Nieprzyjaciel wskazuje Ty, wskazujesz drugi cel obrażeń".
  const session = createSession({ seed: 424051, registry: REGISTRY, decks: TALIE() });
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  assert.ok(keep && session.apply(keep).ok);
  const s = session.state;
  s.turn = jumpToStep(s.turn, 'main', BOT_ID);
  s.turn.activePlayerId = BOT_ID;
  s.turn.priorityPlayerId = BOT_ID;
  const defW = REGISTRY.get('cuombajj-witches');
  addObject(s, {
    id: 'witches', instanceId: 'i-witches', cardId: 'cuombajj-witches',
    controllerId: BOT_ID, ownerId: BOT_ID, zone: 'battlefield', summoningSickness: false,
    ...gameObjectDataOf(defW), types: defW.types ?? [], keywords: defW.keywords ?? [], subtypes: defW.subtypes ?? [],
  });
  const aktywacja = playerView(s, BOT_ID).legalCommands.find(
    (c) => c.type === 'activate_ability' && c.objectId === 'witches');
  assert.ok(aktywacja && session.apply({ ...aktywacja, targets: [HUMAN_ID] }).ok);
  const log = session.log.map((l) => l.text).join('\n');
  assert.match(
    log,
    /Cuombajj Witches: Nieprzyjaciel wskazuje Ciebie, wskazujesz drugi cel obrażeń/,
    `log stołu używa biernika „Ciebie" zamiast „Ty":\n${log}`,
  );

  // 2) Czysty describeGameEvent z helperami stołowymi (nameOfObject zwraca '?' dla
  // id graczy spoza state.objects): gałęzie opponent_target_* muszą pytać
  // isPlayer(id) i odmieniać cel HUMAN_ID na biernik „Ciebie" zamiast „?".
  const helpers = {
    nameOf: (id) => (id === 'cuombajj-witches' ? 'Cuombajj Witches' : String(id)),
    nameOfObject: () => '?',
    isPlayer: (id) => id === HUMAN_ID || id === BOT_ID,
  };
  assert.equal(
    describeGameEvent({
      type: 'opponent_target_required',
      cardId: 'cuombajj-witches',
      activatingPlayerId: BOT_ID,
      activatingTargetId: HUMAN_ID,
      playerId: HUMAN_ID,
    }, helpers),
    'Cuombajj Witches: Nieprzyjaciel wskazuje Ciebie, wskazujesz drugi cel obrażeń',
  );
  assert.equal(
    describeGameEvent({
      type: 'opponent_target_resolved',
      cardId: 'cuombajj-witches',
      playerId: BOT_ID,
      targetId: HUMAN_ID,
    }, helpers),
    'Cuombajj Witches: Nieprzyjaciel wskazuje Ciebie',
  );
});

test('Y/7 (Audyt PR #184 / F-3): starsze zdarzenie bez activatingTargetId zachowuje dawne zdanie bez „undefined wskazuje,"', () => {
  const helpers = {
    nameOf: (id) => (id === 'cuombajj-witches' ? 'Cuombajj Witches' : String(id)),
    nameOfObject: (id) => String(id),
    isPlayer: (id) => id === HUMAN_ID || id === BOT_ID,
  };
  assert.equal(
    describeGameEvent({
      type: 'opponent_target_required',
      cardId: 'cuombajj-witches',
      playerId: HUMAN_ID,
    }, helpers),
    'Cuombajj Witches: wskazujesz drugi cel obrażeń',
  );
});

// ---------- Z ----------

const REGISTRY = createCardRegistry();
const TALIE = () => new Map([
  [HUMAN_ID, parseDeckText('# A\n20x Forest\n20x Island', REGISTRY).cardIds],
  [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Swamp', REGISTRY).cardIds],
]);

/** Dokłada kartę do ręki w TRWAJĄCEJ sesji (sesja ma własne talie). */
function dodajDoReki(session, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(session.state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

test('Z/1: log Nightsnare bota — rzuca BOT, kartę wybiera BOT, odrzuca GRACZ', () => {
  // Zgłoszenie Z (log właściciela): „Bot ją rzuca. W Rozgrywka widzę komunikat,
  // jakbym to ja ją rzucał". Ustalenie: log jest POPRAWNY — trzy zdania mają
  // właściwe podmioty. Pin pilnuje, że żadne nie przypisze rzutu graczowi.
  const session = createSession({ seed: 424051, registry: REGISTRY, decks: TALIE() });
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  assert.ok(keep && session.apply(keep).ok, 'zatrzymanie ręki');
  const s = session.state;
  // Bot dostaje turę i Nightsnare w ręce.
  s.turn = jumpToStep(s.turn, 'main', BOT_ID);
  s.turn.activePlayerId = BOT_ID;
  s.turn.priorityPlayerId = BOT_ID;
  dodajDoReki(session, 'ns', 'nightsnare', BOT_ID);
  addMana(s, BOT_ID, 3, { colors: ['B'] });
  const widokBota = playerView(s, BOT_ID);
  const cast = widokBota.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ns');
  assert.ok(cast, `bot ma ofertę rzutu: ${JSON.stringify(widokBota.legalCommands.map((c) => c.type))}`);
  const r1 = session.apply({ ...cast, targets: [HUMAN_ID] });
  assert.ok(r1.ok, `rzut Nightsnare: ${JSON.stringify(r1.error ?? r1)}`);
  // Bot rezygnuje z wyboru karty (M202/I) — gracz odrzuca 2.
  const dec = playerView(s, BOT_ID).legalCommands
    .find((c) => c.type === 'resolve_discard_choice' && c.cardId == null);
  if (dec) assert.ok(session.apply(dec).ok, 'rezygnacja bota z wyboru karty');
  const log = session.log.map((l) => l.text).join('\n');

  // 1. Rzuca BOT — nigdzie nie ma „Ty rzucasz Nightsnare".
  assert.match(log, /Nieprzyjaciel rzuca Nightsnare/, `rzuca bot:\n${log}`);
  assert.doesNotMatch(log, /^Ty rzucasz Nightsnare/m, `log nie przypisuje rzutu graczowi:\n${log}`);
  // 2. Odsłonięta ręka należy do GRACZA.
  assert.match(log, /Odsłaniasz rękę \(Nightsnare\)/, `odkrywana jest ręka gracza:\n${log}`);
  // 3. Skoro bot rezygnuje — gracz odrzuca 2 karty (druga osoba).
  if (dec) {
    assert.match(log, /Nieprzyjaciel nie wskazuje karty.*Ty odrzucasz 2 karty/s,
      `rezygnacja bota + odrzucenie przez gracza:\n${log}`);
  }
  // 4. Wezwanie do wyboru nie sugeruje, że wybiera bot.
  assert.doesNotMatch(log, /^Nieprzyjaciel wybiera z odsłoniętej ręki/m,
    `wybór należy do gracza:\n${log}`);
});
