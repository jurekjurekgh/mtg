import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import fs from 'node:fs';
import { PLAY_REGEX, SAFE_REGEX, GREEDY_PRIORITY, ACTION_VERBS, SAFE_VERBS, GREEDY_VERBS, DYNAMIC_VERBS } from '../tools/table-tester/actions.mjs';

/**
 * E2 sesji arena/01a09c9e (2026-09-13): pętla jakości Żywym Testerem nie
 * ćwiczyła ścieżki kliku w pojazd, choć talie z pojazdami były w partiach.
 * Wzorzec: PR #115 zmienił etykietę crew/saddle z „Aktywuj:" na
 * „Obsadź:"/„Osiodłaj:" (znalezisko A1), a sterownik testera znał tylko
 * `^Aktywuj:` — etykieta stała w panelu 54 razy, zero kliknięć, żaden
 * detektor nie zapalił (to nie „brak akcji", więc klasa L46 milczy).
 *
 * Ten test pilnuje KONTRAKTU: każdy czasownik etykiety akcji z panelu
 * („Twoje działania", `commandLabel`) trafia do puli ruchów testera.
 * Dla crew/saddle etykiety generuje prawdziwy `commandLabel` — zmiana
 * nazwy etykiety w silniku zapali ten test (nie da się ukryć drifu).
 */

const REGISTRY = createCardRegistry();
const NAMES = {
  veh: 'Irontread Crusher', mount: 'Trained Arynx',
  big: 'Woolly Loxodon', helper: 'Ainok Tracker',
};
const VIEW = {
  playerId: 'p1',
  turn: { number: 5, step: 'precombat_main' },
  players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
  zones: {
    battlefield: [
      { id: 'veh', cardId: 'irontread-crusher' },
      { id: 'mount', cardId: 'trained-arynx' },
      { id: 'big', cardId: 'woolly-loxodon' },
      { id: 'helper', cardId: 'ainok-tracker' },
    ],
    hand: [], graveyard: [], exile: [], stack: [],
  },
  legalCommands: [],
};
const SESSION = {
  view: () => VIEW,
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => NAMES[o?.id] ?? o?.cardId ?? '?',
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: () => [],
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
};

const priorytet = (label) => GREEDY_PRIORITY.find((re) => re.test(label));

test('E2/1: crew i saddle z silnika trafiają do puli ruchów i priorytetów', () => {
  const crew = commandLabel(
    { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['big'] },
    SESSION, VIEW,
  );
  const saddle = commandLabel(
    { type: 'activate_ability', playerId: 'p1', objectId: 'mount', abilityIndex: 1, crewCreatureIds: ['helper'] },
    SESSION, VIEW,
  );
  for (const [label, verb] of [[crew, 'Obsadź'], [saddle, 'Osiodłaj']]) {
    assert.match(label, new RegExp(`^${verb}:`), 'etykieta silnika (A1) nadal nazywa czynność');
    assert.ok(PLAY_REGEX.test(label), `pula ruchów testera nie zna „${label}"`);
    assert.ok(priorytet(label), `profil greedy nie kliknie „${label}"`);
    assert.ok(SAFE_REGEX.test(label), `profil defensive nie widzi „${label}"`);
  }
  // Kolejność: obsada pojazdu przed deklaracją atakujących (pojazd ma szansę
  // wejść do walki w tej samej turze — uzasadnienie w actions.mjs).
  const pozycja = (label) => GREEDY_PRIORITY.findIndex((re) => re.test(label));
  assert.ok(
    pozycja('Obsadź: Irontread Crusher') < pozycja('Wybierz: Deklaracja atakujących'),
    'Obsadź: przed Wybierz: (kolejność priorytetów greedy)',
  );
});

test('E2/2: czasowniki panelu, których pula nie znała, są w puli', () => {
  // Dokładnie te czasowniki `commandLabel` istniały w silniku, a sterownik ich
  // nie matchował (blind spot klasy M256) — poza crew/saddle nie trafiły do
  // żadnego transkryptu z 12 partii audytu, więc bez tego testu nikt by ich
  // nie zauważył do pierwszego rzutu tą kartą.
  const etykiety = [
    'Obróć twarzą do góry: Den Protector (Cloak) (koszt 3)',
    'Ucieczka: Deadbridge Goliath (koszt {2}{G}) → cel: Wilk',
    'Przygoda: Bonecrusher Giant (koszt {1}{R})',
    'Zagraj z przygody: Bonecrusher Giant (koszt {2}{R})',
    'Ninjutsu: Ninja of the Deep Hours (koszt {1}{U}, wróć Ninja of the Deep Hours)',
    'Channel: Myojin of Night\'s Reach (koszt {1}{G}) → szukaj podstawowego lądu',
    'Obsadź: Irontread Crusher (koszt załoga 3) — wybierz załogę do tapnięcia (moc ≥ 3)',
    'Osiodłaj: Trained Arynx (koszt saddle 2) — wybierz stwory do tapnięcia (moc ≥ 2)',
  ];
  for (const label of etykiety) {
    assert.ok(PLAY_REGEX.test(label), `pula ruchów nie zna „${label}"`);
  }
});

