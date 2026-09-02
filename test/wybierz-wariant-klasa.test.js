import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { choiceGroupTitle, choiceRequestType } from '../src/table/render.js';

/**
 * KLASA L102/1 (trzecie trafienie w dwóch sesjach): klucz grupy
 * (`choiceRequestGroupKey`) i tytuł (`choiceGroupTitle`) to DWIE listy
 * warunków opisujące tę samą rodzinę decyzji. Gdy komenda tworzy grupę, ale
 * nie ma ani gałęzi tytułu, ani deskryptora, gracz widzi generyczne
 * „Wybierz: Wariant (N opcje)".
 *
 * Znalezione Żywym Testerem: resolve_escape_exile (theros/warhammer-wu s308),
 * resolve_look_top_choice (tarkir-wur/innistrad-brg s316),
 * resolve_reveal_exile_hand (dominaria-brg/dominaria-wu s414). Po trzecim
 * przypadku zamykamy KLASĘ: każdy typ komendy, który `choiceRequestGroupKey`
 * mapuje na stały klucz, MUSI mieć deskryptor fallbacku — nigdy „Wariant".
 */

const SESSION = { nameOf: (id) => `Karta(${id})`, nameOfObject: (id) => `Karta(${id})` };
const EMPTY_VIEW = {
  zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [] },
  players: [],
};

/** Typy komend, które choiceRequestGroupKey mapuje na stały klucz (regexem po źródle). */
function fixedGroupKeyTypes() {
  const src = fs.readFileSync('src/table/render.js', 'utf8');
  const body = src.match(/export function choiceRequestGroupKey\(command\) \{([\s\S]*?)\n\}\n/)[1];
  return [...new Set(
    [...body.matchAll(/command\.type === '([a-z_0-9]+)'\) return '[a-z_0-9]+'/g)].map((m) => m[1]),
  )].sort();
}

test('KLASA: każda komenda tworząca grupę ma deskryptor tytułu (nigdy „Wariant")', () => {
  const brak = [];
  for (const type of fixedGroupKeyTypes()) {
    const requestType = choiceRequestType([{ type }]);
    const title = choiceGroupTitle(
      { type: requestType, options: [{ type }] },
      SESSION,
      EMPTY_VIEW,
    );
    if (/Wariant/.test(title)) brak.push(`${type} (request.type=${requestType})`);
  }
  assert.deepEqual(
    brak, [],
    'Te typy komend spadają na generyczne „Wybierz: Wariant" — dopisz deskryptor '
    + 'do CHOICE_GROUP_COMMAND_DESCRIPTORS / CHOICE_GROUP_TYPE_DESCRIPTORS '
    + '(albo gałąź tytułu):\n' + brak.join('\n'),
  );
});

test('warunek wstępny: skan widzi stałokluczowe typy grupy', () => {
  const types = fixedGroupKeyTypes();
  assert.ok(types.length >= 50, `znaleziono ${types.length} typów — skan musi obejmować rodzinę`);
  assert.ok(types.includes('resolve_reveal_exile_hand'), 'typ znaleziska jest objęty skanem');
  assert.ok(types.includes('resolve_fabricate'), 'typ fabricate jest objęty skanem');
});

test('resolve_reveal_exile_hand: grupa nazywa źródło i czynność, nie „Wariant"', () => {
  const view = {
    ...EMPTY_VIEW,
    pendingRevealExile: { sourceCardId: 'dreams-of-steel-and-oil' },
  };
  const session = { nameOf: (id) => (id === 'dreams-of-steel-and-oil' ? 'Dreams of Steel and Oil' : String(id)) };
  const request = {
    type: 'command',
    options: [
      { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'g1' },
      { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'g2' },
    ],
  };
  const title = choiceGroupTitle(request, session, view);
  assert.doesNotMatch(title, /Wariant/, 'generyczny fallback to objaw braku deskryptora');
  assert.match(title, /Dreams of Steel and Oil/, 'tytuł nazywa kartę-źródło decyzji');
  assert.match(title, /do wygnania/, 'tytuł opisuje czynność');
});
