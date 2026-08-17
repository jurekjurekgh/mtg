// M124/A i M124/B — zgłoszenia właściciela z testów na telefonie (2026-08-17).
//
// A. „Panel wyboru blokujących. Przycisk Bez bloków jest nieaktywny."
//    Diagnoza: przycisk NIGDY nie był `disabled` (sonda w jsdom potwierdziła
//    `disabled=false`, `pointer-events:auto`). On tylko WYGLĄDAŁ na martwy —
//    jedyne, co robił, to czyszczenie zaznaczeń i przerysowanie wizarda.
//    Przy pustym wyborze (typowy przypadek: gracz od razu nie chce blokować)
//    klik nie zmieniał NICZEGO na ekranie. Naprawa: „Bez bloków"/„Bez ataku"
//    to DEKLARACJA (wysyła pustą komendę i zamyka wizard), a nie reset formularza.
//
// B. „Chronic Flooding — trigger (enchanted_permanent_tapped)".
//    M122 dodało etykietę i strażnika na kompletność mapy TRIGGER_EVENT_LABELS,
//    ale `case 'ability_triggered'` ma TRZY ścieżki renderu i tylko ostatnia
//    mapowała slug. Strażnik sprawdzał słownik, nie miejsca użycia — dokładnie
//    ten sam wzorzec co L30 (jedno zabezpieczenie, wiele ścieżek).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describeGameEvent, TRIGGER_EVENT_LABELS } from '../src/table/session.js';

const HELPERS = { nameOf: (id) => `Karta(${id})`, nameOfObject: (id) => `Obiekt(${id})` };
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const describe = (event) => describeGameEvent(event, HELPERS, NAMES);

// --- B: wszystkie trzy ścieżki `ability_triggered` mapują slug -------------

test('M124/B: trigger z zapłatą pokazuje polską etykietę, nie slug', () => {
  const text = describe({
    type: 'ability_triggered', trigger: 'enchanted_permanent_tapped',
    objectId: 'o1', paid: 2,
  });
  assert.doesNotMatch(text, /enchanted_permanent_tapped/, 'surowy slug wyciekł do gracza');
  assert.match(text, /zatapnięcie zaczarowanego permanentu/);
});

test('M124/B: trigger z poświęceniem pokazuje polską etykietę, nie slug', () => {
  const text = describe({
    type: 'ability_triggered', trigger: 'enchanted_permanent_tapped',
    cardId: 'chronic-flooding', sacrificed: true,
  });
  assert.doesNotMatch(text, /enchanted_permanent_tapped/);
  assert.match(text, /zatapnięcie zaczarowanego permanentu/);
});

test('M124/B: zwykły trigger (ścieżka domyślna) nadal mapuje slug', () => {
  const text = describe({
    type: 'ability_triggered', trigger: 'enchanted_permanent_tapped',
    cardId: 'chronic-flooding',
  });
  assert.doesNotMatch(text, /enchanted_permanent_tapped/);
  assert.match(text, /zatapnięcie zaczarowanego permanentu/);
});

test('M124/B: ŻADNA ścieżka ability_triggered nie wstawia surowego e.trigger', () => {
  // Strażnik na wzorzec, nie na pojedynczy slug: gdyby ktoś dołożył czwartą
  // gałąź `return` z `${e.trigger}`, ten test ją złapie.
  const source = fs.readFileSync('src/table/session.js', 'utf8');
  const start = source.indexOf("case 'ability_triggered': {");
  assert.ok(start > 0, 'case ability_triggered istnieje');
  const body = source.slice(start, source.indexOf("case 'land_type_changed'", start));
  assert.doesNotMatch(body, /trigger \(\$\{e\.trigger\}\)/,
    'każda ścieżka musi używać zmapowanej etykiety, nie surowego e.trigger');
});

test('M124/B: etykieta pochodzi ze wspólnego słownika', () => {
  assert.equal(TRIGGER_EVENT_LABELS.enchanted_permanent_tapped,
    'zatapnięcie zaczarowanego permanentu');
});

// --- A: „Bez bloków" / „Bez ataku" deklarują, a nie tylko czyszczą ---------

test('M124/A: „Bez bloków" wysyła pustą deklarację i zamyka wizard', () => {
  const source = fs.readFileSync('src/table/choice-request.js', 'utf8');
  const start = source.indexOf("'Bez ataku' : 'Bez bloków'");
  assert.ok(start > 0, 'przycisk istnieje');
  const body = source.slice(start, start + 2400);
  // Sedno naprawy: handler MUSI wołać onComplete (deklaracja), a nie tylko
  // przerysowywać wizard — inaczej klik przy pustym wyborze nic nie robi.
  // Handler musi WYSŁAĆ deklarację (onComplete), a nie tylko przerysować
  // wizard. Preferujemy ofertę wprost z `options` — engine reprezentuje
  // „brak bloków" jako pustą mapę `{}`, więc ręcznie budowane
  // `{atakujący: []}` nie odpowiadałoby żadnej legalnej komendzie.
  assert.match(body, /const emptyOffer = \(options \?\? \[\]\)\.find/,
    '„Bez bloków" musi wziąć pustą ofertę z widoku');
  assert.match(body, /onComplete\?\.\(emptyOffer \?\?/,
    '„Bez bloków" musi wysłać deklarację, nie tylko czyścić zaznaczenia');
  assert.match(body, /declare_attackers/, '„Bez ataku" też deklaruje');
});

test('M124/A: przycisk nie jest wyłączany atrybutem disabled', () => {
  // Zgłoszenie brzmiało „nieaktywny", więc pilnujemy też, żeby naprawa nie
  // poszła w drugą stronę i nikt nie dodał tu `disabled` jako „rozwiązania".
  const source = fs.readFileSync('src/table/choice-request.js', 'utf8');
  const start = source.indexOf("'Bez ataku' : 'Bez bloków'");
  const body = source.slice(start, start + 2400);
  assert.doesNotMatch(body, /clear\.disabled\s*=\s*true/,
    'przycisk ma być aktywny — problemem było brak skutku, nie blokada');
});

test('M124/A: przy przymusowym ataku pusta deklaracja nie jest wysyłana', () => {
  // CR 508.1d: stwór z „attacks each combat if able" musi zaatakować.
  // „Bez ataku" nie może wtedy wysłać pustej listy — zamiast tego czyści
  // opcjonalnych i tłumaczy, dlaczego reszta zostaje.
  const source = fs.readFileSync('src/table/choice-request.js', 'utf8');
  const start = source.indexOf("'Bez ataku' : 'Bez bloków'");
  const body = source.slice(start, start + 2400);
  assert.match(body, /mandatory\.size > 0/, 'przymus ataku musi być obsłużony');
  assert.match(body, /const wanted = \[\.\.\.mandatory\]/,
    'przy przymusie deklarujemy wyłącznie stwory zobowiązane do ataku');
});
