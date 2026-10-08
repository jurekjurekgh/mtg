// Zgłoszenie E właściciela (2026-10-07, log z gry): bot aktywował zdolność
// regeneracji (Exterminator Magmarch — „{1}{B}: Regenerate this creature")
// TRZY RAZY w jednej walce, wypalając całą dostępną manę (3× Swamp + Mountain).
//
// Zasada (CR 701.19a, dosłownie): regeneracja „creates a replacement effect
// that protects the permanent THE NEXT TIME it would be destroyed this turn".
// Tarcza chroni przed JEDNYM zniszczeniem w tej turze — druga tarcza na tym
// samym permanente ma wartość ~0, chyba że grożą dwa niezależne niszczenia
// (np. walka + removal na stosie). Stąd bot ma aktywować regenerację
// W REŻIMIE JEDNORAZOWYM: gdy stwór jest zagrożony śmiercią w tej turze
// (M218/4, M257/F), a gdy tarcza JUŻ stoi — nie płacić ponownie.
//
// DLACZEGO spam był możliwy (mechanizm, pin E/5): w session.js bot dostaje
// priorytet, a aktywacja go NIE oddaje — stół pyta bota ponownie. W tym
// drugim oknie pierwsza tarcza wisi jeszcze NA STOSIE (puste
// `view.regenerationShields`), więc każda kolejna aktywacja wyglądała na
// pierwszą i bot płacił {1}{B} do wyczerpania many.
//
// Test generyczny (ADR 0002): zero nazw kart w logice — rozpoznanie po
// deskryptorze zdolności (`keyword === 'regenerate'` / efekt `regenerate`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { makeSimulate } from '../src/engine/lookahead.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function stol({ zycie = 20, many = 6 } = {}) {
  const state = createGameState({ seed: 157, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players.find((p) => p.id === 'p1').life = zycie;
  // Bot (p1): Exterminator Magmarch 5/3 z regeneracją {1}{B}. Mana na to.
  put(state, 'mag', 'exterminator-magmarch', 'p1', 'battlefield', {
    power: 5, toughness: 3, summoningSickness: false,
  });
  for (let i = 0; i < many; i += 1) {
    put(state, `sw${i}`, 'basic-swamp', 'p1', 'battlefield', { tapped: false });
  }
  // Wróg (p2): Ballista Watcher 4/3 — wymiana śmierci (5≥3 i 4≥3).
  put(state, 'watcher', 'ballista-watcher', 'p2', 'battlefield', { summoningSickness: false });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['mag'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { mag: ['watcher'] } }).ok);
  // Priorytet do bota (p1) — w tym oknie podejmuje decyzję o regeneracji.
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  return state;
}

const opcjeRegeneracji = (options) => options.filter((o) => /regenerat|activate/i.test(o.cmd));

const decyzja = (state) => {
  const bot = createHeuristicBot({ seed: 7 });
  // Jak prawdziwy stół (session.js): lookahead przez `simulate`.
  bot.chooseCommand(playerView(state, 'p1'), { simulate: makeSimulate(state) });
  const trace = bot.trace()[0];
  return { pick: trace.chosen, options: trace.options };
};

test('E/1: stwór zagrożony w walce, BEZ tarczy — bot regeneruje (raz)', () => {
  const { pick, options } = decyzja(stol());
  const regen = opcjeRegeneracji(options);
  assert.ok(regen.length > 0, `opcja regeneracji istnieje: ${JSON.stringify(options.map((o) => o.cmd))}`);
  assert.ok(regen[0].score > 0, `regeneracja przy śmiertelnej wymianie ma wartość dodatnią: ${regen[0].score}`);
  assert.ok(/regenerat|activate/i.test(pick),
    `bot wybiera regenerację: pick=${pick}`);
});

