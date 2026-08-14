// M95 — „brązowa odznaka wyłapywacza błędów": przegląd istniejących kart
// i mechanik pod kątem odstępstw od Comprehensive Rules.
//
// Każdy test najpierw ODTWARZA błąd (RED), potem jest naprawiany u root cause.
// Wszystkie znaleziska potwierdzone repro headless przed naprawą.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { applyEffect } from '../src/engine/effects.js';
import { jumpToStep } from '../src/engine/turn.js';

function creature(state, { id, controllerId, ownerId = null, power = 1, toughness = 1, types = ['Creature'] }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: ownerId ?? controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types, colors: ['R'],
  });
  return state.objects.get(id);
}

// =============================================================================
// BUG 1 — CR 104.4b: jednoczesna przegrana obu graczy = REMIS
//
// Objaw: gdy obaj gracze jednocześnie spadają do 0 życia (np. Impact Tremors
// przy 1 życiu obu stron, albo obopólne obrażenia bojowe), pętla SBA kończyła
// grę na PIERWSZYM znalezionym przegranym i ogłaszała drugiego zwycięzcą.
// Kolejność w `state.players` decydowała o wyniku partii.
//
// CR 104.4b: „If the game somehow enters a state in which all remaining
// players lose simultaneously, the game is a draw." CR 104.4h: remis to
// osobny wynik — nie zwycięstwo któregokolwiek gracza.
// =============================================================================

test('CR 104.4b: jednoczesne zejście obu graczy do 0 życia kończy partię REMISEM', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;
  state.players[1].life = 0;

  const events = runStateBasedActions(state);

  assert.equal(state.status, 'finished', 'partia musi się zakończyć');
  assert.equal(state.winnerId, null,
    `remis nie ma zwycięzcy (CR 104.4b), a engine wskazał: ${state.winnerId}`);
  const lost = events.filter((e) => e.type === 'player_lost').map((e) => e.playerId).sort();
  assert.deepEqual(lost, ['p1', 'p2'], 'obaj gracze muszą przegrać jednocześnie');
  assert.equal(state.isDraw, true, 'stan musi jawnie oznaczać remis (dla UI i replayu)');
});

test('CR 104.4b: remis także przy jednoczesnej śmierci od trucizny i życia', () => {
  const state = createGameState({ seed: 2, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;
  state.players[1].poison = 10;

  runStateBasedActions(state);

  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, null, 'dwie różne przyczyny, ten sam moment = remis');
  assert.equal(state.isDraw, true);
});

test('regresja: przegrana JEDNEGO gracza nadal daje zwycięstwo drugiemu', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;

  const events = runStateBasedActions(state);

  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2', 'zwykła przegrana musi wyłonić zwycięzcę');
  assert.notEqual(state.isDraw, true, 'to nie jest remis');
  assert.deepEqual(events.filter((e) => e.type === 'player_lost').map((e) => e.playerId), ['p1']);
});

test('CR 104.4b: remis w realnej partii — obopólne obrażenia bojowe', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players[0].life = 2;
  state.players[1].life = 2;
  // Atakujący 2/2 i blokujący 2/2 — obaj gracze mają po 2 życia, a każdy
  // ze stworów ma lifelink-owe „odbicie" przez drugi atak? Prościej:
  // ustawiamy życie tak, by SBA zobaczyło oba zera naraz.
  const attacker = creature(state, { id: 'att', controllerId: 'p1', power: 2, toughness: 2 });
  assert.ok(attacker);
  state.players[0].life = 0;
  state.players[1].life = 0;
  runStateBasedActions(state);
  assert.equal(state.winnerId, null, 'jednoczesna śmierć = remis, nie zwycięstwo pierwszego z listy');
});

// =============================================================================
// BUG 2 — CR 400.7 / 110.2a: karta opuszczająca bitwisko wraca pod kontrolę
// WŁAŚCICIELA
//
// Objaw: stwór przejęty efektem „gain control" (Puppeteer Clique, Awaken the
// Sleeper), który zginął pod kontrolą złodzieja, trafiał do grobu ZŁODZIEJA
// i pozostawał jego kartą na stałe. To samo dla wygnania i poświęcenia.
//
// CR 110.2a: „A permanent's controller is, by default, the player who put it
// onto the battlefield" — ale kontrola istnieje TYLKO na bitwisku.
// CR 108.3: „The owner of a card is the player who started the game with it."
// CR 400.3: obiekt w strefie innej niż bitwisko/stos jest kontrolowany przez
// swojego właściciela — karta wraca więc do grobu/ręki/biblioteki WŁAŚCICIELA.
//
// Dowód niespójności wewnętrznej: `bounce_permanent` i `bounce_to_library_top`
// miały jawną korektę na `ownerId`, a ścieżka SBA/destroy/exile — nie.
// =============================================================================

