import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';

/**
 * E5 (zgłoszenie właściciela 2026-09-25g): decline „you may [verb] target"
 * w modalu wyboru celu ma własne brzmienie („Nie tapuj nikogo (you may)"),
 * inne niż odmowa „up to one". Mapa per typ efektu (ADR 0002) + fallback.
 */

function viewStub({ cardId, effectType, mayFire }) {
  return {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Wróg' }],
    zones: { hand: [], battlefield: [], stack: [], graveyard: [], exile: [], library: [] },
    legalCommands: [],
    turn: { number: 1, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1' },
    pendingTriggerTarget: { playerId: 'p1', cardId, effectType, mayFire, candidateIds: [] },
  };
}

const sessionStub = { nameOf: (c) => `N(${c})`, nameOfObject: (o) => o, abilitiesOf: () => [], cardDetails: () => null };
const declineCmd = { type: 'resolve_trigger_target', playerId: 'p1', targetId: null };

test('E5: decline may-Fire ma brzmienie per efekt (6 kart katalogu) + fallback', () => {
  const cases = [
    ['angelic-benediction', 'tap_permanent', 'N(angelic-benediction) — Nie tapuj nikogo (you may)'],
    ['reclusive-artificer', 'damage', 'N(reclusive-artificer) — Nie zadawaj obrażeń (you may)'],
    ['battle-rattle-shaman', 'pump', 'N(battle-rattle-shaman) — Nie pompuj nikogo (you may)'],
    ['fourth-bridge-prowler', 'buff_creature_until_end_of_turn', 'N(fourth-bridge-prowler) — Nie osłabiaj nikogo (you may)'],
    ['mystic-sanctuary', 'put_graveyard_card_on_top', 'N(mystic-sanctuary) — Nie kładź niczego na wierzch (you may)'],
    ['ironclad-slayer', 'return_card_from_graveyard_to_hand', 'N(ironclad-slayer) — Niczego nie wracaj do ręki (you may)'],
  ];
  for (const [cardId, effectType, expected] of cases) {
    const label = commandLabel(declineCmd, sessionStub, viewStub({ cardId, effectType, mayFire: true }));
    assert.equal(label, expected, `${cardId}`);
  }
  // Fallback: przyszły efekt may+cel spoza mapy — generyczne brzmienie may.
  const fb = commandLabel(declineCmd, sessionStub, viewStub({ cardId: 'x', effectType: 'jakis_nowy_efekt', mayFire: true }));
  assert.equal(fb, 'N(x) — bez celu (odmowa — „you may")');
});

test('E5-kontrola: odmowa „up to one" (bez mayFire) — brzmienie bez zmian', () => {
  const label = commandLabel(declineCmd, sessionStub, viewStub({ cardId: 'lodestone-needle', effectType: 'tapped_damage', mayFire: false }));
  assert.equal(label, 'N(lodestone-needle) — bez celu (odmowa — „up to one"/„you may")');
  const bounce = commandLabel(declineCmd, sessionStub, viewStub({ cardId: 'x', effectType: 'bounce_permanent', mayFire: false }));
  assert.equal(bounce, 'N(x) — nie zwracaj niczego (odmowa)');
});