test('E/2: tarcza regeneracji JUŻ stoi — bot NIE płaci ponownie (sedno zgłoszenia)', () => {
  const state = stol();
  // Symulacja stanu PO pierwszej aktywacji (tarcza na stole, CR 701.19a).
  state.regenerationShields = ['mag'];
  const { pick, options } = decyzja(state);
  const regen = opcjeRegeneracji(options);
  assert.ok(regen.length > 0, `opcja regeneracji nadal istnieje: ${JSON.stringify(options.map((o) => o.cmd))}`);
  assert.ok(regen[0].score <= 0,
    `druga tarcza na tym samym stworze nie jest warta ponownego wydatku: score=${regen[0].score}`);
  assert.ok(!/regenerat|activate/i.test(pick),
    `bot nie powtarza regeneracji: pick=${pick}`);
});

test('E/3: dwie NIEZALEŻNE groźby niszczenia — druga tarcza NIE jest wartościowana (świadoma granica)', () => {
  // Lustro E/2 dla reguły CR 701.19a: gdy poza walką na stosie leży efekt
  // niszczący (drugie, niezależne zniszczenie), DRUGA tarcza miałaby sens
  // regułowo (każda tarcza chroni jedno zniszczenie). Bot jej nie wartościuje
  // — kryterium właściciela dla zgłoszenia E jest wyraźne: regeneracja jest
  // wartościowa „tylko gdy tarcza jeszcze nie ma". To świadome ograniczenie,
  // nie ukryty defekt: zachowawcza wycena nigdy nie marnuje many (gdyby bot
  // przeszacował drugą tarczę, wracałby spam z logu). Asercja poniżej PINUJE
  // tę granicę, żeby przyszła zmiana wyceny musiała być dyskusją, nie
  // przypadkiem.
  const state = stol();
  state.regenerationShields = ['mag'];
  // Efekt niszczący na stosie, celujący w magmarcha.
  addObject(state, {
    id: 'killer', instanceId: 'i-killer', cardId: 'spin-out', controllerId: 'p2', ownerId: 'p2',
    zone: 'stack', ...gameObjectDataOf(REGISTRY.get('spin-out')),
    types: REGISTRY.get('spin-out').types ?? [], keywords: [], subtypes: [],
    spell: REGISTRY.get('spin-out').spell, targets: ['mag'], controllerIdOfTarget: null,
  });
  const { options } = decyzja(state);
  const regen = opcjeRegeneracji(options);
  assert.ok(regen.length > 0, `opcja regeneracji nadal istnieje: ${JSON.stringify(options.map((o) => o.cmd))}`);
  assert.ok(regen[0].score <= 0,
    `świadoma granica: druga tarcza nie jest wartościowana (score ${regen[0].score})`);
});

test('E/5: pierwsza aktywacja WISI NA STOSIE — bot nie dokłada drugiej (sedno zgłoszenia)', () => {
  // Sedno skargi z logu: w session.js po aktywacji bot NADAL MA priorytet,
  // więc stół pyta go ponownie ZANIM pierwsza tarcza rozstrzygnie się na
  // stole. W tym oknie `view.regenerationShields` jest jeszcze pusty, więc
  // bez korekty każda kolejna aktywacja wyglądała na pierwszą (+60 urgent,
  // M218/4) — bot płacił {1}{B} do wyczerpania many. Cytowana reguła
  // (CR 701.19a): tarcza chroni „the next time it would be destroyed this
  // turn" — kopia na stosie nic nie zmienia dla tego zniszczenia.
  const state = stol();
  // Pierwsza aktywacja na stosie, nierozstrzygnięta (żaden gracz nie pasował).
  const pierwsza = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'mag', abilityIndex: 1 });
  assert.ok(pierwsza.ok, 'pierwsza aktywacja jest legalna');
  assert.equal(state.zones.stack.length, 1, 'zdolność wisi na stosie');
  assert.deepEqual(state.regenerationShields, [], 'tarczy na stole jeszcze nie ma');
  // Drugie okno decyzyjne bota — dokładnie to z logu właściciela.
  const { pick, options } = decyzja(state);
  const regen = opcjeRegeneracji(options);
  assert.ok(regen.length > 0, `opcja regeneracji nadal istnieje: ${JSON.stringify(options.map((o) => o.cmd))}`);
  assert.ok(regen[0].score <= 0,
    `powtórna regeneracja przy tarczy na stosie nie jest warta wydatku: score=${regen[0].score}`);
  assert.ok(!/regenerat|activate/i.test(pick),
    `bot nie dokłada drugiej tarczy na stos: pick=${pick}`);
});

