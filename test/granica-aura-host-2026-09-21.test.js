// Sesja 2026-09-21, krok 3 — granica aura–host (CR 303.4f) domknięta pomiarem
// na żywo (Żywy Tester: decyzja „Zaczaruj: …" z 6 kandydatami i pełnym
// rozstrzygnięciem — `scratch/w/aura-batch/p106.txt`, seed 106). Pomiar na
// żywo odsłonił BŁĄD warstwy, którego nie widziały piny silnika:
//
//  G/1. Aura „Enchant player" (Curse of the Pierced Heart) wracająca z grobu
//       załączała się do STWORA. `isLegalAuraHost` nie znał deskryptora
//       `enchant: 'player'` i wpadał w domyślne „wyłącznie stwory", więc
//       klątwa lądowała na stworze z nieustawionym `enchantedPlayerId`
//       (jej zdolność nie miała czego czytać). Naprawa u źródła: gracz nie
//       jest permanentem, więc żaden permanent nie jest gospodarzem takiej
//       aury. Pin mierzy predykat ORAZ pełną ścieżkę zwrotu (przed naprawą
//       aura wchodziła na pole bitwy — test czerwieni się).
//       GRANICA (świadomie odroczona, L158): CR 303.4f mówi „must choose
//       a legal object OR PLAYER" — poprawnym zachowaniem byłby wybór gracza
//       (w pojedynku dwóch kandydatów). Kontrakt `pendingAuraHost` niesie
//       dziś WYŁĄCZNIE id permanentów; dodanie kandydatów-graczy wymaga
//       etykiet oferty („Zaczaruj: Ty/Nieprzyjaciel"), wpisu w wycenie bota
//       i przepisania G/1 na zachowanie zgodne z CR. Dziś aura zostaje
//       w grobie z jawnym zdarzeniem i wpisem w logu — to zachowanie pin
//       utrwala, żeby nikt nie dodał ścieżki POŁOWICZNIE (np. załączając
//       klątwę do gracza bez decyzji).
//  G/2. Granica „ile gospodarzy = decyzja": JEDEN legalny gospodarz domyka
//       wybór sam (L41 — wybór bez alternatywy nie jest decyzją), DOPIERO
//       drugi otwiera `pendingAuraHost`. Ta sama reguła, którą na żywo
//       pokazała partia p106 (kandydaci: 6, wybrano Kor Cartographer).
//
// Reguła wejścia aury z grobu żyje w JEDNYM miejscu (effects.js
// `returnPermanentFromGraveyardOutcome`, wzorzec L41) — dlatego pin mierzy
// zachowanie przez pełną ścieżkę: rzut Annie Flash (trigger ETB) → cel → wynik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { isLegalAuraHost } from '../src/engine/attachments.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 303, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const id of ['p1', 'p2']) for (let i = 0; i < 4; i += 1) put(state, `lib-${id}-${i}`, 'basic-swamp', id, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  return execute(s, cmd);
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);

/** Rzut Annie Flash + rozstrzygnięcie triggera (cel wskazuje `targetId`). */
function annieReturns(s, targetId, { extraCreatures = 0 } = {}) {
  for (let i = 0; i < extraCreatures; i += 1) put(s, `sw-${i}`, 'lightwalker', 'p1', 'battlefield');
  put(s, 'annie', 'annie-flash-the-veteran');
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  const cast = run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  assert.ok(cast.ok, 'Annie rzucona');
  const wskazuje = (c) => c.targetId === targetId || (c.targetIds ?? []).includes(targetId);
  for (let i = 0; i < 40 && s.zones.stack.length > 0 && !s.pendingAuraHost; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type === 'resolve_trigger_target' && wskazuje(c))
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    if (!pick) break;
    run(s, pick);
  }
  assert.equal(find(s, 'annie-flash-the-veteran', 'battlefield') != null, true, 'Annie na polu bitwy');
}

test('G/1: „Enchant player" nie ma gospodarza-permanentu — z grobu zostaje w grobie (CR 303.4f)', () => {
  const s = game();
  put(s, 'gy-curse', 'curse-of-the-pierced-heart', 'p1', 'graveyard'); // MV 2, „Enchant player"
  const curse = find(s, 'curse-of-the-pierced-heart', 'graveyard');
  assert.equal(curse.aura?.enchant, 'player', 'deskryptor karty dotarł do obiektu (enchant: player)');

  // Sam predykat: stwór (Annie) NIE jest gospodarzem klątwy — przed naprawą
  // zwracał `true` (domyślna gałąź „wyłącznie stwory").
  const annieDummy = { id: 'x', zone: 'battlefield', kind: 'creature', controllerId: 'p1', types: ['Creature'] };
  assert.equal(isLegalAuraHost(curse, annieDummy), false, 'stwór nie jest gospodarzem aury „Enchant player"');

  annieReturns(s, 'gy-curse');
  assert.ok(find(s, 'curse-of-the-pierced-heart', 'graveyard'), 'Curse ZOSTAJE w grobie (brak kandydatów-graczy w kontrakcie)');
  assert.equal(find(s, 'curse-of-the-pierced-heart', 'battlefield'), undefined, 'aura nie weszła na pole bitwy');
  assert.equal(s.pendingAuraHost ?? null, null, 'nie otwarto decyzji o gospodarzu');
  assert.ok(
    s.events.some((e) => e.type === 'aura_returned_without_host' && e.cardId === 'curse-of-the-pierced-heart'),
    'zdarzenie nazywa przyczynę (log: „zostaje w grobie — aura bez legalnego gospodarza na polu bitwy")',
  );
  // Ciało pola bitwy nietknięte: żaden permanent nie nosi klątwy.
  const attached = [...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.attachedTo === 'gy-curse');
  assert.equal(attached.length, 0, 'żaden permanent nie załączył klątwy');
  assert.equal(s.players.length, 2, 'w pojedynku jest dwóch legalnych gospodarzy-graczy (CR 303.4f: „object or player")');
});

test('G/2: jeden legalny gospodarz domyka wybór sam; decyzja otwiera się dopiero przy dwóch', () => {
  // Dokładnie jeden stwór na polu bitwy (Annie sama) → brak decyzji, aura wchodzi.
  const s1 = game();
  put(s1, 'gy-aegis', 'containment-membrane', 'p1', 'graveyard'); // „Enchant creature”, MV 3
  annieReturns(s1, 'gy-aegis');
  assert.equal(s1.pendingAuraHost ?? null, null, 'jeden kandydat = brak decyzji (L41)');
  const weszla = find(s1, 'containment-membrane', 'battlefield');
  assert.ok(weszla, 'aura weszła bez pytania gracza');
  const annie = find(s1, 'annie-flash-the-veteran', 'battlefield');
  assert.equal(weszla.attachedTo, annie.id, 'załączona do jedynego legalnego gospodarza');

  // Drugi stwór → ta sama aura i ten sam moment, ale wybór jest REALNY.
  const s2 = game();
  put(s2, 'gy-aegis', 'containment-membrane', 'p1', 'graveyard');
  annieReturns(s2, 'gy-aegis', { extraCreatures: 1 });
  assert.ok(s2.pendingAuraHost, 'dwóch kandydatów = decyzja czeka na gracza');
  const oferta = commands(s2).filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferta.length, 2, 'oferta ma oba warianty (L48: oferta = walidacja)');
  const wybor = run(s2, oferta[1]);
  assert.ok(wybor.ok, 'wybór przyjęty');
  assert.equal(find(s2, 'containment-membrane', 'battlefield').attachedTo, oferta[1].auraHostId, 'aura u wybranego gospodarza');
});