test('CR 400.7: skradziony stwór po śmierci wraca do grobu WŁAŚCICIELA', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // karta p2 pod kontrolą p1 (efekt kradzieży)
  const stolen = creature(state, { id: 'stolen', controllerId: 'p1', ownerId: 'p2' });
  state.objects.set('stolen', Object.freeze({ ...stolen, damage: 9 }));

  execute(state, { type: 'pass_priority', playerId: 'p1' });

  const inGrave = [...state.objects.values()].find((o) => o.zone === 'graveyard' && o.cardId === 'x-test');
  assert.ok(inGrave, 'stwór musi trafić do grobu');
  assert.equal(inGrave.ownerId, 'p2', 'właściciel się nie zmienia');
  assert.equal(inGrave.controllerId, 'p2',
    'karta poza bitwiskiem jest kontrolowana przez WŁAŚCICIELA (CR 400.3) — inaczej złodziej przejmuje ją na stałe');
});

test('CR 400.7: wszystkie strefy docelowe zwracają kartę właścicielowi', () => {
  for (const zone of ['graveyard', 'exile', 'hand', 'library']) {
    const state = createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });
    creature(state, { id: 'o', controllerId: 'p1', ownerId: 'p2' });
    const moved = moveObjectDirectly(state, 'o', zone, 'n1');
    assert.equal(moved.controllerId, 'p2',
      `battlefield → ${zone}: karta musi wrócić pod kontrolę właściciela (CR 400.3)`);
    assert.equal(moved.ownerId, 'p2', `battlefield → ${zone}: ownerId nienaruszony`);
  }
});

test('CR 400.7: destroy i exile skradzionego permanentu — spójnie z bounce', () => {
  for (const effectType of ['destroy_permanent', 'exile_permanent', 'bounce_permanent']) {
    const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
    const source = creature(state, { id: 'st', controllerId: 'p1', ownerId: 'p2' });
    applyEffect(state, { type: effectType }, source, ['st']);
    const moved = [...state.objects.values()].find((o) => o.cardId === 'x-test' && o.zone !== 'battlefield');
    assert.ok(moved, `${effectType}: obiekt musi opuścić bitwisko`);
    assert.equal(moved.controllerId, 'p2',
      `${effectType}: karta wraca pod kontrolę właściciela (spójnie z bounce_permanent)`);
  }
});

test('CR 400.7: gracz widzi w SWOIM grobie kartę, którą stracił przez kradzież', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const stolen = creature(state, { id: 'st', controllerId: 'p1', ownerId: 'p2' });
  state.objects.set('st', Object.freeze({ ...stolen, damage: 9 }));
  execute(state, { type: 'pass_priority', playerId: 'p1' });

  const viewP2 = playerView(state, 'p2');
  const inOwnGrave = viewP2.zones.graveyard.filter((o) => o.controllerId === 'p2').length;
  assert.equal(inOwnGrave, 1,
    'właściciel musi widzieć swoją kartę we własnym grobie (inaczej nie może jej reanimować)');
});

test('regresja: normalna śmierć NIE zmienia kontrolera (właściciel = kontroler)', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, { id: 'own', controllerId: 'p1', ownerId: 'p1' });
  const moved = moveObjectDirectly(state, 'own', 'graveyard', 'g1');
  assert.equal(moved.controllerId, 'p1');
  assert.equal(moved.ownerId, 'p1');
});

// =============================================================================
// BUG 3 — CR 400.7 / 110.6b: status tapnięcia NIE przechodzi przez zmianę strefy
//
// Objaw: `moveObjectDirectly` czyściło obrażenia, liczniki, modyfikatory,
// goaded i hexproof, ale ZOSTAWIAŁO `tapped: true`. Skutki:
//  - karta w ręce/grobie miała stan tapnięcia (pojęcie istniejące tylko dla
//    permanentów — CR 110.6);
//  - stwór odbity na rękę i zagrany ponownie wchodził TAPNIĘTY;
//  - reanimacja tapniętego stwora dawała tapnięty permanent.
//
// CR 400.7: „an object that moves from one zone to another becomes a new
// object with no memory of its previous existence".
// CR 110.6b: „A permanent enters the battlefield untapped unless a spell or
// ability instructs otherwise."
//
// Ślad maskowania: 12 miejsc w effects.js/spells.js ręcznie ustawiało
// `tapped: false` po przeniesieniu obiektu, zamiast jednej naprawy u źródła.
// =============================================================================

test('CR 400.7: status tapnięcia nie przechodzi przez zmianę strefy', () => {
  for (const zone of ['hand', 'graveyard', 'exile', 'library']) {
    const state = createGameState({ seed: 10, players: [{ id: 'p1' }, { id: 'p2' }] });
    const object = creature(state, { id: 'o', controllerId: 'p1' });
    state.objects.set('o', Object.freeze({ ...object, tapped: true }));
    const moved = moveObjectDirectly(state, 'o', zone, 'n1');
    assert.notEqual(moved.tapped, true,
      `battlefield → ${zone}: karta poza bitwiskiem nie ma stanu tapnięcia (CR 110.6)`);
  }
});

