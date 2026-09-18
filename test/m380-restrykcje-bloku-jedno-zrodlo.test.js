// M380 (wyzwanie „brązowa odznaka", ADR 0030): LEGALNOŚĆ BLOKU MA JEDNO
// ŹRÓDŁO PRAWDY (L41) — oferta i walidacja `declare_blockers` czytają ten sam
// predykat parowy. Przed M380 walidacja miała ręczną kopię listy restrykcji
// i nie zawierała progu mocy (Rust-Shield Rampager): komenda
// `declare_blockers { ram: ['b2'] }` z blokerem o mocy 2 była PRZYJMOWANA,
// mimo że panel/`legalBlockerOptions` takiego bloku nie oferował.
//
// Źródła online (dostęp 2026-09-18):
//  • CR 509.1 (https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt,
//    efektywne 2026-08-07): „To declare blockers, the defending player follows
//    the steps below, in order. If at any point during the declaration of
//    blockers, the defending player is unable to comply with any of the steps
//    listed below, the declaration is illegal; the game returns to the moment
//    before the declaration."
//  • CR 509.1a: „The chosen creatures must be untapped and they can't also be
//    battles."
//  • CR 509.1b: „The defending player checks each creature they control to see
//    whether it's affected by any restrictions (effects that say a creature
//    can't block, or that it can't block unless some condition is met). If any
//    restrictions are being disobeyed, the declaration of blockers is illegal.
//    A restriction may be created by an evasion ability (a static ability an
//    attacking creature has that restricts what can block it). If an attacking
//    creature gains or loses an evasion ability after a legal block has been
//    declared, it doesn't affect that block."
//  • Oracle + rulings WotC (Scryfall, dostęp 2026-09-18,
//    https://api.scryfall.com/cards/c96b01f5-83de-4237-a68d-f946c53e31a6/rulings):
//    „Once Rust-Shield Rampager has been blocked, reducing the power of a
//    blocking creature to 2 or less won't remove that creature from combat or
//    cause Rust-Shield Rampager to become unblocked." — czyli próg mocy jest
//    sprawdzany PRZY DEKLARACJI bloków (i tylko wtedy).
//
// Piny: (A) para Rampager/bloker o mocy 2 — nie ma jej w ofercie I jest
// odrzucana (przed M380: oferta bez, walidacja przyjmowała), (B) komenda
// odrzucona ATOMOWO (stan walki i krok bez zmian — CR 509.1 „the game returns
// to the moment before the declaration"), (C) legalny bloker (moc 5) jest
// oferowany i przyjmowany, (D) moc efektywna (licznik +1/+1 podnosi moc 2 → 3
// i blok staje się legalny), (E) strażnik klasy L48: macierz atakujący×bloker
// dla latania/zasięgu, przenikania (menace), detain, „can't block",
// cantBeBlocked i progu mocy — dla każdej pary „jest w ofercie" ⇔ „komenda
// przyjęta". Ten test FAILUJE na kodzie sprzed M380 (para Rampager/2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { legalBlockerOptions } from '../src/engine/combat.js';
import { effectivePower } from '../src/engine/permanents.js';
import { detainUntilYourNextTurn } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

/** Stan tuż przed deklaracją bloków: p1 atakuje, p2 blokuje. */
function combatState() {
  const state = createGameState({ seed: 380, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 9;
  state.pendingMulligans = [];
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      const id = `lib-${pid}-${i}`;
      const land = REGISTRY.get('basic-forest');
      addObject(state, {
        id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId: pid, ownerId: pid,
        zone: 'library', types: land.types ?? [], keywords: [], subtypes: land.subtypes ?? [],
        ...gameObjectDataOf(land),
      });
    }
  }
  return state;
}

function putCreature(state, id, cardId, controllerId, patch = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    cardName: card.name, ...gameObjectDataOf(card),
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

/** Czy oferta bloków p2 zawiera dokładnie parę {attacker: [blocker]}. */
function pairOffered(state, attackerId, blockerId) {
  const wanted = JSON.stringify({ [attackerId]: [blockerId] });
  return playerView(state, 'p2').legalCommands.some((c) => c.type === 'declare_blockers'
    && JSON.stringify(c.assignments) === wanted);
}

/** Wynik komendy bloku na KLONIE stanu (nie psuje stanu bazowego). */
function pairVerdict(baseState, attackerId, blockerId) {
  const clone = structuredClone(baseState);
  const result = execute(clone, { type: 'declare_blockers', playerId: 'p2', assignments: { [attackerId]: [blockerId] } });
  return { ok: result.ok, reason: result.reason ?? result.events?.[0]?.reason ?? null };
}

function enterBlockStep(state, attackerIds) {
  const declared = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.ok(declared.ok, `deklaracja atakujących: ${declared.reason ?? ''}`);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

test('M380/A: próg mocy („can\'t be blocked by power <= 2") — oferta = walidacja', () => {
  const state = combatState();
  putCreature(state, 'ram', 'rust-shield-rampager', 'p1');   // 4/4, próg mocy 2
  putCreature(state, 'b2', 'highland-game', 'p2');           // moc 2
  putCreature(state, 'b5', 'marut', 'p2', { power: 5, toughness: 5 });
  enterBlockStep(state, ['ram']);
  assert.equal(effectivePower(state.objects.get('b2'), state), 2, 'moc blokera', );

  assert.equal(pairOffered(state, 'ram', 'b2'), false, 'bloker o mocy 2 NIE jest oferowany');
  const illegal = pairVerdict(state, 'ram', 'b2');
  assert.equal(illegal.ok, false, 'CR 509.1b: nielegalna deklaracja bloków musi zostać odrzucona');
  assert.match(String(illegal.reason), /illegal_blockers/, 'odrzucenie po stronie walidacji bloków');

  assert.equal(pairOffered(state, 'ram', 'b5'), true, 'bloker o mocy 5 jest oferowany');
  assert.equal(pairVerdict(state, 'ram', 'b5').ok, true, 'bloker o mocy 5 jest przyjmowany');
});

test('M380/B: odrzucona komenda nie zmienia stanu walki (CR 509.1 — powrót do stanu przed deklaracją)', () => {
  const state = combatState();
  putCreature(state, 'ram', 'rust-shield-rampager', 'p1');
  putCreature(state, 'b2', 'highland-game', 'p2');
  enterBlockStep(state, ['ram']);
  const before = { step: state.turn.step, blockers: state.combat.blockers, blocked: [...(state.combat.blockedAttackers ?? [])] };
  const result = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { ram: ['b2'] } });
  assert.equal(result.ok, false);
  assert.equal(state.turn.step, before.step, 'krok bez zmian');
  assert.deepEqual(state.combat.blockers, before.blockers, 'blokerzy bez zmian');
  assert.deepEqual([...(state.combat.blockedAttackers ?? [])], before.blocked, 'atakujący nie został „zablokowany"');
  assert.ok(pairOffered(state, 'ram', 'b2') === false, 'oferta nadal bez tej pary');
});

