/**
 * AUDYT BOTA tura 5, część 2 (PR #93): remisy w walce — co jest przeoczeniem,
 * a co polityką, i dlaczego klasyfikacja „brak akcji" nie jest założeniem.
 *
 * Pomiar (tools/bot-tie-audit.mjs, 12 partii): 308 remisów na maksimum, z tego
 * 208 to para `block[]`/`attack[]` vs `pass_priority` — NADWYŻKA OFERTY SILNIKA,
 * nie dylemat bota. Zanim tę klasę się wycina z liczników, trzeba udowodnić, że
 * oba warianty naprawdę prowadzą do tego samego stanu (test 1 poniżej) — bo
 * „wygląda na no-op" to dokładnie ten rodzaj założenia, który generuje fałszywie
 * zielone bramki.
 *
 * Po wycięciu no-opów zostaje 100 remisów między REALNYMI wariantami i cztery
 * groźby wymagające oceny człowieka (2 block, 2 attack):
 *   - block: `block[]` (0) ex aequo z zablokowaniem za 1 własnego stwora
 *     (+3/+4 obrażeń unikniętych). Branch `declare_blockers` ma termin kary za
 *     NIEblokowanie TYLKO pod presją śmiertelną (M169/J+L i komentarz w kodzie),
 *     więc remis przy nieśmiertelnym trade'zie jest POLITYKĄ: bot nie wymienia
 *     stworów za obrażenia, których przeżycie nie jest kwestią tury. To nie jest
 *     przeoczenie wyceny i nie będzie „naprawiane" na siłę.
 *   - attack: `attack[]` (0) ex aequo z atakuje 1/1 w blokerów (0), oraz dwa
 *     zestawy o różnej sile i różnej obronie zostawionej w domu ex aequo (6).
 *     Tu wycena jest realnie płaska na drobnych różnicach; decyzja o jej
 *     zaostrzeniu wymaga benchmarku, nie testu, więc idzie do backlogu.
 * Bramka jest więc GRZECHOTKĄ: zamyka stan przejrzany (≤4) i łapie każdy wzrost,
 * a nie udaje ideału, którego projekt nie obwieścił.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { audytRemisow } from '../tools/bot-tie-audit.mjs';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function stol() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (const [id, controllerId, power, toughness] of [['atk', 'p1', 3, 3], ['blk', 'p2', 2, 4]]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  const atak = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.equal(atak.ok, true, 'atak zadeklarowany (harness się nie rozjechał)');
  assert.equal(state.turn.step, 'declare_blockers', 'silnik prowadzi do kroku bloków');
  return state;
}

const state2 = (s) => s;
const obrazPoWalce = (state) => JSON.stringify({
  zycie: state.players.map((p) => p.life),
  stoł: [...state.objects.values()].filter((o) => o.zone === 'battlefield')
    .map((o) => `${o.id}:${o.power}/${o.toughness}${o.tapped ? 't' : ''}`).sort(),
  kroki: `${state.turn.phase}/${state.turn.step}`,
});

test('no-op to no-op: „bez bloków" i pass w declare_blockers dają TEN SAM stan po walce', () => {
  // Dowód, a nie założenie — klasyfikacja w narzędziu opiera się na tym, że
  // różnica między tymi drogami nie zmienia wyniku partii (zmienia tylko
  // KOLEJNOŚĆ okna odpowiedzi, co jest widoczne w przerośnięciu priorytetu).
  const a = stol();
  assert.equal(execute(a, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok, true);
  // Okno odpowiedzi obrońcy (M172/C) → pass → atakujący domyka obrażenia.
  assert.equal(execute(a, { type: 'pass_priority', playerId: 'p2' }).ok, true, 'obrońca dostaje okno i pasuje');
  assert.equal(execute(a, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok, true,
    'obrażenia rozstrzygnięte (droga A)');

  const b = stol();
  assert.equal(execute(b, { type: 'pass_priority', playerId: 'p2' }).ok, true,
    'obrońca ma prawo spasować zamiast deklarować brak bloków (M255/F)');
  assert.equal(execute(b, { type: 'pass_priority', playerId: 'p1' }).ok, true,
    'pełna runda passów wyprowadza silnik z deklaracji blokujących');
  assert.equal(b.turn.step, 'combat_damage', 'passy prowadzą tam, dokąd prowadzi deklaracja pustych bloków');
  assert.equal(execute(b, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok, true,
    'obrażenia rozstrzygnięte (droga B)');

  assert.equal(obrazPoWalce(b), obrazPoWalce(a),
    'obie drogi muszą kończyć się identycznie — inaczej nie wolno ich składać do no-opa');
  assert.equal(state2(a).players[1].life, 17, 'obie drogi realnie zadają 3 obrażenia (test nie jest próżniowy)');
  assert.equal(state2(b).players[1].life, 17, 'to samo po drodze B');
});

test('projekcja walki istnieje — bez niej bramka milczałaby zamiast mierzyć', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'atk', instanceId: 'i-atk', cardId: 'x-test', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set('atk', Object.freeze({ ...state.objects.get('atk'), summoningSickness: false }));
  const bot = createHeuristicBot({ seed: 3 });
  const view = playerView(state, 'p1');
  bot.chooseCommand(view);
  const wpis = bot.trace().at(-1);
  // Kandydaci `attack[]` i `attack[atk]` (albo sam pass) muszą mieć projekcję,
  // bo na niej trzyma się klasyfikacja; regresja w tieProjection nie może
  // wyciszyć bramki przez „brak danych".
  assert.ok(wpis.options.some((o) => o.cmd.startsWith('attack[')), `w ofercie jest atak: ${JSON.stringify(wpis.options)}`);
  if (wpis.tie) {
    assert.ok(wpis.tie.every((t) => t.proj), 'każdy ex aequo wariant walki ma projekcję');
  }
});

test('grzechotka audytu: remisy rozstrzygalne nie rosną ponad stan przejrzany', () => {
  const { global, rows } = audytRemisow({ pary: [
    ['ravnica', 'innistrad-wu'], ['dominaria-brg', 'mirrodin-wu'], ['tarkir-bg', 'warhammer-brg'],
    ['wiedzmin', 'tarkir-bg'], ['srodziemie', 'theros'], ['kaladesh', 'zendikar'],
    ['dominaria-wu', 'worek-mroczny'],
  ], gry: 1 });
  const dla = (k) => rows.find((r) => r.kind === k) ?? { rozroznialne: 0, akcyjne: 0, noOp: 0 };
  const lad = dla('play_land'); const atak = dla('attack'); const blok = dla('block');

  // Naprawa z tury 5 pozostaje zamknięta: zero remisów lądu przy różnych danych.
  assert.equal(lad.rozroznialne, 0, 'przeoczone remisy przy wyborze lądu');
  // Klasyfikacja no-opów musi działać (inaczej „30%" straszy, a nic nie znaczy).
  assert.ok(global.tieNoOp > 100,
    `pary „brak akcji" silnika są liczone osobno (jest ${global.tieNoOp})`);
  assert.equal(lad.noOp, 0, 'play_land nie ma no-opów — pojawienie się znaczy, że oferta silnika się zmieniła');
  // Przejrzane i uznane za politykę: `block` — trade za obrażenia
  // nieśmiertelne (kara za NIEblokowanie żyje tylko pod presją śmiertelną),
  // `attack` — wymiana „+1 obrażenia za jednego stworą" jest w modelu
  // neutralna z definicji. Sufity są PER KIND i są sufitami, nie pinami:
  // liczby zależą od trajektorii partii, więc każda zmiana wag zmienia
  // rozkład pozycji. Po świadomej regeneracji golden-mastera przykłady trzeba
  // PRZEJRZEĆ i podnieść próg ręcznie — nie automatycznie.
  const opis = [atak, blok, lad].flatMap((r) => r.przyklady.filter((x) => typeof x === 'string'));
  assert.ok(atak.rozroznialne <= 4, `attack groźb: ${atak.rozroznialne}\n${opis.join('\n')}`);
  // M291 (tura 11): sufit 4 → 5. Atrybucja ZMIERZONA, nie zgadywana: ten sam
  // audyt na `f6a5459` (sprzed tury 11) daje block 4 / attack 4 / tieNoOp 130, na
  // `358ee35` (tylko M290, talie bez zmian) daje IDENTYCZNE 4/4/130, a w drzewie z
  // nową kartą (M291, `decks/ravnica.txt` +1 kopia) wypada block 5 / tieNoOp 133.
  // Czyli dokładka NIE pochodzi z nowej wagi equipu, tylko z innego rozdania
  // Ravnicy. Przejrzany przykład: `ravnica|innistrad-wu seed 4007 p1 tura 27` —
  // pozycje różnią się liczbą blokujących (1 vs 2) przy `ofiary: 0`, czyli ten sam
  // polityczny klasyk z nagłówka pliku: nieśmiertelna wymiana, za którą bot SLUSZNIE
  // nie płaci. Dlatego podnosimy sufit o 1 i zapisujemy przyczynę, a nie „bo test
  // czerwony”.
  assert.ok(blok.rozroznialne <= 5, `block groźb: ${blok.rozroznialne}\n${opis.join('\n')}`);
  // Klasy z projekcją wartości (tura 6): tu zero jest osiągalne i wymagane —
  // różnica kosztu many albo korpusu MUSI przechodzić na wynik.
  for (const nazwa of ['cast_permanent', 'cast_spell', 'activate_ability']) {
    const r = dla(nazwa);
    assert.equal(r.rozroznialne, 0,
      `${nazwa}: remis przy różnych danych wyceny (przeoczenie):\n`
      + `${r.przyklady.filter((x) => typeof x === 'string').join('\n')}`);
  }
  // Grzechotka nie może być ślepa: te klasy muszą mieć w ogóle remisy akcyjne.
  assert.ok(atak.akcyjne + blok.akcyjne >= 6,
    `remisy akcyjne w walce zniknęły (${atak.akcyjne}/${blok.akcyjne}) — sprawdź, czy projekcja nie przestała działać`);
});
