// B (zgłoszenie właściciela z żywej gry, 2026-09-21) — Toll of the Invasion:
// „w modalu wyboru karty do odrzucenia kliknięcie NAZW kart powinno otwierać
// obrazki tych kart — nie działa".
//
// Reprodukcja i przyczyna (zmierzona na artefakcie, talia z Toll of the
// Invasion, seed 7): decyzja „wskaż kartę" z ODKRYTEJ ręki przeciwnika idzie
// przez kreator jednowyborowy (`singleTargetPlanOf` → `renderMultiTargetWizard`).
// Wiersze dostają objectId karty z cudzej ręki, a w widoku gracza cudza ręka to
// wpis `{id, hidden: true}` (FoW — playerView). Ścieżka podglądu po objectId
// (`openCardFullscreen`) wymaga obiektu z WIDOCZNEJ strefy, więc nie znajduje
// nic i MILCZY (wcześnie `return`), a klik w nazwę nie robi nic. Sonda jsdom na
// prawdziwym artefakcie: nazwy mają `log-card` + `data-card-id`, ale po kliku
// `#card-fullscreen` nie dostaje klasy `active`.
//
// Naprawa: kreator rozpoznaje wiersz-obiekt z zakrytej strefy i przekazuje do
// wiersza `cardId` z pełnego stanu sesji (`hiddenObjectCardId`), a picker dla
// wiersza z cardId woła `onOpenCardByCardId` — tę samą drogę, którą otwierają
// się nazwy kart w logu i na stosie. Nazwa karty JUŻ jest w etykiecie wiersza
// (`objectName` czyta ją z sesji), więc obraz nie ujawnia niczego nowego.
//
// Piny mierzą trzy rzeczy:
//   B/1 (RED→GREEN) — wiersz z ZAKRYTEJ cudzej ręki: nazwa klikalna, podgląd
//       woła onOpenCardByCardId z DEFINICJĄ karty (nie z objectId);
//   B/2 (NIEZMIENNIK) — wiersz WIDOCZNEGO obiektu (pole bitwy): podgląd nadal
//       po objectId (`onOpenCard`) — karuzela strefy „2 / 7" bez zmian;
//   B/3 (FoW) — obiekt z BIBLIOTEKI nie staje się klikalny, nawet gdy sesja zna
//       jego cardId: zakryty wierzch biblioteki zostaje zakryty.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { singleTargetPlanOf } = await import('../src/table/multi-target.js');
const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');

/** Stub DOM-u wystarczający dla picker.js (wzorzec test/m292). */
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
    this.text = ''; this.type = ''; this.checked = false; this.disabled = false;
    this.title = ''; this.dataset = {}; this.name = '';
    this.classList = { toggle: () => {}, add: () => {} };
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.html = String(v); this.children = []; }

  get innerHTML() { return this.html ?? this.textContent; }

  appendChild(c) { this.children.push(c); return c; }

  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }

  fire(t, ev = { stopPropagation() {}, preventDefault() {} }) { for (const l of this.listeners[t] ?? []) l(ev); }

  click() { this.fire('click'); }

  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  find(pred) { return this.descendants().find(pred); }

  findAll(pred) { return this.descendants().filter(pred); }
}

function zDocumentem(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    return fn(new MiniEl('div'));
  } finally {
    globalThis.document = old;
  }
}

/**
 * Widok jak z playerView: cudza ręka = wpis bez cardId z `hidden: true`
 * (FoW), pole bitwy = pełne dane, biblioteka = zakryta dla wszystkich.
 */
function widok() {
  return {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      hand: [
        { id: 'moja-1', cardId: 'swamp', controllerId: 'p1', zone: 'hand', manaCost: 0 },
        { id: 'p2-6', controllerId: 'p2', hidden: true },
      ],
      battlefield: [{ id: 'p2-c1', cardId: 'highland-game', controllerId: 'p2', zone: 'battlefield' }],
      library: [{ id: 'lib-1', controllerId: 'p2', hidden: true }],
      stack: [], graveyard: [], exile: [],
    },
  };
}

/** Sesja: pełny stan zna definicje także zakrytych obiektów (jak w silniku). */
function sesja() {
  return {
    nameOf: (cardId) => ({ 'toll-of-the-invasion': 'Toll of the Invasion', 'highland-game': 'Highland Game', swamp: 'Swamp' }[cardId] ?? cardId),
    nameOfObject: (objectId) => ({
      'p2-6': 'Toll of the Invasion', 'p2-c1': 'Highland Game', 'lib-1': 'Ukryta karta',
    }[objectId] ?? objectId),
    state: {
      objects: new Map([
        ['p2-6', { id: 'p2-6', cardId: 'toll-of-the-invasion', zone: 'hand', controllerId: 'p2' }],
        ['p2-c1', { id: 'p2-c1', cardId: 'highland-game', zone: 'battlefield', controllerId: 'p2' }],
        ['lib-1', { id: 'lib-1', cardId: 'highland-game', zone: 'library', controllerId: 'p2' }],
      ]),
    },
  };
}