test('E2/3: katalog akcji nadal w puli (regresja katalogu, nie tylko nowości)', () => {
  const etykiety = [
    'Zagraj ląd: Forest',
    'Rzuć: Shock (koszt {R})',
    'Rzuć za warp: Weftblade Enhancer (koszt {1}{U})',
    'Rzuć za surge: Reckless Bushwhacker (koszt {1}{R})',
    'Zagraj: Grizzly Bears (koszt {1}{G})',
    'Aktywuj: Seer\'s Lantern (koszt 2, T) — scry 1',
    'Cycling: Forgotten Cave (koszt {1}) → dobierz kartę',
    'Wyposaż: Bonesplitter → Woolly Loxodon (koszt {1})',
    'Flashback: Deep Analysis (koszt {1}{U}) → cel: Nieprzyjaciel',
    'Bloodrush: Skinbrand Goblin (koszt {R}, odrzuć) → atakujący +2/+0',
    'Wybierz: Deklaracja atakujących',
    'cel triggera: Bomat Bazaar Barge',
    // Uwaga C1 właściciela (2026-09-19): etykieta tytułowa grupy kreatora
    // tapX (bez czasownika z tabeli).
    'Merchant’s Dockhand — przejrzyj X kart z wierzchu biblioteki — jedną weź do ręki, resztę na spód',
    'podziel 2 obrażenia',
    'Cel czaru: Lightning Bolt',
    'Cel zdolności: Prodigal Sorcerer',
    'Bestow: Hopeful Eidolon (koszt {2}{W})',
    'Aura: Silken Strength → Merchant\'s Dockhand',
  ];
  for (const label of etykiety) {
    assert.ok(PLAY_REGEX.test(label), `pula ruchów zgubiła „${label}"`);
  }
});

test('E2/4: pass i poddanie nie są akcją ani priorytetem profilu', () => {
  for (const label of ['Dalej (pass)', 'Poddaj partię']) {
    assert.ok(!PLAY_REGEX.test(label), `„${label}" nie może być pulą ruchów`);
    assert.equal(priorytet(label), undefined, `„${label}" nie może być priorytetem greedy`);
    assert.ok(!SAFE_REGEX.test(label), `„${label}" nie może być akcją bezpieczną`);
  }
});

test('E2/5: każdy czasownik tabeli istnieje w render.js (rot etykiety zapala test)', () => {
  const zrodlo = fs.readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8');
  for (const verb of ACTION_VERBS) {
    if (DYNAMIC_VERBS.includes(verb)) continue;
    assert.ok(
      zrodlo.includes(`\`${verb}: `),
      `render.js nie wystawia już literału „${verb}:" — zaktualizuj tabelę w actions.mjs`,
    );
  }
  // Obsadź/Osiodłaj/Aktywuj są dynamiczne (ternaria `actionVerb`) — ich
  // obecność pilnuje E2/1 na etykiecie z prawdziwego commandLabel.
  assert.deepEqual(DYNAMIC_VERBS, ['Aktywuj', 'Obsadź', 'Osiodłaj']);
});

test('E2/6: klasyfikacja czasowników jest spójna (pula ⊇ bezpieczne i priorytety)', () => {
  for (const verb of ACTION_VERBS) {
    assert.ok(PLAY_REGEX.test(`${verb}: X`), `pula nie zna czasownika „${verb}:"`);
  }
  for (const verb of SAFE_VERBS) {
    assert.ok(ACTION_VERBS.includes(verb), `bezpieczny czasownik spoza tabeli: ${verb}`);
    assert.ok(SAFE_REGEX.test(`${verb}: X`), `profil defensive nie zna „${verb}:"`);
    assert.ok(PLAY_REGEX.test(`${verb}: X`), `bezpieczne musi być podzbiorem puli: ${verb}`);
  }
  for (const verb of GREEDY_VERBS) {
    assert.ok(ACTION_VERBS.includes(verb), `priorytet spoza tabeli: ${verb}`);
    assert.ok(PLAY_REGEX.test(`${verb}: X`), `priorytet musi być podzbiorem puli: ${verb}`);
  }
  // Priorytety: jeden wzorzec na czasownik + cztery wzorce grupowe (cel
  // triggera, podział obrażeń, grupy celów czarów/zdolności oraz grupa
  // kreatora tapX „przejrzyj X kart” — uwaga C1 właściciela, 2026-09-19)
  // — inaczej cicha zguba wpisu.
  assert.equal(GREEDY_PRIORITY.length, GREEDY_VERBS.length + 4);
});
