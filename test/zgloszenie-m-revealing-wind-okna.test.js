/**
 * Zgłoszenie właściciela M (2026-10-24): Revealing Wind — „jest instantem,
 * lecz miałem oferty jej rzucenia tylko w moich fazach main. Wygląda więc
 * na to, że została zakodowana jako sorcery”.
 *
 * Werdykt dochodzenia: NIE jest zakodowana jako sorcery — na żadnej
 * warstwie. Definicja ma `types: ['Instant']` i `spell.timing: 'instant'`
 * (pin M/1), materializacja przenosi `spell` bez zmian, silnik oferuje
 * rzut w każdym oknie priorytetu tury przeciwnika (M/2) — zgodnie z CR
 * 117.1a: „A player may cast an instant spell any time they have
 * priority.” (cytat zweryfikowany verbatim w przypiętym lustrze CR,
 * ADR 0030). Sesja zatrzymuje auto-pass w turze bota — także w krokach
 * walki — i rzut da się z tego stopu wykonać (M/4). Ten sam przebieg na
 * prawdziwym artefakcie (Żywy Tester, talia tarkir-bg) pokazał klikanie
 * „Rzuć: Revealing Wind” poza fazą main.
 *
 * Mechanizm obserwacji właściciela pina M/3: oferta rzutu powstaje tylko,
 * gdy koszt {2}{G} pokrywa mana osiągalna auto-tapem z NIETAPNIĘTYCH
 * źródeł. W turach przeciwnika lądy zwykle stoją tapnięte po zagraniach
 * własnej tury (talia morphów płaci {3} co turę), więc oferty nie ma —
 * wraca po odtapowaniu i zagraniu lądu we własnej fazie main. To bramka
 * many (zasada ofert silnika), nie bramka timingu: z trzema wolnymi
 * źródłami (w tym zielonym) gra zatrzymuje się w walce przeciwnika.
 *
 * Osobny ślad z dochodzenia (poza zakresem M, wpis w backloga): gdy koszt
 * domyka dopiero CZYSTA zdolność many o koszcie ręcznym bez wyboru (np.
 * poświęcenie Eldrazi Sciona), auto-pass nie zatrzymuje się na niej
 * (decyzja J: czyste zdolności many nie przerywają auto-passu) — instant
 * osiągalny tylko tą drogą nie da się rzucić w turze przeciwnika.
 * Rozszerzenie miary osiągalności (jak `paymentReachableMana` z K) na
 * zatrzymania sesji to decyzja UX właściciela, nie korekta timingu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Scena: p1 trzyma Revealing Wind i `lasy` lasów; priorytet p1 w turze p2. */
function scena(krok, lasy = 3, tapniete = 0) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, krok, 'p1');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  for (let i = 0; i < lasy; i++) {
    const las = put(state, `las${i}`, 'basic-forest', 'battlefield', 'p1');
    // `tapped` jest spoza kontraktu addObject — stan bojowy nadajemy
    // podmianą zamrożonego obiektu (jak podpowiada komunikat silnika).
    if (i < tapniete) state.objects.set(las.id, Object.freeze({ ...las, tapped: true }));
  }
  put(state, 'wind', 'revealing-wind', 'hand', 'p1');
  return state;
}

const ofertaWind = (state) => playerView(state, 'p1').legalCommands
  .find((c) => c.type.startsWith('cast') && c.objectId === 'wind');

test('M/1: Revealing Wind materializuje się jako Instant o timingu instant (nie sorcery)', () => {
  const def = REGISTRY.get('revealing-wind');
  assert.ok(def, 'karta w katalogu');
  assert.ok(def.types.includes('Instant'), 'typ Instant w definicji');
  assert.equal(def.spell?.timing, 'instant', 'spell.timing instant w definicji');
  // Materializacja (talia -> ręka): gałąź czaru przenosi `spell` bez zmian.
  const dane = gameObjectDataOf(def);
  assert.equal(dane.kind, 'spell', 'gałąź czaru w materializacji');
  assert.equal(dane.spell?.timing, 'instant', 'spell.timing instant po materializacji');
  // Pełny obiekt gry (jak w partii) niesie typy z definicji.
  const obj = scena('main1').objects.get('wind');
  assert.ok(obj.types.includes('Instant'), 'typ Instant na obiekcie gry');
  assert.equal(obj.spell?.timing, 'instant', 'spell.timing instant na obiekcie gry');
  // Koszt {2}{G} — kształt bramki z M/3.
  assert.equal(def.manaCost, 3, 'łączny koszt 3');
  assert.deepEqual(def.colors, ['G'], 'jeden pip zielony');
});