/** Plan jednowyborowy z oferty `resolve_discard_choice` (kształt z Toll). */
function planDla(ids) {
  return singleTargetPlanOf(ids.map((cardId) => ({ type: 'resolve_discard_choice', playerId: 'p1', cardId })));
}

/** Wiersz po nazwie w etykiecie (nazwy kart są krojone na osobne węzły). */
const wierszZNazwa = (host, nazwa) => host.findAll((n) => String(n.className).includes('multi-target-name'))
  .find((n) => n.textContent.startsWith(nazwa));

test('B/1: klik w nazwę karty z ODKRYTEJ ręki przeciwnika otwiera jej obraz', () => {
  const plan = planDla(['p2-6', 'moja-1']);
  assert.ok(plan, 'oferta jednowyborowa ma dać plan (L48)');
  const widziane = [];
  const otwarcia = [];
  zDocumentem((host) => {
    renderMultiTargetWizard(host, {
      view: widok(), session: sesja(), plan,
      commands: [{ type: 'resolve_discard_choice', playerId: 'p1', cardId: 'p2-6' },
        { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'moja-1' }],
      intro: 'Toll of the Invasion — wskaż kartę:',
      onOpenCard: (objectId) => otwarcia.push({ droga: 'objectId', objectId }),
      onOpenCardByCardId: (cardId) => otwarcia.push({ droga: 'cardId', cardId }),
      onComplete: () => {}, onCancel: () => {},
    });
    const wiersz = wierszZNazwa(host, 'Toll of the Invasion');
    assert.ok(wiersz, 'wiersz nazywa kartę z cudzej ręki (etykieta z sesji)');
    assert.equal(wiersz.dataset.cardId, 'toll-of-the-invasion',
      'wiersz musi nieść DEFINICJĘ karty, nie objectId zakrytego obiektu');
    widziane.push(wiersz.className);
    wiersz.click();
  });
  assert.deepEqual(otwarcia, [{ droga: 'cardId', cardId: 'toll-of-the-invasion' }],
    `klik w nazwę ma otworzyć obraz karty (było: ${JSON.stringify(otwarcia)})`);
  assert.match(widziane[0], /is-openable/, 'nazwa karty jest klikalna (klasa pickera)');
});

test('B/2 (niezmiennik): widoczny obiekt nadal otwiera się po objectId (karuzela strefy)', () => {
  const plan = planDla(['p2-c1', 'moja-1']);
  const otwarcia = [];
  zDocumentem((host) => {
    renderMultiTargetWizard(host, {
      view: widok(), session: sesja(), plan,
      commands: [{ type: 'resolve_discard_choice', playerId: 'p1', cardId: 'p2-c1' },
        { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'moja-1' }],
      onOpenCard: (objectId) => otwarcia.push({ droga: 'objectId', objectId }),
      onOpenCardByCardId: (cardId) => otwarcia.push({ droga: 'cardId', cardId }),
      onComplete: () => {}, onCancel: () => {},
    });
    const wiersz = wierszZNazwa(host, 'Highland Game');
    assert.ok(wiersz, 'wiersz nazywa stwora z pola bitwy');
    assert.equal(wiersz.dataset.cardId, 'p2-c1', 'widoczny obiekt zostaje przy objectId');
    wiersz.click();
  });
  assert.deepEqual(otwarcia, [{ droga: 'objectId', objectId: 'p2-c1' }],
    'ścieżka objectId daje pełny ekran z karuzelą strefy — nie wolno jej podmienić');
});

test('B/3 (FoW): karta z zakrytej BIBLIOTEKI nie dostaje definicji do podglądu', () => {
  // Sytuacja hipotetyczna dla tego planu (discard nie sięga biblioteki), ale
  // reguła jest ogólna: gdyby kiedyś wiersz wskazał obiekt biblioteki, NIE
  // wolno podstawić jego cardId — pełny ekran pokazałby wierzch biblioteki.
  const plan = planDla(['lib-1', 'moja-1']);
  const otwarcia = [];
  zDocumentem((host) => {
    renderMultiTargetWizard(host, {
      view: widok(), session: sesja(), plan,
      commands: [{ type: 'resolve_discard_choice', playerId: 'p1', cardId: 'lib-1' },
        { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'moja-1' }],
      onOpenCard: (objectId) => otwarcia.push({ droga: 'objectId', objectId }),
      onOpenCardByCardId: (cardId) => otwarcia.push({ droga: 'cardId', cardId }),
      onComplete: () => {}, onCancel: () => {},
    });
    const wiersz = wierszZNazwa(host, 'Ukryta karta');
    assert.ok(wiersz, 'wiersz istnieje w planie');
    assert.equal(wiersz.dataset.cardId, 'lib-1',
      'identyfikatorem podglądu zostaje obiekt biblioteki (droga objectId milczy), nie definicja karty');
    wiersz.click();
  });
  assert.deepEqual(otwarcia, [{ droga: 'objectId', objectId: 'lib-1' }],
    `droga cardId nie może dostać zakrytej karty biblioteki: ${JSON.stringify(otwarcia)}`);
});
