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
 * Jedna bramka jest prawdziwa i pina ją M/3: oferta rzutu powstaje tylko,
 * gdy koszt {2}{G} pokrywa mana osiągalna auto-tapem z NIETAPNIĘTYCH
 * źródeł (zasada ofert silnika).
 *
 * UZUPEŁNIENIE właściciela (tego samego dnia): „Miałem z 6 nietapniętych
 * lądów, w tym ze 3 foresty. Z jakiegoś powodu nie zatrzymywało się przy
 * Revealing Wind.” + hipoteza o zakrytych (face-down) kartach. Dochodzenie
 * wznowione: hipotezę face-down odrzucono na każdej warstwie (generowanie
 * oferty cast_spell w silniku nie zna tego warunku — oferta bezcelowej
 * karty powstaje niezależnie od zakrytych kombatantów; sceny z morphem
 * atakującym i blokującym ofertę dawały), walkę przejdzioną komenda po
 * komendzie także jest czysta (okno po blokach istnieje). Mechanizmem,
 * który reprodukuje raport SŁOWO W SŁOWO przy pełnej manie, jest PTASZEK
 * WYCISZENIA (feature 2026-08-11): wyciszona oferta rzutu przestaje
 * przerywać auto-pass — w turze przeciwnika gra jedzie bez stopu — ale
 * na stopach, które powstają z innych powodów (własne mainy, bloki),
 * przycisk rzutu nadal jest widoczny i działa. Wrażenie: „oferta tylko
 * w fazach main” mimo wolnej many. Pin M/5 zamyka ten kontrakt; panel
 * oznacza wyciszoną akcję dopiskiem „(wyciszone)” (ślad, nie cisza).
 *
 * Ślad poboczny M → zgłoszenie N (WDROŻONE, osobny test
 * `test/zgloszenie-n-scion-stop.test.js`): instant osiągalny tylko przez
 * czystą zdolność many o koszcie ręcznym (poświęcenie Sciona, CR 605.3a)
 * zatrzymuje auto-pass, gdy odblokowuje zagranie (dyrektywa właściciela).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import {
  createSession, HUMAN_ID, BOT_ID, commandOptionKey, hasMeaningfulDecisionOf,
} from '../src/table/session.js';
import { isPureManaAbilityCommand } from '../src/engine/mana-sources.js';
import { renderTableView } from '../src/table/render.js';
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