test('M380/C: moc EFEKTYWNA decyduje (licznik +1/+1 podnosi moc 2 → 3)', () => {
  const state = combatState();
  putCreature(state, 'ram', 'rust-shield-rampager', 'p1');
  putCreature(state, 'b2', 'highland-game', 'p2', { counters: { '+1/+1': 1 } }); // 2/1 + licznik = 3/2
  enterBlockStep(state, ['ram']);
  assert.equal(effectivePower(state.objects.get('b2'), state), 3);
  assert.equal(pairOffered(state, 'ram', 'b2'), true, 'moc 3 > próg 2 → blok legalny');
  assert.equal(pairVerdict(state, 'ram', 'b2').ok, true);
});

test('M380/D: strażnik klasy — macierz atakujący×bloker: „w ofercie" ⇔ „przyjęte"', () => {
  // Każda restrykcja bloku ma dokładnie jedno źródło prawdy (canBlock ==
  // walidacja declare_blockers). Macierz przechodzi przez: latanie/zasięg,
  // menace (wymóg liczby blokerów), detain, „can\'t block", cantBeBlocked
  // i próg mocy. Para, która jest w ofercie, MUSI być przyjęta; para, której
  // nie ma — MUSI być odrzucona (L48).
  const scenarios = [
    {
      attackers: [['flyer', 'razorfoot-griffin', {}]],
      blockers: [
        ['ground', 'highland-game', {}],
        ['reacher', 'deadly-recluse', {}],       // zasięg
        ['flyer2', 'swooping-protector', {}],    // latanie
      ],
    },
    {
      attackers: [['menacer', 'dire-fleet-ravager', {}]],
      blockers: [['ground', 'highland-game', {}], ['ground2', 'highland-game', {}]],
    },
    {
      attackers: [['ram', 'rust-shield-rampager', {}]],
      blockers: [
        ['p2', 'highland-game', {}],
        ['p3', 'marut', 'power3'],
      ],
    },
    {
      attackers: [['plain', 'highland-game', {}]],
      blockers: [
        ['detained', 'highland-game', 'detain'],
        ['cantblock', 'highland-game', 'cantBlock'],
      ],
    },
    {
      attackers: [['unblockable', 'highland-game', 'cantBeBlocked']],
      blockers: [['b1', 'highland-game', {}]],
    },
  ];
  let checked = 0;
  const mismatches = [];
  for (const [index, scenario] of scenarios.entries()) {
    const state = combatState();
    for (const [id, cardId, patch] of scenario.attackers) {
      putCreature(state, id, cardId, 'p1', patch === 'cantBeBlocked' ? { cantBeBlocked: true } : {});
    }
    for (const [id, cardId, patch] of scenario.blockers) {
      const extra = patch === 'power3' ? { power: 3, toughness: 3 }
        : patch === 'cantBlock' ? { cantBlock: true } : {};
      putCreature(state, id, cardId, 'p2', extra);
      if (patch === 'detain') detainUntilYourNextTurn(state, id, 'p1');
    }
    enterBlockStep(state, scenario.attackers.map(([id]) => id));
    for (const [blockerId] of scenario.blockers) {
      for (const [attackerId] of scenario.attackers) {
        checked += 1;
        const offered = pairOffered(state, attackerId, blockerId);
        const verdict = pairVerdict(state, attackerId, blockerId);
        // Detain blokuje też w enumeracji; „menace" wymaga dwóch blokerów,
        // więc pojedyncza para oferowana nie jest — oczekujemy spójności.
        if (offered !== verdict.ok) {
          mismatches.push(`scenariusz ${index}: ${attackerId} <= ${blockerId} — oferta=${offered}, komenda=${verdict.ok} (${verdict.reason})`);
        }
      }
    }
  }
  assert.ok(checked >= 10, `macierz sprawdziła ${checked} par`);
  assert.deepEqual(mismatches, [], `rozjazd oferta↔walidacja:\n${mismatches.join('\n')}`);
});
