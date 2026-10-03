// PMSSB-39 (2026-10-02e) — payoffy z efektem TYMCZASOWYM przy rzucie (prowess:
// Jeskai Windscout, Jeskai Devotee, Kulrath Mystic): wartość pumpu zależy od
// okna i polityki ataku. Plan: `docs/plans/PLAN_2026-10-02e-pmssb39-pump-triggery.md`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

function game(lib = 30) {
  const s = createGameState({ seed: 39, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < lib; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}

const READY = { summoningSick: false, summoningSickness: false };
const lands = (s, n, kind) => { for (let i = 0; i < n; i += 1) put(s, `L${i}`, kind, 'p1', 'battlefield', { tapped: false }); };

/** Oferty bota: mapa etykieta → wynik + wybrana komenda. */
function oferta(s, params) {
  const bot = createHeuristicBot({ seed: 2026, params });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  const opcje = new Map();
  for (const o of bot.trace().at(-1)?.options ?? []) opcje.set(o.cmd, o.score);
  return { cmd, opcje };
}
const wynik = (s, prefix, params) => {
  const hits = [...oferta(s, params).opcje].filter(([k]) => k.startsWith(prefix));
  assert.equal(hits.length, 1, `jedna oferta „${prefix}”, są: ${[...oferta(s, params).opcje.keys()].join(' | ')}`);
  return hits[0][1];
};




/** Różnica wyniku oferty z payoffem i bez (`boardPayoffWeight` 0). */
const zysk = (s, prefix, params = {}) => wynik(s, prefix, params) - wynik(s, prefix, { ...params, boardPayoffWeight: 0 });

function scena({ host = 'jeskai-windscout', hostPatch = {}, foe = null, hand = 'shock', prior = 0, phase = null } = {}) {
  const s = game();
  if (phase) s.turn.phase = phase;
  lands(s, 5, 'basic-mountain');
  put(s, 'w', host, 'p1', 'battlefield', { ...READY, ...hostPatch });
  if (foe) put(s, 'b', foe.card ?? 'hill-giant', 'p2', 'battlefield', { ...READY, ...(foe.patch ?? {}) });
  put(s, 'h0', hand);
  s.spellsCastThisTurnByPlayer = { p1: prior };
  return s;
}
const naface = 'cast_spell(h0->p2)';

test('A1 prowess w głównej 1, wróg bez blokerów: pump = obrażenia w twarz (4/pkt × waga 0,5)', () => {
  assert.equal(zysk(scena(), naface), 2);
});

test('A2 nosiciel z chorobą przyzwania nie zaatakuje: 0', () => {
  assert.equal(zysk(scena({ hostPatch: { summoningSickness: true } }), naface), 0);
});

test('A3 druga główna: pump wygaśnie bez walki: 0', () => {
  assert.equal(zysk(scena({ phase: 'postcombat_main' }), naface), 0);
});

test('A4 wróg bez latania/zasięgu nie zablokuje latającego: pełne obrażenia jak bez wroga', () => {
  assert.equal(zysk(scena({ foe: { card: 'hill-giant' } }), naface), 2);
});

test('A5 Kulrath Mystic: czar o MV ≥ 4 + blok 3/3, który pump +2/+0 przełamuje → trik (≈ +6)', () => {
  const s = scena({ host: 'kulrath-mystic', foe: { patch: { power: 3, toughness: 3 } }, hand: 'hill-giant' });
  // PMSSB-40: rider `vigilance` (nietapnięte ciało po ataku) to OSOBNA pętla
  // (nowy wymiar `payoffUntappedBodyWeight`), więc ten pin zeruje tamto pokrętło
  // i mierzy dalej sam trik; wartość z riderem pinuje
  // `test/audyt-pmssb40-skierowane-nietapniecie.test.js` (C1: 7 + 4 = 11).
  const z = zysk(s, 'cast_permanent(h0)', { payoffUntappedBodyWeight: 0 });
  assert.ok(z > 4 && z < 9, `zysk ${z}`);
});

test('A6 Kulrath Mystic: czar o MV < 4 nie odpala triggera (warunek z karty)', () => {
  const s = scena({ host: 'kulrath-mystic', foe: { patch: { power: 3, toughness: 3 } }, hand: 'shock' });
  assert.equal(zysk(s, naface), 0);
});

test('A7 Jeskai Devotee: drugi czar dostaje wartość pumpu, pierwszy i trzeci nie', () => {
  const z = (prior) => zysk(scena({ host: 'jeskai-devotee', prior }), naface);
  assert.equal(z(1), 2);
  assert.equal(z(0), 0);
  assert.equal(z(2), 0);
});

test('A8 pokrętła: tempPumpFaceDamageValue 0 zeruje wartość; tempPumpBlockOdds działa na blok', () => {
  assert.equal(zysk(scena(), naface, { tempPumpFaceDamageValue: 0 }), 0);
  const s = () => scena({ host: 'kulrath-mystic', foe: { patch: { power: 3, toughness: 3 } }, hand: 'hill-giant' });
  assert.ok(zysk(s(), 'cast_permanent(h0)', { tempPumpBlockOdds: 1 }) > zysk(s(), 'cast_permanent(h0)', { tempPumpBlockOdds: 0 }));
});

/** Walka zadeklarowana: Windscout (2/1 lot.) atakuje, wróg blokuje latającym stworem. */
function walka(bp, bt) {
  const s = game(30);
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  lands(s, 3, 'basic-mountain');
  put(s, 'w', 'jeskai-windscout', 'p1', 'battlefield', READY);
  put(s, 'b', 'jeskai-windscout', 'p2', 'battlefield', { ...READY, power: bp, toughness: bt });
  put(s, 'sh', 'shock');
  execute(s, playerView(s, 'p1').legalCommands.find((c) => c.type === 'declare_attackers' && c.attackerIds.includes('w')));
  for (let i = 0; i < 6 && s.turn.step !== 'declare_blockers'; i += 1) {
    execute(s, playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  const blok = playerView(s, 'p2').legalCommands.find((c) => c.type === 'declare_blockers' && JSON.stringify(c).includes('"b"') && JSON.stringify(c).includes('"w"'));
  if (blok) execute(s, blok);
  for (let i = 0; i < 4 && s.turn.priorityPlayerId !== 'p1'; i += 1) {
    execute(s, playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  assert.ok(playerView(s, 'p1').combat, 'walka trwa');
  return s;
}

test('B1 w walce: pump, który zmienia wynik (blokujący 1/1 → przeżywam i zabijam), = trik (+10)', () => {
  assert.equal(zysk(walka(1, 1), 'cast_spell(sh->p2)'), 10);
});

test('B2 w walce: pump bez zmiany wyniku (blokujący 2/2 — obie strony giną tak samo) = 0', () => {
  assert.equal(zysk(walka(2, 2), 'cast_spell(sh->p2)'), 0);
});