test('M/5: ptaszek wyciszenia oferty instanta = raport właściciela słowo w słowo', () => {
  // Talia jak u właściciela: JEDNA kopia Revealing Wind (tarkir-bg 1×).
  const talie = new Map([
    [HUMAN_ID, parseDeckText('# A\n27x Forest\n1x Revealing Wind\n12x Colossodon Yearling', REGISTRY).cardIds],
    [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Goblin Piker', REGISTRY).cardIds],
  ]);
  const ignorowane = new Set();
  const sesja = createSession({
    seed: 21, registry: REGISTRY, decks: talie, pauseOnBotMoves: true,
    ignoredOptionKeys: ignorowane,
  });
  const state = sesja.state;
  // Predykaty jak w sesji (do wykrycia, czy RW byłaby JEDYNĄ decyzją stopu).
  const hookiCzyste = {
    isManaOnly: (cmd) => {
      const object = state.objects.get(cmd.objectId);
      const fallback = object?.cardId ? REGISTRY.get(object.cardId)?.abilities ?? null : null;
      return isPureManaAbilityCommand(cmd, object, fallback, state);
    },
  };
  let wyciszonyKlucz = null;
  let stopyPrzedWyciszeniem = 0;
  let stopyPoPrzezSamRW = 0;
  let ofertaWidocznaPo = 0;

  for (let i = 0; i < 2500 && state.status === 'active' && state.turn.number <= 22; i++) {
    if (sesja.botPausePending) { sesja.clearBotMoves(); sesja.continueBotPlay(); continue; }
    const view = sesja.view();
    const reka = view.zones.hand ?? [];
    const wind = reka.find((o) => o.cardId === 'revealing-wind');
    const oferta = wind
      ? view.legalCommands.find((c) => c.type.startsWith('cast') && c.objectId === wind.id)
      : undefined;
    const turaBota = state.turn.activePlayerId === BOT_ID
      && state.turn.priorityPlayerId === HUMAN_ID;

    if (turaBota && oferta) {
      if (!wyciszonyKlucz) stopyPrzedWyciszeniem += 1;
      else {
        // Stop po wyciszeniu: policz, czy bez ptaszka przyczyną byłby SAM RW,
        // a z ptaszkiem już nie (czyli dlaczego sesja mimo to stoi — inna
        // decyzja; samo RW przestało przerywać auto-pass).
        const bezPtasza = hasMeaningfulDecisionOf(view, hookiCzyste);
        const zPtaszkiem = hasMeaningfulDecisionOf(view, {
          ...hookiCzyste,
          isIgnored: (c) => commandOptionKey(c) === wyciszonyKlucz,
        });
        if (bezPtasza && zPtaszkiem) ofertaWidocznaPo += 1;
        if (bezPtasza && !zPtaszkiem) stopyPoPrzezSamRW += 1;
      }
    }
    // „Klik” ptaszka dopiero po zaobserwowanych stopach w turze bota
    // (klucz per instancja, jak na stole).
    if (oferta && !wyciszonyKlucz && stopyPrzedWyciszeniem >= 2) {
      wyciszonyKlucz = commandOptionKey(oferta);
      ignorowane.add(wyciszonyKlucz);
    }
    if (oferta && wyciszonyKlucz && state.turn.activePlayerId === HUMAN_ID
      && ['main1', 'main2'].includes(state.turn.step)) ofertaWidocznaPo += 1;

    const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const stwor = view.legalCommands.find((c) => c.type.startsWith('cast')
      && reka.find((o) => o.id === c.objectId)?.cardId === 'colossodon-yearling');
    const inny = view.legalCommands.find((c) => c.type !== 'concede' && !c.type.startsWith('cast'));
    const cmd = keep ?? land ?? pass ?? stwor ?? inny ?? view.legalCommands[0];
    assert.ok(cmd, 'zawsze jest komenda');
    sesja.apply(cmd);
  }

  assert.ok(stopyPrzedWyciszeniem > 0, 'przed wyciszeniem gra stawała w turze bota na ofercie RW');
  assert.ok(wyciszonyKlucz, 'ptaszek trafił na instancję Revealing Wind');
  assert.equal(stopyPoPrzezSamRW, 0,
    'po wyciszeniu żaden stop nie ma RW jako jedynej realnej decyzji — auto-pass jedzie');
  assert.ok(ofertaWidocznaPo > 0,
    'oferta jest dalej widoczna na stopach z innych powodów (main/bloki) — wrażenie „tylko w mainach”');
});

// --- M/6: wyciszenie ma ślad na przycisku (MiniEl jak w testach rendera) ---

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.type = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
}
globalThis.document ??= { createElement: (tag) => new MiniEl(tag) };
globalThis.window ??= { confirm: () => false, innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: false }) };

function panelPoRenderze(ignorowane) {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  const cmdRzut = { type: 'cast_spell', playerId: 'p1', objectId: 'wind', targets: [] };
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    turn: { number: 4, activePlayerId: 'p2', priorityPlayerId: 'p1', phase: 'beginning', step: 'upkeep' },
    zones: {
      hand: [{ id: 'wind', cardId: 'revealing-wind', controllerId: 'p1', zone: 'hand', kind: 'spell' }],
      battlefield: [], stack: [], graveyard: [], library: [], exile: [],
    },
    legalCommands: [cmdRzut, { type: 'pass_priority', playerId: 'p1' }],
  };
  const fakeSession = {
    view: () => view,
    log: [], reasoning: [], state: { objects: new Map(), registry: REGISTRY },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => id,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  renderTableView({
    els, session: fakeSession, play: () => {}, onCardClick: () => {},
    onChoiceRequest: () => {}, ignoredOptionKeys: ignorowane, onToggleIgnoredOption: () => {},
  });
  return els.actions.children;
}

test('M/6: wyciszony rzut ma ślad na przycisku („wyciszone — auto-pass nie przerywa”)', () => {
  const klucz = commandOptionKey({ type: 'cast_spell', playerId: 'p1', objectId: 'wind', targets: [] });
  const dzieci = panelPoRenderze(new Set([klucz]));
  const przyciskRzutu = dzieci.find((b) => (b.className ?? '').includes('action-is-ignored'));
  assert.ok(przyciskRzutu, 'przycisk wyciszonej akcji ma klasę action-is-ignored');
  const notka = przyciskRzutu.children.find((c) => (c.className ?? '').includes('action-ignored-note'));
  assert.ok(notka?.textContent.includes('wyciszone'), 'notka mówi o wyciszeniu');
  // A bez wyciszenia śladu nie ma.
  const dzieci2 = panelPoRenderze(new Set());
  assert.ok(!dzieci2.some((b) => (b.className ?? '').includes('action-is-ignored')),
    'bez ptaszka przycisku bez notki');
});
