// M202/N1 — strażnik celu wydania many (L48 + L39).
//
// Mana ograniczona drukiem (Powerstone: „This mana can't be spent to cast
// a nonartifact spell”) jest wyłączana WYŁĄCZNIE przy rzucie czaru
// nie-artefaktowego. Rozstrzyga o tym `purpose` przekazywany do
// `producibleMana`/`spendMana`, a ścieżek rzutów czarów jest w silniku
// kilkanaście (castSpell, castFireball, castEscape, flashback, adventure,
// cleave, modal, aura, madness, permanent…). Pominięcie `purpose` w którejkolwiek
// z nich nie wywraca żadnego testu jednostkowego — objawia się dopiero tym, że
// oferta i walidacja liczą manę inaczej (bot dostaje reject albo gracz płaci
// maną, którą druk zabrania). Stąd strażnik źródła: KAŻDA funkcja rzucająca
// czar albo wyliczająca oferty rzutów musi pytać o manę z jawnym celem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { producibleMana, addMana } from '../src/engine/resources.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

/** Granice funkcji top-level w pliku (takie samo cięcie, jakie robi przeglądarka). */
function functionRanges(source) {
  const lines = source.split('\n');
  const starts = [];
  lines.forEach((line, index) => {
    const match = /^(?:export )?function (\w+)/.exec(line);
    if (match) starts.push({ index, name: match[1] });
  });
  return starts.map((entry, i) => ({
    name: entry.name,
    body: lines.slice(entry.index, i + 1 < starts.length ? starts[i + 1].index : lines.length).join('\n'),
  }));
}

const SPELL_FILES = ['src/engine/spells.js', 'src/engine/resources.js'];
/** Nazwy oznaczające ścieżkę RZUTU CZARU (walidacja albo oferta). */
const isSpellPath = (name) => /^cast[A-Z]/.test(name) || /Casts$/.test(name);

test('M202/N1 (strażnik): każda ścieżka rzutu czaru pyta o manę z jawnym celem wydania', () => {
  const problems = [];
  for (const file of SPELL_FILES) {
    for (const { name, body } of functionRanges(fs.readFileSync(file, 'utf8'))) {
      if (!isSpellPath(name)) continue;
      // Cel wydania bywa trzymany w zmiennej (`const manaPurpose = spellManaPurpose(object)`)
      // — zbieramy takie nazwy, żeby strażnik nie żądał literału w każdym call-sicie.
      const purposeVars = new Set([...body.matchAll(/(?:const|let)\s+(\w+)\s*=\s*spellManaPurpose\(/g)].map((m) => m[1]));
      const hasPurpose = (args) => args.includes('spellManaPurpose')
        || [...purposeVars].some((variable) => new RegExp(`\\b${variable}\\b`).test(args));
      // 1) płatność bez celu wydania = mana ograniczona policzona jak zwykła
      for (const call of body.matchAll(/\bspendMana\(([^;]*)\);/g)) {
        if (!hasPurpose(call[1])) problems.push(`${file} → ${name}: spendMana bez spellManaPurpose`);
      }
      // 2) budżet liczony „dla nikogo” (2 argumenty) — to samo rozjeżdża ofertę
      if (/\bproducibleMana\(state, playerId\)/.test(body)) {
        problems.push(`${file} → ${name}: producibleMana bez celu wydania`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('M202/N1 (strażnik): plot i suspend NIE są rzutem czaru — mana ograniczona płaci', () => {
  // Anty-over-fix w drugą stronę: gdyby ktoś „uprościł” regułę do „mana
  // ograniczona nigdy”, strażnik powyżej by tego nie złapał (plotCard nie
  // pasuje do wzorca nazwy) — pinujemy zachowanie wprost.
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  addMana(state, 'p1', 1, { colors: [], spendOnly: 'artifact' });
  assert.equal(state.players[0].artifactOnlyMana, 1, 'mana oznaczona jako ograniczona');
  assert.equal(producibleMana(state, 'p1'), 1, 'płatność nie-czarowa: dostępna');
  assert.equal(producibleMana(state, 'p1', null, { castingSpell: true, artifactSpell: true }), 1, 'artefakt: dostępna');
  assert.equal(producibleMana(state, 'p1', null, { castingSpell: true, artifactSpell: false }), 0, 'czar nie-artefaktowy: niedostępna');
});

test('M202/N1 (strażnik): zdolność aktywowana jest oferowana i wykonalna za manę ograniczoną', () => {
  // Zachowanie end-to-end (nie rachunki wewnętrzne): gracz z Powerstone jako
  // jedynym źródłem many może aktywować zdolność za {1}.
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  addObject(state, {
    id: 'dev', instanceId: 'i-dev', cardId: 'synthetic-dev', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], subtypes: [], colors: [], manaCost: 0,
    abilities: [{ type: 'activated', cost: { mana: 1 }, effect: [{ type: 'gain_life', amount: 2 }] }],
  });
  addMana(state, 'p1', 1, { colors: [], spendOnly: 'artifact' });
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  assert.ok(offer, 'zdolność za {1} jest oferowana z many ograniczonej');
  assert.equal(execute(state, offer).ok, true, 'i nie jest odrzucana przez walidację');
});
