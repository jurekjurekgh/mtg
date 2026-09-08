// E7/E (zgłoszenie właściciela z testów żywej gry): Makeshift Mauler — rzucenie
// z dodatkowym kosztem „wygnij stwora z cmentarza" nie zostawiało ŚLADU ani
// w modalu „Rozgrywka", ani w logu, gdy czar rzucał CZŁOWIEK (a w logu — także
// przy rzucie bota): gracz nie dowiadywał się, ŻE coś wygnano ani JAKĄ kartę.
//
// Precedens tej samej klasy: M103/D (koszt Escape) — „to jest PŁATNOŚĆ KOSZTU,
// jak mana, która jest widoczna". resources.js emituje `object_moved`
// (cmentarz → wygnanie) z flagą `additionalCost: true`, ale:
//  1) `describeGameEvent` zwracał null (opis miał tylko gałąź `escape` i
//     `bounced`) — log milczał dla OBU graczy;
//  2) `noteBotMove` wycinał object_moved w bramce wczesnej (`!botActing` poza
//     digestami) — modal „Rozgrywka" widział koszt tylko przy rzucie BOTA.
//
// Pin: koszt wygnania z cmentarza jest widoczny w OBU kanałach, z nazwą karty
// (strefy jawne, CR 400.2), niezależnie od tego, kto rzuca czar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function describe(event) {
  return describeGameEvent(event, {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: () => '?',
    isPlayer: (id) => ['p1', 'p2'].includes(id),
  }, {});
}

test('E7/E: log nazywa wygnanie z cmentarza jako dodatkowy koszt (jak Escape — M103/D)', () => {
  const text = describe({
    type: 'object_moved', fromId: 'g1', object: { cardId: 'scorned-villager', controllerId: 'p1' },
    fromZone: 'graveyard', toZone: 'exile', additionalCost: true,
  });
  assert.ok(text, 'dodatkowy koszt widoczny w logu (było: null)');
  assert.match(text, /wygnane/i);
  assert.match(text, /koszt/i);
  assert.match(text, /Scorned Villager/, 'nazwa karty (strefy jawne, CR 400.2)');
});

test('E7/E: modal „Rozgrywka" pokazuje koszt wygnania także przy rzucie CZŁOWIEKA', async () => {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { moveObjectDirectly } = await import('../src/engine/objects.js');
  const { addMana } = await import('../src/engine/resources.js');
  const IWU = parseDeckText(readFileSync(new URL('../decks/innistrad-wu.txt', import.meta.url), 'utf8'), REGISTRY).cardIds;
  const IBR = parseDeckText(readFileSync(new URL('../decks/innistrad-brg.txt', import.meta.url), 'utf8'), REGISTRY).cardIds;
  const session = createSession({ seed: 21, registry: REGISTRY, decks: new Map([[HUMAN_ID, IWU], [BOT_ID, IBR]]) });
  for (;;) {
    const mc = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    if (!mc || !session.apply(mc).ok) break;
  }
  const state = session.state;
  const pick = (cid, ctl) => [...state.objects.values()].find((o) => o.cardId === cid && o.controllerId === ctl && (o.zone === 'library' || o.zone === 'hand'));
  const mauler = pick('makeshift-mauler', HUMAN_ID);
  assert.ok(mauler, 'Makeshift Mauler w talii człowieka (IWU)');
  const maulerId = `mm-${state.objectSequence++}`;
  moveObjectDirectly(state, mauler.id, 'hand', maulerId);
  const victim = [...state.objects.values()].find((o) => o.controllerId === HUMAN_ID && o.zone === 'library' && o.kind === 'creature');
  moveObjectDirectly(state, victim.id, 'graveyard', `vv-${state.objectSequence++}`);
  addMana(state, HUMAN_ID, 9, { colors: ['U', 'U', 'C', 'C', 'C', 'C', 'C', 'C', 'C'] });
  const cast = session.view().legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === maulerId && c.exileTargetId);
  assert.ok(cast, 'oferta rzutu z kosztem wygnania z cmentarza');
  const victimName = REGISTRY.get(victim.cardId)?.name ?? victim.cardId;
  assert.ok(session.apply(cast).ok, 'rzut przyjęty');
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i++) {
    const pass = session.view().legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass || !session.apply(pass).ok) break;
  }
  const moved = state.events.filter((e) => e.type === 'object_moved' && e.additionalCost && e.fromZone === 'graveyard');
  assert.equal(moved.length, 1, 'silnik emituje DOKŁADNIE jedno object_moved [koszt]');
  const panel = session.botMoves.find((m) => m.type === 'object_moved' && /wygnanie/.test(m.text));
  assert.ok(panel, `modal „Rozgrywka" ma wpis o koszcie wygnania (było: brak)`);
  assert.match(panel.text, new RegExp(victimName), 'wpis nazywa wygnaną kartę');
});
