import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { rulesText } from '../src/table/render.js';
import { describeGameEvent, TRIGGER_EVENT_LABELS } from '../src/table/session.js';
import { costSymbols } from '../src/table/mana-icons.js';

// F9: żywe partie 20260929/30. Kafel Spellbomby obiecywał darmowe dobranie,
// Forebear tracił biały pip, a koszt Spire był opisany jako automatyczny.
const registry = createCardRegistry();
function text(cardId, controllerId = 'p1', abilities = null) {
  const card = registry.get(cardId);
  assert.ok(card);
  return rulesText({ cardId, controllerId, abilities: abilities ?? card.abilities, keywords: [] });
}
const helpers = { nameOf: (id) => registry.get(id)?.name ?? id, nameOfObject: (id) => id };

for (const [card, cost] of [
  ['panic-spellbomb', '{R}'], ['horizon-spellbomb', '{G}'],
  ['descendant-of-storms', '{1}{W}'], ['furious-forebear', '{1}{W}'],
]) {
  test(`LIVE/F9: ${card} pokazuje pełny koszt i warunkowy skutek`, () => {
    const line = text(card);
    assert.ok(line.includes(`możesz zapłacić ${cost}`), line);
    assert.ok(line.includes('jeśli tak'), line);
    assert.ok(!line.includes('zapłać 2 many'), 'brak drugiej, bezbarwnej kopii kosztu');
  });
}

test('LIVE/F9: Zoraline — WB i 2 życia, każdy koszt tylko raz w obu triggerach', () => {
  const paid = registry.get('zoraline').abilities.filter((a) => a.trigger?.payMana);
  assert.equal(paid.length, 2);
  for (const ability of paid) {
    const line = text('zoraline', 'p1', [ability]);
    assert.ok(line.includes('możesz zapłacić {W}{B} i 2 życia; jeśli tak'), line);
    assert.equal((line.match(/zapła/gi) ?? []).length, 1, 'meta + nogi efektu nie dublują ceny');
    assert.match(line, /wróć permanent/);
  }
});

test('LIVE/F9: płatny trigger karty wroga nazywa kontrolera, nie gracza', () => {
  const line = text('horizon-spellbomb', 'p2');
  assert.ok(line.includes('kontroler może zapłacić {G}'), line);
  assert.ok(!line.includes('możesz zapłacić'), line);
});

test('LIVE/F9: Rupture Spire to wybór zapłaty albo poświęcenia, nie automat', () => {
  const line = text('rupture-spire');
  assert.match(line, /zapłać \{1\} albo .*poświęć/);
  assert.ok(!line.includes('automatyczna'), line);
});

test('LIVE/F9: inwentarz wszystkich rzeczywistych płatnych triggerów zachowuje pipy', () => {
  let checked = 0;
  for (const card of registry.all()) for (const ability of card.abilities ?? []) {
    if (!(ability.trigger?.payMana > 0)) continue;
    const line = text(card.id, 'p1', [ability]);
    assert.ok(line.includes(costSymbols(ability.trigger.payMana, ability.trigger.payColors)), `${card.id}: ${line}`);
    if (!ability.trigger.sacrificeIfUnpaid) assert.ok(line.includes('jeśli tak'), `${card.id}: ${line}`);
    checked++;
  }
  assert.equal(checked, 7, '6 kart / 7 triggerów w bieżącym katalogu');
});

test('LIVE/F9: zwykły trigger bez kosztu nie dostaje sztucznej płatności', () => {
  const line = text('highland-game');
  assert.ok(!line.includes('zapła'), line);
  assert.ok(line.includes('zyskaj 2'), line);
});

test('LIVE/F9: gałąź celowanego ETB damage też zachowuje warunek zapłaty (nośnik testowy)', () => {
  const line = rulesText({ controllerId: 'p1', abilities: [{ type: 'triggered',
    trigger: { event: 'enter_battlefield', payMana: 2, payColors: ['R'], requiresTarget: { type: 'creature' } },
    effect: [{ type: 'pay_mana', amount: 2 }, { type: 'damage', amount: 3 }],
  }] });
  assert.ok(line.includes('możesz zapłacić {1}{R}; jeśli tak'), line);
  assert.match(line, /zada 3 obrażenia celowi/);
  assert.equal((line.match(/zapła/gi) ?? []).length, 1);
});

test('LIVE/F9: same nogi płatności bez metadanych triggera nie znikają', () => {
  const line = rulesText({ controllerId: 'p1', abilities: [{ type: 'triggered',
    trigger: { event: 'dies' }, effect: [{ type: 'pay_mana', amount: 2 }, { type: 'pay_life', amount: 1 }],
  }] });
  assert.match(line, /zapłać 2 many/); assert.match(line, /zapłać 1 życia/);
});

test('LIVE/F9: ogólna etykieta dies nie nazywa Spellbomby stworzeniem', () => {
  assert.ok(!TRIGGER_EVENT_LABELS.dies.includes('stwora'));
  const line = describeGameEvent({ type: 'ability_triggered', cardId: 'horizon-spellbomb', trigger: 'dies' }, helpers);
  assert.match(line, /Horizon Spellbomb.*grobu.*pola bitwy/);
});

test('LIVE/F9: cannot_pay w logu wyjaśnia brak płatności, nie nieaktualne cele', () => {
  const line = describeGameEvent({ type: 'trigger_resolved', cardId: 'horizon-spellbomb', noEffect: true, reason: 'cannot_pay' }, helpers);
  assert.match(line, /koszt/); assert.ok(!line.includes('cele nieaktualne'), line);
  const oldReason = describeGameEvent({ type: 'trigger_resolved', cardId: 'highland-game', noEffect: true, reason: 'no_targets' }, helpers);
  assert.match(oldReason, /brak legalnych celów/);
});

test('LIVE/F9: liczba endure w skutku jest konkretna, zmienne X zostaje zmienne', () => {
  assert.match(text('descendant-of-storms'), /endure 1/);
  assert.match(rulesText({ controllerId: 'p1', spell: { timing: 'instant', effects: [{ type: 'endure_x', amount: 'x' }] } }), /endure X/);
});
