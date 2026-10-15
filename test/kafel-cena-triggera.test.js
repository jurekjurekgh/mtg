// Kafel karty musi POKAZYWAĆ CENĘ opcjonalnej opłaty triggera („you may pay
// …" / „you may remove … from it. When you do, …").
//
// Powód (pętla jakości ADR 0021, 2026-10-14, E8): Żywy Tester zobaczył na
// kaflu Sentry Bota darmowy „licznik +1/+1 na twoich stworach" — lista kosztów
// w `describeTriggered` znała `payMana` i `payLife`, a nie znała `payEnergy`.
// Ten sam strażnik wykrył drugą, starszą lukę tej samej klasy: Kappa
// Tech-Wrecker („you may remove a deathtouch counter from it") obiecywał
// darmowe wygnanie artefaktu/zaklęcia.
//
// L29/L31: kafel jest OBIETNICĄ wobec gracza — jeśli skutek jest warunkowy,
// cena musi stać obok niego. Strażnik przechodzi CAŁY katalog (nie listę nazw
// — ADR 0002), więc nowy deskryptor opłaty bez obsługi w kaflu czerwieni test
// bez czyjegokolwiek przypomnienia.
//
// Mutacja: usunięcie dowolnej gałęzi `trigger.pay*` z `describeTriggered`
// (albo dodanie nowej opłaty bez obsługi) zapala ten strażnik.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { rulesText } from '../src/table/render.js';
import { costSymbols } from '../src/table/mana-icons.js';

const registry = createCardRegistry();

const kafel = (def) => rulesText({
  cardId: def.id, controllerId: 'p1', abilities: def.abilities, keywords: def.keywords ?? [],
});

/** Oczekiwane fragmenty ceny dla deskryptorów opłaty triggera. */
function oczekiwaneCeny(trigger) {
  const fragmenty = [];
  if (trigger.payMana > 0) fragmenty.push(costSymbols(trigger.payMana, trigger.payColors));
  if (trigger.payLife > 0) fragmenty.push(`${trigger.payLife} życia`);
  if (trigger.payEnergy > 0) fragmenty.push(`{E}×${trigger.payEnergy}`);
  if (trigger.payCounter?.counter) fragmenty.push(trigger.payCounter.counter);
  return fragmenty;
}

test('KAFEL/CENA: każda opłata triggera w całym katalogu jest na kaflu', () => {
  const braki = [];
  let sprawdzone = 0;
  for (const def of registry.all()) {
    for (const ability of def.abilities ?? []) {
      const trigger = ability?.trigger;
      const fragmenty = oczekiwaneCeny(trigger ?? {});
      if (fragmenty.length === 0) continue;
      sprawdzone += 1;
      const tekst = kafel(def);
      for (const fragment of fragmenty) {
        if (!tekst.includes(fragment)) braki.push(`${def.id} (${trigger.event}): brak „${fragment}" w kaflu`);
      }
      // Warunkowość musi być widoczna, nie tylko cena (F9: płatność jest
      // warunkiem skutku, nie darmowym riderem). Wyjątkiem są karty
      // z „zapłać albo poświęć" — mają własne, jednoznaczne brzmienie.
      if (!trigger.sacrificeIfUnpaid
        && !tekst.includes('jeśli tak') && !tekst.includes('albo ją poświęć')) {
        braki.push(`${def.id} (${trigger.event}): brak warunku „jeśli tak" w kaflu`);
      }
    }
  }
  // Stan 2026-10-14: 12 triggerów z opłatą w katalogu (payMana 9, payLife 3,
  // payEnergy 1, payCounter 1 — część kart ma po dwie zdolności). Próg pilnuje,
  // by strażnik nie „przeszedł" na pustym zbiorze po zmianie rejestru.
  assert.ok(sprawdzone >= 12, `katalog ma ${sprawdzone} triggerów z opłatą — oczekiwano co najmniej 12`);
  assert.deepEqual(braki, [], `kafle bez ceny opłaty:\n  ${braki.join('\n  ')}`);
});

test('KAFEL/CENA: Sentry Bot — pełna cena {E}×3 i dynamiczna kwota energii', () => {
  const tekst = kafel(registry.get('sentry-bot'));
  assert.ok(tekst.includes('możesz zapłacić {E}×3 energii'), tekst);
  assert.ok(tekst.includes('otrzymaj {E} za każde stworzenie atakujące ciebie'), tekst);
});

test('KAFEL/CENA: Kappa Tech-Wrecker — koszt znacznika deathtouch widoczny', () => {
  // Oracle: „you may remove a deathtouch counter from it. When you do, exile
  // target artifact or enchantment that player controls." — kafel pokazywał
  // samo wygnanie (cena znikła), a to ta sama klasa błędu co Sentry Bot.
  const tekst = kafel(registry.get('kappa-tech-wrecker'));
  assert.ok(tekst.includes('możesz zapłacić usunięciem znacznika deathtouch'), tekst);
  assert.ok(tekst.includes('jeśli tak'), tekst);
});

test('KAFEL/CENA: karty referencyjne zachowują dotychczasowe brzmienie', () => {
  const przypadki = [
    ['panic-spellbomb', 'możesz zapłacić {R}'],
    ['furious-forebear', 'możesz zapłacić {1}{W}'],
    ['ambulatory-edifice', 'możesz zapłacić 2 życia'],
    ['zoraline', 'możesz zapłacić {W}{B} i 2 życia'],
    ['rupture-spire', 'zapłać {1} albo ją poświęć'],
    ['gryffwing-cavalry', 'możesz zapłacić {1}{W}'],
  ];
  for (const [id, fragment] of przypadki) {
    const tekst = kafel(registry.get(id));
    assert.ok(tekst.includes(fragment), `${id}: brak „${fragment}" w: ${tekst}`);
  }
});
