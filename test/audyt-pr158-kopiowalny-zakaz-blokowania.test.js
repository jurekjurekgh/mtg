// Audyt PR #158 (sesja 2026-10-08c), znalezisko F-1: kopiowalny zakaz
// blokowania ginie w KAŻDEJ ścieżce kopiowania.
//
// Batch 64 (PR #158) wprowadził pierwszy w katalogu WYDRUKOWANY zakaz
// blokowania na karcie — Bog Hoodlums „This creature can't block"
// (`cantBlock` w definicji → `cantBlockPrinted` na obiekcie). Łańcuch L21
// został domknięty dla zwykłej partii (karta → materialize → createGameObject
// → addObject/ADD_OBJECT_FIELDS → installDeck → `creatureCantBlock`), ale
// ścieżki KOPIOWANIA (L47: „kopiowalne cechy to WSZYSTKIE drukowane
// deskryptory, nie tylko P/T") nie przenoszą tej cechy.
//
// Podstawa regułowa (dosłowny tekst, CR effective 2026-09-25, mirror
// nwgarne/mtg-data, SHA-256 8d860e45…; ADR 0030):
//
//  • CR 707.2: „When copying an object, the copy acquires the copiable values
//    of the original object's characteristics […]. The copiable values are the
//    values derived from the text printed on the object (that text being name,
//    mana cost, color indicator, card type, subtype, supertype, rules text,
//    power, toughness, and/or loyalty) […]."
//  • CR 707.2a: „A copy acquires the abilities of the object it's copying
//    because those values are derived from its rules text."
//  • CR 509.1b: „The defending player checks each creature they control to see
//    whether it's affected by any restrictions (effects that say a creature
//    can't block, or that it can't block unless some condition is met). If any
//    restrictions are being disobeyed, the declaration of blockers is illegal."
//  • CR 702.175a (Offspring): token-kopia 1/1 dziedziczy druk źródła.
//  • CR 702.128a (Embalm): token jest kopią karty z nadpisaniami z tekstu.
//
// Zakaz blokowania to STATYCZNA reguła wydrukowana w tekście karty (nie
// słowo kluczowe), więc jest wartością kopiowalną — kopia musi go nieść.
//
// Nosicieli w katalogu jest po jednym na ścieżkę (Jwari Shapeshifter — enter as
// copy, Rust-Shield Rampager — offspring, Moonlit Meditation — token-kopia,
// karta z embalmem — create_token_copy_of_source) i żaden nie jest Bog
// Hoodlumsem, więc z DZISIEJSZYM katalogiem rozjazd jest nieosiągalny. To
// dokładnie sytuacja, którą L47/L52 każą domknąć ZANIM wejdzie karta, która go
// odsłoni — stąd testy na kartach syntetycznych (ADR 0029: katalog rośnie
// wyłącznie z kolekcji właściciela) podanych wprost w `pending`, wzorzec
// `test/audyt-pr106-enter-as-copy-tapped.test.js` (F3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { replaceObject, creatureCantBlock } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();

function put(s, id, cardId, { zone = 'battlefield', controllerId = 'p1', extra = {} } = {}) {
  const d = registry.get(cardId);
  assert.ok(d, `karta ${cardId} istnieje w rejestrze`);
  addObject(s, {
    ...gameObjectDataOf(d),
    types: d.types, keywords: d.keywords, subtypes: d.subtypes ?? [],
    id, instanceId: `i-${id}`, cardId, ownerId: controllerId, controllerId, zone,
    ...extra,
  });
  return s.objects.get(id);
}

function state() {
  const s = createGameState({ seed: 158, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  return s;
}

const nowi = (s, before) => [...s.objects.values()]
  .filter((o) => !before.has(o.id) && o.zone === 'battlefield');

// Kontrola pozytywna bez fixa: druk Bog Hoodlumsa dociera na obiekt zwykłą
// drogą (łańcuch L21 domknięty w PR #158) — bez tego reszta testów mierzyłaby
// brak danych wejściowych, a nie lukę w kopiowaniu (L26/L5).
test('F-1/0: oryginał — wydrukowany zakaz blokowania jest na obiekcie i działa', () => {
  const s = state();
  const hood = put(s, 'hood', 'bog-hoodlums');
  assert.equal(hood.cantBlockPrinted, true, 'druk na obiekcie (PR #158)');
  assert.equal(creatureCantBlock(hood, s), true, 'CR 509.1b — nie może blokować');
});

test('F-1/1: enter as a copy (CR 707.2) — kopia stworu z drukowanym zakazem nie może blokować', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  const hood = put(s, 'hood', 'bog-hoodlums');
  replaceObject(s, s.objects.get('jwari'), { enteringAsCopy: true });
  s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'jwari', candidateIds: ['hood'], restorePriorityTo: null };
  const cmd = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'hood');
  assert.ok(cmd, 'kopia oferowana');
  assert.ok(execute(s, cmd).ok, 'komenda przyjęta (L68)');
  const copy = s.objects.get('jwari');
  assert.equal(copy.power, hood.power, 'kopiowalne P/T przeszło (kontrola ścieżki)');
  assert.ok((copy.subtypes ?? []).includes('Goblin'), 'kopiowalne podtypy przeszły');
  assert.equal(copy.cantBlockPrinted, true,
    'CR 707.2 + 707.2a — drukowany zakaz blokowania jest wartością kopiowalną');
  assert.equal(creatureCantBlock(copy, s), true, 'kopia nie może blokować (CR 509.1b)');
});

