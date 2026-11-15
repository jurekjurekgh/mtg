// Audyt PR #185 — F-17 (NISKI, UI): opis `must_block_enchanted` bez polskich
// znaków i z literałem progu.
//
// Pomiar PRZED (`.arena/probe-e212a.mjs`, stan 6954146) pokazał WIĘCEJ, niż
// opisał raport:
//   rulesText(Seton's Desire)                     === ""   ← kafelek MILCZY
//   describeSpellEffects(must_block_enchanted)    === "przy 7+ kartach w grobie:
//     wszystkie stworzenia zdolne do blokowania zaklętego stwora musza go blokowac"
//     — bez „muszą"/„blokować", a próg 7 jest LITERAŁEM (deskryptor z
//     `minGraveyardCards: 7` nic nie zmienia — inna karta z progiem 5 dostałaby
//     fałszywy opis).
// Przyczyna pustego kafla: `describeStatic` (render.js) opisuje pump/keywords/
// warunki/mustAttack…, ale NIE `ability.effect` — a Seton's Desire to zdolność
// STATYCZNA z samym efektem (`condition: { minGraveyardCards: 7 }` +
// `effect: { type: 'must_block_enchanted' }`). Gałąź `must_block_enchanted`
// w `describeEffect` dla tej karty w ogóle nie była osiągana.
// Ta sama klasa (M73d/M138: pusty opis na kaflu) dotyczy jeszcze dwóch kart —
// `glitch-ghost-surveyor` i `leonin-surveyor` (statyczne `start_engines`).
// Zasada: ADR 0002 (wartość z deskryptora, nie literał w prezenterze),
// M127/L29 (poprawna polszczyzna), L24 (skutek bez śladu nie istnieje).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { describeSpellEffects, rulesText } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const infoOf = (cardId) => {
  const def = REGISTRY.get(cardId);
  return { keywords: def.keywords ?? [], abilities: def.abilities ?? [], controllerId: 'p1', name: def.name };
};
const liniaSetons = () => rulesText(infoOf('setons-desire'));

test('F-17/1: kafelek Seton\'s Desire nie milczy — zdolność statyczna z samym efektem jest opisana', () => {
  const text = liniaSetons();
  assert.ok(text.length > 0,
    'rulesText pusty: zdolność statyczna z effect (bez pump/keywords/mustAttack) nie była opisywana w ogóle');
  assert.match(text, /musz(ą|a) .*blokowa(ć|c)/i, `skutek Threshold w linii reguł: ${JSON.stringify(text)}`);
});

test('F-17/2: próg pochodzi z DANYCH karty, nie z literału w prezenterze (ADR 0002)', () => {
  // Seton's Desire: Oracle „Threshold — As long as there are seven or more cards
  // in your graveyard, all creatures able to block enchanted creature do so."
  assert.match(liniaSetons(), /7/, `próg 7 z condition.minGraveyardCards karty: ${JSON.stringify(liniaSetons())}`);
  // Próg ma JEDNO źródło (L41): warunek z `describeStatic` i opis efektu nie
  // mogą go drukować dwa razy („przy 7+ … : przy 7+ …").
  assert.equal((liniaSetons().match(/7/g) ?? []).length, 1,
    `próg wydrukowany więcej niż raz: ${JSON.stringify(liniaSetons())}`);
  // Dowód, że literał zniknął: ta sama etykieta z innym progiem w deskryptorze
  // musi wydrukować INNY próg (przed naprawą obie dawały „7+").
  const zProgiem5 = rulesText({
    controllerId: 'p1',
    abilities: [{ type: 'static', condition: { minGraveyardCards: 5 }, effect: { type: 'must_block_enchanted' } }],
  });
  assert.match(zProgiem5, /5/, `próg z deskryptora (5): ${JSON.stringify(zProgiem5)}`);
  assert.ok(!zProgiem5.includes('7'), `próg 7 wpisany na sztywno mimo danych 5: ${JSON.stringify(zProgiem5)}`);
});

test('F-17/3: polszczyzna etykiety — „muszą go blokować", nie „musza go blokowac" (M127/L29)', () => {
  const text = describeSpellEffects({ effects: [{ type: 'must_block_enchanted' }] });
  assert.ok(!/musza|blokowac/.test(text), `etykieta bez polskich znaków: ${JSON.stringify(text)}`);
  assert.match(text, /muszą/, `poprawna forma czasownika: ${JSON.stringify(text)}`);
  assert.match(text, /blokować/, `poprawna forma bezokolicznika: ${JSON.stringify(text)}`);
});

test('F-17/4: ta sama klasa — statyczne `start_engines` też nie zostawia pustego kafla', () => {
  for (const cardId of ['glitch-ghost-surveyor', 'leonin-surveyor']) {
    const text = rulesText(infoOf(cardId));
    assert.ok(text.length > 0, `${cardId}: rulesText pusty`);
    assert.match(text, /start your engines/i, `${cardId}: statyczna zdolność start_engines bez opisu: ${JSON.stringify(text)}`);
  }
});