test('M/2: silnik oferuje rzut Revealing Wind w każdym oknie priorytetu tury przeciwnika (CR 117.1a)', () => {
  const kroki = ['upkeep', 'draw', 'main1', 'beginning_of_combat',
    'declare_attackers', 'declare_blockers', 'end_of_combat', 'main2', 'end'];
  for (const krok of kroki) {
    const state = scena(krok);
    assert.ok(ofertaWind(state), `oferta cast w kroku ${krok} tury przeciwnika`);
  }
});

test('M/3: bramka many, nie timingu — bez trzech wolnych źródeł oferty nie ma nigdzie', () => {
  // Za mało many: brak oferty także w oknie, w którym fog jest potrzebny.
  assert.equal(ofertaWind(scena('declare_blockers', 2)), undefined, '2 lasy: brak many na {2}{G}');
  // Trzeci las tapnięty (po zagraniach własnej tury) many nie daje —
  // dokładnie ten kształt widział właściciel w turach bota.
  assert.equal(ofertaWind(scena('declare_blockers', 3, 1)), undefined, '3. las tapnięty: nadal brak oferty');
  // Po odtapowaniu (własna main albo świadome przytrzymanie many) wraca.
  assert.ok(ofertaWind(scena('declare_blockers', 3, 0)), '3 wolne lasy: oferta jest');
});

test('M/4: sesja zatrzymuje się w turze bota (też w walce) z ofertą Revealing Wind; rzut działa', () => {
  const talie = new Map([
    [HUMAN_ID, parseDeckText('# A\n32x Forest\n8x Revealing Wind', REGISTRY).cardIds],
    [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Goblin Piker', REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 42, registry: REGISTRY, decks: talie, pauseOnBotMoves: true });
  const state = session.state;
  const stopyPozaWalka = new Set();
  const stopyWalki = new Set();
  let rzuconyWTurzeBota = false;
  let turaPierwszychStopow = null;

  for (let i = 0; i < 900 && state.status === 'active' && state.turn.number <= 14; i++) {
    if (session.botPausePending) { session.clearBotMoves(); session.continueBotPlay(); continue; }
    const view = session.view();
    const reka = view.zones.hand ?? [];
    const wind = reka.find((o) => o.cardId === 'revealing-wind');
    const oferta = wind
      ? view.legalCommands.find((c) => c.type.startsWith('cast') && c.objectId === wind.id)
      : undefined;
    const turaBota = state.turn.activePlayerId === BOT_ID && state.turn.priorityPlayerId === HUMAN_ID;

    if (turaBota && oferta) {
      const krok = state.turn.step;
      if (['declare_attackers', 'declare_blockers'].includes(krok)) stopyWalki.add(krok);
      else if (['upkeep', 'draw', 'main1', 'beginning_of_combat', 'end_of_combat', 'main2', 'end'].includes(krok)) {
        stopyPozaWalka.add(krok);
      }
      turaPierwszychStopow ??= state.turn.number;
      // W kolejnej turze bota (gdy dowody stopów z poprzedniej już są)
      // wykonaj rzut z kroku walki — dokładnie scenariusz właściciela.
      if (!rzuconyWTurzeBota && stopyWalki.size > 0 && stopyPozaWalka.size > 0
        && state.turn.number > turaPierwszychStopow && krok === 'declare_attackers') {
        session.apply(oferta);
        rzuconyWTurzeBota = true;
        assert.ok(!session.internalError, `rzut bez błędu sesji (${session.internalError ?? ''})`);
        assert.ok(!(session.view().zones.hand ?? []).some((o) => o.id === wind.id),
          'karta opuściła rękę (stos/cmentarz)');
        break;
      }
    }

    // Polityka człowieka: trzymaj rękę, graj lądy, poza tym pasuj.
    const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const inny = view.legalCommands.find((c) => c.type !== 'concede' && !c.type.startsWith('cast'));
    const cmd = keep ?? land ?? pass ?? inny ?? view.legalCommands[0];
    assert.ok(cmd, 'sesja zawsze daje człowiekowi komendę na stopie');
    session.apply(cmd);
  }

  assert.ok(stopyWalki.size > 0,
    `stop w kroku walki tury bota z ofertą (zebrane: ${[...stopyWalki].join(', ') || 'brak'})`);
  assert.ok(stopyPozaWalka.size > 0,
    `stop poza walką tury bota z ofertą (zebrane: ${[...stopyPozaWalka].join(', ') || 'brak'})`);
  assert.ok(rzuconyWTurzeBota, 'rzut wykonany z declare_attackers w turze bota');
});