test('F-1/2: enter as a copy — kopia stworu BEZ zakazu nie dostaje go (anty-over-fix)', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  put(s, 'legion', 'rotting-legion');
  replaceObject(s, s.objects.get('jwari'), { enteringAsCopy: true });
  s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'jwari', candidateIds: ['legion'], restorePriorityTo: null };
  const cmd = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'legion');
  assert.ok(cmd && execute(s, cmd).ok);
  const copy = s.objects.get('jwari');
  assert.equal(Boolean(copy.cantBlockPrinted), false, 'brak druku = brak zakazu');
  assert.equal(creatureCantBlock(copy, s), false);
});

test('F-1/3: offspring (CR 702.175a) — token-kopia 1/1 dziedziczy drukowany zakaz', () => {
  const s = state();
  const hood = put(s, 'hood', 'bog-hoodlums', { extra: { offspring: { cost: 2, colors: [] } } });
  assert.equal(hood.cantBlockPrinted, true);
  const before = new Set(s.objects.keys());
  applyEffect(s, { type: 'create_offspring_token' }, s.objects.get('hood'), []);
  const tokens = nowi(s, before);
  assert.equal(tokens.length, 1, 'token powstał');
  const token = tokens[0];
  assert.equal(token.power, 1, 'offspring jest zawsze 1/1 (druk P/T nie przechodzi)');
  assert.equal(token.toughness, 1);
  assert.equal(token.cantBlockPrinted, true,
    'CR 702.175a + 707.2 — token-kopia dziedziczy reguły wydrukowane na źródle');
  assert.equal(creatureCantBlock(token, s), true, 'token-kopia nie może blokować (CR 509.1b)');
});

test('F-1/4: embalm (CR 702.128a) — token-kopia karty z drukowanym zakazem nie może blokować', () => {
  const s = state();
  const hood = put(s, 'hood', 'bog-hoodlums', { zone: 'exile' });
  assert.equal(hood.cantBlockPrinted, true, 'druk przeżywa zmianę strefy na wygnanie');
  const before = new Set(s.objects.keys());
  applyEffect(s, { type: 'create_token_copy_of_source', colors: ['W'], addSubtypes: ['Zombie'] }, hood, []);
  const tokens = nowi(s, before);
  assert.equal(tokens.length, 1, 'token powstał');
  const token = tokens[0];
  assert.ok((token.subtypes ?? []).includes('Zombie'), 'nadpisanie z tekstu embalmu działa');
  assert.equal(token.cantBlockPrinted, true, 'CR 702.128a + 707.2 — kopia karty niesie jej druk');
  assert.equal(creatureCantBlock(token, s), true);
});

test('F-1/5: Moonlit Meditation — token-kopia permanentu z drukowanym zakazem nie może blokować', () => {
  const s = state();
  put(s, 'hood', 'bog-hoodlums');
  s.pendingMoonlitChoice = {
    playerId: 'p1',
    enchantedId: 'hood',
    effect: { amount: 1 },
    sourceObjectId: 'moon',
    targets: [],
    restorePriorityTo: null,
  };
  const before = new Set(s.objects.keys());
  const res = execute(s, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true });
  assert.equal(res.ok, true, `komenda przyjęta: ${JSON.stringify(res.error ?? null)}`);
  const tokens = nowi(s, before);
  assert.equal(tokens.length, 1, 'token-kopia powstała');
  const token = tokens[0];
  assert.equal(token.power, 4, 'P/T oryginału (kontrola ścieżki)');
  assert.equal(token.cantBlockPrinted, true, 'CR 707.2 — kopiowalny druk przechodzi na token-kopię');
  assert.equal(creatureCantBlock(token, s), true);
});

test('F-1/6: create_copy_token (CR 707.2) — token-kopia artefaktu z drukowanym zakazem niesie go', () => {
  const s = state();
  // Artefakt syntetyczny: katalog nie ma artefaktu z drukowanym zakazem
  // blokowania (ADR 0029 — test nie dodaje karty do katalogu).
  addObject(s, {
    id: 'art', instanceId: 'i-art', cardId: 'synthetic-cant-block-artifact',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact',
    manaCost: 2, types: ['Artifact'], colors: [], abilities: [], keywords: [], subtypes: [],
    power: 2, toughness: 2, cantBlockPrinted: true,
  });
  const before = new Set(s.objects.keys());
  applyEffect(s, { type: 'create_copy_token' },
    { id: 'assembler', cardId: 'cogwork-assembler', controllerId: 'p1' }, ['art']);
  const tokens = nowi(s, before);
  assert.equal(tokens.length, 1, 'token powstał');
  assert.equal(tokens[0].cantBlockPrinted, true,
    'CR 707.2 — kopiowalne wartości to WSZYSTKIE cechy z druku, nie tylko P/T (L47)');
});