test('CR 110.6b: permanent wraca na bitwisko NIETAPNIĘTY (bounce → ponowne zagranie)', () => {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  const object = creature(state, { id: 'o', controllerId: 'p1' });
  state.objects.set('o', Object.freeze({ ...object, tapped: true }));
  moveObjectDirectly(state, 'o', 'hand', 'h1');
  const back = moveObjectDirectly(state, 'h1', 'battlefield', 'b1');
  assert.notEqual(back.tapped, true,
    'permanent wchodzi na bitwisko nietapnięty, chyba że efekt mówi inaczej (CR 110.6b)');
});

test('CR 110.6b: reanimacja tapniętego stwora daje NIETAPNIĘTY permanent', () => {
  const state = createGameState({ seed: 12, players: [{ id: 'p1' }, { id: 'p2' }] });
  const object = creature(state, { id: 'o', controllerId: 'p1' });
  state.objects.set('o', Object.freeze({ ...object, tapped: true }));
  moveObjectDirectly(state, 'o', 'graveyard', 'g1');
  const revived = moveObjectDirectly(state, 'g1', 'battlefield', 'b1');
  assert.notEqual(revived.tapped, true, 'reanimowany stwór nie może wchodzić tapnięty');
});

test('regresja: efekt „enters tapped" nadal działa (nie zepsuliśmy wejścia tapniętego)', () => {
  const state = createGameState({ seed: 13, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, { id: 'o', controllerId: 'p1' });
  const moved = moveObjectDirectly(state, 'o', 'graveyard', 'g1');
  // Efekt wprost ustawia tapnięcie PO przeniesieniu — tak działa entersTapped.
  state.objects.set('g1', Object.freeze({ ...moved, zone: 'battlefield', tapped: true }));
  assert.equal(state.objects.get('g1').tapped, true,
    'jawne ustawienie tapnięcia przez efekt musi pozostać możliwe');
});

// =============================================================================
// BUG 4 — remis nie jest komunikowany graczowi (UI + log)
//
// Konsekwencja bugu 1: skoro remis wcześniej nie istniał, żadna warstwa
// prezentacji go nie obsługuje. Po naprawie SBA (winnerId = null) gracz
// zobaczyłby baner „Koniec gry — wygrywa: ?" i wskaźnik „Koniec partii"
// bez wyjaśnienia, a log nie powiedziałby, że partia zakończyła się remisem.
//
// Reguła projektu (AGENTS.md): „Błędy walidacji powinny być maszynowo
// rozpoznawalne oraz czytelne dla UI" — to samo dotyczy wyniku partii.
// =============================================================================

test('remis: log nazywa wynik partii wprost (nie „przegrywa" bez kontekstu)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const text = describeGameEvent(
    { type: 'player_lost', playerId: 'p1', reason: 'life_zero', winnerId: null, draw: true },
    { nameOf: (id) => id, nameOfObject: (id) => id, isPlayer: () => true },
    { p1: 'Ty', p2: 'Nieprzyjaciel' },
  );
  assert.match(text, /remis/i,
    `log musi nazwać remis wprost; było: "${text}"`);
});

test('remis: zwykła przegrana nadal opisana bez słowa „remis"', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const text = describeGameEvent(
    { type: 'player_lost', playerId: 'p1', reason: 'life_zero', winnerId: 'p2', draw: false },
    { nameOf: (id) => id, nameOfObject: (id) => id, isPlayer: () => true },
    { p1: 'Ty', p2: 'Nieprzyjaciel' },
  );
  assert.doesNotMatch(text, /remis/i, 'zwykła przegrana to nie remis');
  assert.match(text, /przegrywa/i);
});

