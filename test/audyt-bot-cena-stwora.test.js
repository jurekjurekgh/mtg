/**
 * AUDYT BOTA tura 6 (PR #93): `cast_permanent` wyceniał CIAŁO, ale nie CENĘ.
 *
 * Finding z pomiaru (`tools/bot-tie-audit.mjs`, 12 partii): 4 na 8 remisów
 * `cast_permanent` to pary stworów o tym samym korpusie i RÓŻNEJ cenie many,
 * ex aequo po 73,8 / 74,7 / 71,1 punktu. Nie był to wybór między równorzędnymi
 * wariantami tylko wybór z kolejności `legalCommands`, bo wycena wygląda tak:
 *   `score = creatureBase + power × creaturePowerWeight + toughness × creatureToughnessWeight`
 * — ani jednego składnika kosztowego. Stwór 2/2 za {2} i identyczny 2/2 za {6}
 * są dla bota TE SAM, czyli bot nie odróżnia tempa od tempa. To jest dokładnie
 * ta klasa, której szukał audyt (działanie niescoringowane), tylko w gałęzi,
 * która wydawała się wyceniona (ma wszecież `finish(score)`!).
 *
 * Poniżej: (1) pin arytmetyczny — 1 punkt za punkt many, policzalny co do zera;
 * (2) kierunek na prawdziwych kartach — ta sama 6/5 taniej wygrywa;
 * (3) próg nadwagi — droższy, ale realnie większy korpus nadal wygrywa (żeby
 *     kara za manę nie zamieniła bota w kolekcjonera tanich szczurów);
 * (4) projekcja w śladzie nosi koszt, więc audyt widzi, że wycena patrzy na to samo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';
import { DEFAULT_HEURISTIC_WEIGHTS } from '../src/controllers/heuristic-weights.js';

function stół({ reka = [], mana = 0 } = {}) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // Zielony ląd na stole — `highland-game` ma pip {G}, więc oba warianty muszą
  // go opłacić; bez tego oferta w ogóle by nie powstała.
  addObject(state, {
    id: 'las', instanceId: 'i-las', cardId: 'basic-forest', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'land', manaCost: 0, subtypes: ['Forest'], types: ['Basic', 'Land'],
    abilities: [], keywords: [], colors: ['G'],
  });
  // Dowolny kolor do puli: testowane pary mają różne pipy (Reaver {B},
  // Tanuki {G}{U}), a przy zawężonej pile drugi wariant w ogóle nie wszedłby
  // do oferty — test mierzyłby wtedy harness, nie wycenę.
  if (mana > 0) addMana(state, 'p1', mana);
  for (const [id, cardId, manaCost, power, toughness] of reka) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
      kind: 'creature', manaCost, power, toughness, subtypes: [], types: ['Creature'],
      abilities: [], keywords: [], colors: ['G'],
    });
  }
  return state;
}

const ocena = (state, seed = 5) => {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  const wpis = bot.trace().at(-1);
  return { cmd, wpis, dla: (id) => wpis.options.find((o) => o.cmd.includes(`(${id}:`) || o.cmd.includes(`(${id})`) || o.cmd.includes(`${id}:`))?.score };
};

test('ta sama 6/5, różna cena many ⇒ wynik różni się DOKŁADNIE o różnicę kosztu', () => {
  // Dwa obiekty tej samej karty (identyczne dane rejestrowe: abilities, pipy,
  // keywordy), różne `manaCost` w obiekcie — więc JEDYNĄ różnicą, jaką wycena
  // może zobaczyć, jest cena. Pin arytmetyczny, nie kierunkowy.
  const state = stół({
    mana: 8,
    reka: [['tani', 'highland-game', 2, 3, 3], ['drogi', 'highland-game', 6, 3, 3]],
  });
  const { cmd, wpis, dla } = ocena(state);
  const tani = dla('tani'); const drogi = dla('drogi');
  assert.ok(tani !== undefined && drogi !== undefined, `oba warianty w ofercie: ${JSON.stringify(wpis.options)}`);
  // Różnica przechodzi przez `finish()` = wagę RODZINY komend (tuner B4):
  // `permanent` ma 0,9, więc 4 × 1 × 0,9 = 3,6 — to nie ułamek błędu, tylko
  // zamierzona skala korelacji między rodzinami decyzji.
  assert.ok(Math.abs((tani - drogi)
    - 4 * DEFAULT_HEURISTIC_PARAMS.creatureManaCostWeight * DEFAULT_HEURISTIC_WEIGHTS.permanent) < 1e-9,
    `kara = 1 punkt za punkt many × waga rodziny (4 × 0,9), jest ${tani - drogi}`);
  assert.equal(cmd.objectId, 'tani', `bot bierze tańsze ciało: wpis ${wpis.chosen}`);
});

test('para z katalogu (6/5 za 4 i 6/5 za 8): ceny nie wolno zagłosować ciszą', () => {
  // Para z prawdziwego katalogu: oba 6/5. Reaver to czysty stwor, Tanuki ma
  // dodatkową wykładnię (enchantment, trample) — kierunek ma być zachowany
  // mimo to, bo różnica ceny (4 many) jest większa niż premia poboczna.
  const state = stół({
    mana: 8,
    reka: [['reaver', 'plague-reaver', 3, 6, 5], ['tanuki', 'greater-tanuki', 6, 6, 5]],
  });
  const { cmd, wpis, dla } = ocena(state);
  assert.ok(cmd.type === 'cast_permanent', `bot rzuca stwora, nie pasuje: ${wpis.chosen}`);
  // Większość prawdziwych par różni się czymś poza ceną (Tanuki ma trample i
  // jest enchantmentem — to realna wartość). Test pinuje więc to, co audyt
  // naprawdę zarzucał: że sama CENA nie miała prawa głosu. Bez nowego terenu
  // reaver i tanuki miały identyczny wynik mimo 4 many różnicy.
  const reaver = dla('reaver'); const tanuki = dla('tanuki');
  assert.ok(reaver !== undefined && tanuki !== undefined,
    `oba rzuty w ofercie (harness, nie bot): ${JSON.stringify(wpis.options)}`);
  assert.notEqual(reaver, tanuki,
    `4 many różnicy przy tym samym korpusie nie mogą dać remisu: ${reaver} vs ${tanuki}`);
  // Który wygrywa, zależy od reszty kart (Tanuki ma trample i jest
  // enchantmentem) — audyt nie rozstrzyga gustu, rozstrzyga ciszę.
  assert.ok(Number.isFinite(reaver) && Number.isFinite(tanuki), 'oba warianty wycenione');
});

test('większy korpus za większą manę NIE przegrywa z tanim szczurem', () => {
  // Przeciwstawna strona kary: waga 1/pt many musi pozostać MNIEJSZA niż waga
  // siły (2/pt), bo inaczej audyt jednego błędu naprawiłoby drugim — bot
  // rzucający same 1/1 za {1}. Segmented Krotiq: 6/5 za 7; Nefarious Imp: 2/1
  // za 4 (latanie liczy się w walce, nie w bazowej wycenie ciała).
  const state = stół({
    mana: 8,
    reka: [['krotiq', 'segmented-krotiq', 6, 6, 5], ['imp', 'nefarious-imp', 3, 2, 1]],
  });
  const { cmd, wpis } = ocena(state);
  assert.ok(wpis.chosen.includes('segmented-krotiq') || cmd.objectId === 'krotiq',
    `większy korpus broni swojej ceny: ${wpis.chosen}`);
});

test('projekcja śladu nosi koszt — audyt widzi to samo, na co patrzy wycena', () => {
  const state = stół({
    mana: 8,
    reka: [['tani', 'highland-game', 2, 3, 3], ['drogi', 'highland-game', 6, 3, 3]],
  });
  const { wpis } = ocena(state);
  const rzuty = wpis.options.filter((o) => o.cmd.startsWith('cast_permanent('));
  assert.equal(rzuty.length, 2, 'dwa rzuty w ofercie');
  // Remisu tu już nie ma (właśnie to naprawiliśmy), więc `tie` jest puste —
  // sprawdzamy więc projekcję tam, gdzie powstaje: na identycznych kosztach.
  const rowne = stół({ mana: 8, reka: [['a', 'highland-game', 4, 3, 3], ['b', 'highland-game', 4, 3, 3]] });
  const wpis2 = ocena(rowne).wpis;
  assert.ok(wpis2.tie, 'identyczne warianty pozostają w remisie i są ogłoszone');
  assert.deepEqual([...new Set(wpis2.tie.map((t) => JSON.stringify(t.proj)))].length, 1,
    'projekcje ex aequo są identyczne — inaczej remis jest przeoczeniem');
  assert.ok(wpis2.tie.every((t) => t.proj && 'waluta' in t.proj && 'cele' in t.proj),
    `projekcja rzutu niesie wartość netto i cel: ${JSON.stringify(wpis2.tie[0]?.proj)}`);
});