test('E/4: pełny przepływ gry — bot regeneruje DOKŁADNIE RAZ w jednej walce', () => {
  // Reprodukcja z logu właściciela w architekturze PRAWDZIWEGO stołu
  // (session.js): pytanie o komendę idzie do gracza Z PRIORYTETEM, a bot po
  // aktywacji priorytetu nie oddaje — więc dostaje kolejne okno, w którym
  // pierwsza tarcza wisi nierozstrzygnięta na stosie. Wróg pasuje tylko
  // wtedy, gdy priorytet należy do niego. Liczymy aktywacje bota do końca
  // walki: mają być jedyne, stwór ma przeżyć (tarcza zużyta na wymianę), a
  // mana NIE może być spalona do zera (skarga: „3× za całą dostępną manę").
  const state = stol();
  const bot = createHeuristicBot({ seed: 7 });
  let aktywacje = 0;
  let tarczStworzonych = 0;
  let kroki = 0;
  const liczbaTarcz = (events) => (events ?? []).filter((e) => e.type === 'regeneration_shield_added').length;
  while (kroki < 60 && state.status === 'active') {
    kroki += 1;
    if (state.turn.priorityPlayerId === 'p1') {
      const view = playerView(state, 'p1');
      const moje = view.legalCommands.filter((c) => c.type !== 'concede');
      if (moje.length === 0) break;
      const cmd = bot.chooseCommand(view, { simulate: makeSimulate(state) });
      if (cmd.type === 'activate_ability') aktywacje += 1;
      const res = execute(state, cmd);
      if (!res.ok) break;
      tarczStworzonych += liczbaTarcz(res.events);
      continue;
    }
    // Priorytet wroga: jak stół — auto-pass, auto-resolve walki.
    const foeView = playerView(state, 'p2');
    const resolve = foeView.legalCommands.find((c) => c.type === 'resolve_combat');
    if (resolve) {
      const res = execute(state, resolve);
      if (!res.ok) break;
      tarczStworzonych += liczbaTarcz(res.events);
      continue;
    }
    const pass = foeView.legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) {
      const res = execute(state, pass);
      if (!res.ok) break;
      tarczStworzonych += liczbaTarcz(res.events);
      continue;
    }
    break;
    // Koniec scenariusza: walka rozstrzygnięta.
  }
  assert.equal(aktywacje, 1,
    `bot aktywuje regenerację raz (jedna groźba zniszczenia w tej turze): aktywacje=${aktywacje}`);
  // Tarcza musi powstać DOKŁADNIE raz (i zostać zużytą na regenerację —
  // stąd lista na stole jest po walce pusta; liczymy eventy engine'u).
  assert.equal(tarczStworzonych, 1,
    `engine tworzy DOKŁADNIE jedną tarczę regeneracji: ${tarczStworzonych}`);
  const mag = state.objects.get('mag');
  assert.ok(mag && mag.zone === 'battlefield' && (mag.damage ?? 0) === 0,
    `stwór przeżywa wymianę z tarczą (zregenerowany, bez obrażeń): ${JSON.stringify(mag && { zone: mag.zone, damage: mag.damage })}`);
  const nietapniete = [...state.objects.values()].filter((o) => o.zone === 'battlefield'
    && o.controllerId === 'p1' && o.cardId === 'basic-swamp' && !o.tapped).length;
  assert.ok(nietapniete >= 1, `bot zostawia manę na później (nie spala wszystkiego): nietapnięte=${nietapniete}`);
});