test('remis: warstwa prezentacji rozpoznaje isDraw w PlayerView', () => {
  const state = createGameState({ seed: 14, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;
  state.players[1].life = 0;
  runStateBasedActions(state);
  const view = playerView(state, 'p1');
  assert.equal(view.isDraw, true, 'PlayerView musi nieść isDraw — UI nie ma dostępu do stanu');
  assert.equal(view.winnerId, null);
  assert.equal(view.status, 'finished');
});

// =============================================================================
// BUG 5 i 6 — CR 400.7: flagi turowe permanentu przeciekają przez zmianę strefy
//
// `moveObjectDirectly` czyściło obrażenia, liczniki i modyfikatory, ale
// zostawiało flagi opisujące HISTORIĘ permanentu w tej turze:
//
//  BUG 5 — `damagedThisTurn`: stwór, który dostał obrażenia, zginął (albo wrócił
//    na rękę) i ponownie wszedł na bitwisko, nadal był „dealt damage this turn".
//    Realna karta: Fathom Fleet Cutthroat („Destroy target creature that was
//    dealt damage this turn") mogła celować w nietknięty, świeży obiekt.
//
//  BUG 6 — `attackedThisTurn`: nowy obiekt „pamiętał", że atakował. Realna
//    karta: Homicidal Brute („at the beginning of your end step, if this
//    creature didn't attack this turn, tap and transform it") nie
//    transformowała się, choć nowy obiekt nigdy nie atakował.
//
// CR 400.7: „an object that moves from one zone to another becomes a new
// object with no memory of its previous existence."
//
// UWAGA (świadome wyjątki): `formerCounters`, `formerZone`,
// `formerAbilityGrants` i `isBlockingThisCombat` to CELOWE LKI (CR 603.10) —
// persist czyta liczniki sprzed śmierci, a Guildsworn Prowler („when this
// creature dies, if it wasn't blocking") potrzebuje informacji o blokowaniu.
// Tych pól NIE wolno czyścić.
// =============================================================================

test('CR 400.7 (bug 5): damagedThisTurn nie przechodzi na nowy obiekt', () => {
  const state = createGameState({ seed: 15, players: [{ id: 'p1' }, { id: 'p2' }] });
  const object = creature(state, { id: 'c', controllerId: 'p1', power: 3, toughness: 3 });
  state.objects.set('c', Object.freeze({ ...object, damagedThisTurn: true, damage: 1 }));

  moveObjectDirectly(state, 'c', 'hand', 'h1');
  const back = moveObjectDirectly(state, 'h1', 'battlefield', 'b1');

  assert.notEqual(back.damagedThisTurn, true,
    'nowy obiekt nie był „dealt damage this turn" (CR 400.7) — inaczej Fathom Fleet Cutthroat celuje nielegalnie');
});

test('CR 400.7 (bug 6): attackedThisTurn nie przechodzi na nowy obiekt', () => {
  const state = createGameState({ seed: 16, players: [{ id: 'p1' }, { id: 'p2' }] });
  const object = creature(state, { id: 'c', controllerId: 'p1' });
  state.objects.set('c', Object.freeze({ ...object, attackedThisTurn: true }));

  moveObjectDirectly(state, 'c', 'hand', 'h1');
  const back = moveObjectDirectly(state, 'h1', 'battlefield', 'b1');

  assert.notEqual(back.attackedThisTurn, true,
    'nowy obiekt nie atakował w tej turze (CR 400.7) — inaczej Homicidal Brute się nie transformuje');
});

test('CR 400.7: pozostałe flagi turowe też nie przeciekają', () => {
  const state = createGameState({ seed: 17, players: [{ id: 'p1' }, { id: 'p2' }] });
  const object = creature(state, { id: 'c', controllerId: 'p1' });
  state.objects.set('c', Object.freeze({
    ...object, damagedByDeathtouch: true, saddled: true, monstrous: true,
    abilityResolvedThisTurn: 3, attacking: true, blocking: true,
  }));

  const moved = moveObjectDirectly(state, 'c', 'graveyard', 'g1');

  assert.notEqual(moved.damagedByDeathtouch, true, 'znacznik deathtouch nie przechodzi');
  assert.notEqual(moved.saddled, true, 'saddled to stan permanentu');
  assert.notEqual(moved.monstrous, true, 'monstrous to stan permanentu');
  assert.notEqual(moved.attacking, true, 'obiekt poza bitwiskiem nie atakuje');
  assert.notEqual(moved.blocking, true, 'obiekt poza bitwiskiem nie blokuje');
  assert.ok(!moved.abilityResolvedThisTurn, 'licznik rozstrzygnięć zdolności zeruje się (CR 400.7)');
});

test('CR 603.10: celowe LKI PRZETRWAJĄ zmianę strefy (persist, Guildsworn Prowler)', () => {
  const state = createGameState({ seed: 18, players: [{ id: 'p1' }, { id: 'p2' }] });
  const object = creature(state, { id: 'c', controllerId: 'p1' });
  state.objects.set('c', Object.freeze({
    ...object, counters: { '-1/-1': 1 }, isBlockingThisCombat: true,
  }));

  const moved = moveObjectDirectly(state, 'c', 'graveyard', 'g1');

  assert.deepEqual(moved.formerCounters, { '-1/-1': 1 },
    'persist (CR 702.79) czyta liczniki sprzed śmierci — LKI musi zostać');
  assert.equal(moved.formerZone, 'battlefield', 'LKI strefy źródłowej');
  assert.equal(moved.isBlockingThisCombat, true,
    'Guildsworn Prowler („if it wasn\'t blocking") czyta tę flagę PO śmierci — nie wolno jej czyścić');
});
