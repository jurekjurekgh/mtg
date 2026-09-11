// Zgłoszenie właściciela D (2026-09-10) — bezsensowny atak.
//
// Objaw: bot zaatakował 3/1 (Furious Forebear) w nietapnięte 4/4 i 4/5
// przeciwnika, mając 3 życia (przeciwnik 7). Atakujący ginie, przeciwnik nie
// traci ani życia, ani stwora — a bot zostaje bez blokera przy 3 życiach.
//
// Przyczyna źródłowa (zmierzona w `declare_attackers`, heuristic-bot.js):
// gałąź GANGU blokerów (M167/I: „ginie od gangu i nie zabija ŻADNEGO — czysta
// strata stwora", kara `-(toughness + 8)`) NIE podbijała licznika
// `futileAttackers`, więc `wholeAttackFutile` było fałszem i atak dostawał
// premię wyścigu. Przy 3 życiach bota i 4/4 + 4/5 u przeciwnika
// `enemyBoardPower >= myLife` → `racing = true`, a `totalPower (3) >=
// enemyLife - 5 (2)` → premia +20 PRZEBIJAŁA karę -9 (klasa L3: kara musi być
// liczona względem premii, inaczej jest martwa). Ten sam atak w JEDNEGO 4/4
// trafiał w gałąź chumpa (-10, jałowy) i bot go nie robił — czyli decyzja
// zależała od liczby blokerów, nie od sensu ataku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function gra({ zycieBota = 3, zycieWroga = 7 }) {
  const s = createGameState({ seed: 31, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  s.players.find((p) => p.id === 'p1').life = zycieBota;
  s.players.find((p) => p.id === 'p2').life = zycieWroga;
  return s;
}

function dodajKarte(s, id, cardId, pid) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w katalogu`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  return s.objects.get(id);
}

function dodajVanilla(s, id, pid, { power, toughness }) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  return s.objects.get(id);
}

function atak(s) {
  const bot = createHeuristicBot({ seed: 31 });
  const view = playerView(s, 'p1');
  assert.ok(
    view.legalCommands.some((c) => c.type === 'declare_attackers'),
    'deklaracja ataku jest w ofercie (inaczej test byłby pusty)',
  );
  const cmd = bot.chooseCommand(view);
  return cmd.type === 'declare_attackers' ? (cmd.attackerIds ?? []) : [];
}

test('D/1: 3/1 w nietapnięte 4/4 + 4/5 przy 3 własnego życia — bot NIE atakuje', () => {
  const s = gra({ zycieBota: 3, zycieWroga: 7 });
  dodajKarte(s, 'przodek', 'furious-forebear', 'p1');
  assert.equal(s.objects.get('przodek').power, 3, 'Furious Forebear to 3/1 (scenariusz właściciela)');
  assert.equal(s.objects.get('przodek').toughness, 1);
  dodajVanilla(s, 'b1', 'p2', { power: 4, toughness: 4 });
  dodajVanilla(s, 'b2', 'p2', { power: 4, toughness: 5 });
  assert.deepEqual(atak(s), [], 'atak 3/1 w gang 4/4+4/5 nic nie daje i kosztuje stwora — ma nie być zadeklarowany');
});

test('D/2 anty-over-fix: ten sam 3/1 atakuje w pustą planszę (realne obrażenia)', () => {
  const s = gra({ zycieBota: 3, zycieWroga: 7 });
  dodajKarte(s, 'przodek', 'furious-forebear', 'p1');
  assert.deepEqual(atak(s), ['przodek'], 'bez blokerów atak zadaje 3 obrażenia — ma być zadeklarowany');
});

test('D/3 anty-over-fix: 3/1 atakuje, gdy WYMIENIA się z blokerem (3/3)', () => {
  // Kara za jałowość nie może zablokować ataku, który realnie coś zabija:
  // 3 mocy >= 3 wytrzymałości blokera = wymiana (obrażenia + usunięcie blokera).
  const s = gra({ zycieBota: 3, zycieWroga: 7 });
  dodajKarte(s, 'przodek', 'furious-forebear', 'p1');
  dodajVanilla(s, 'b1', 'p2', { power: 3, toughness: 3 });
  assert.deepEqual(atak(s), ['przodek'], 'wymiana 3/1 za 3/3 to zysk — atak ma zostać');
});

test('D/4 anty-over-fix: w wyścigu WYMIANA 1/1 za 1/1 nadal jest atakowana', () => {
  // „Jałowy" nie może znaczyć „zablokowany": w wyścigu (wróg 6 życia) wymiana
  // 1/1 za 1/1 usuwa blokera i trzyma zegar — bez premii wyścigu score wynosi
  // 0 i remisuje z pasem. Mutacja licząca KAŻDY zablokowany atak jako jałowy
  // gasiła ten atak (zmierzone), więc ten przypadek pilnuje granicy.
  const s = gra({ zycieBota: 12, zycieWroga: 6 });
  dodajVanilla(s, 'zolnierz', 'p1', { power: 1, toughness: 1 });
  dodajVanilla(s, 'b1', 'p2', { power: 1, toughness: 1 });
  assert.deepEqual(atak(s), ['zolnierz'], 'wymiana 1/1 za 1/1 w wyścigu ma zostać zadeklarowana');
});
