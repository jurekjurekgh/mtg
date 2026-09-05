// C-R1 (audyt Batch53 / domkniecie sesji arena/01a071d1): straznik pokrycia
// tabeli ETB_EFFECT_BONUS w heuristic-bot.js. Tabela jest KONSERWATYWNA —
// typy poza nia dostaja bonus 0, co przy wycenie rzutu stwora (C-R1: premia
// ETB steruje kolejnoscia rzutow) oznacza, ze bot traktuje karty z takim ETB
// jak gole cialo. Strażnik wymusza, by kazdy typ efektu triggera wejscia
// (enter_battlefield) uzyty przez >=2 karty katalogu byl reprezentowany w
// tabeli — albo jawnie wyjatkowany (samoszkodzenie / koszt / obsluzone w
// dedykowanej galezi cast_permanent). Zapobiega cichemu dopisaniu karty z
// nowym, cennym efektem ETB bez odpowiedniej wyceny (L29/L31).
//
// Mutacja: usuniecie wpisu z ETB_EFFECT_BONUS i zdejecie go z wyjatkow musi
// czerwienic ten test (nowa karta z tym typem przestaje byc pokryta).
import { createCardRegistry } from '../src/cards/card-data.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOT = resolve(__dirname, '../src/controllers/heuristic-bot.js');

// Klucze obsługiwane w ETB_EFFECT_BONUS (regex: "  nazwa: (e, view, req) =>").
function coveredEtbBonusKeys() {
  const src = readFileSync(BOT, 'utf8');
  return new Set([...src.matchAll(/^\s*([a-z_]+):\s*\([^)]*\)\s*=>/gm)].map((m) => m[1]));
}

// Wyjatki celowe — typy ETB, ktore NIE powinny dostac bonusu w tej tabeli:
//  - samoszkodzenie / koszt (penalizowane lub obojetne w innych galeziach),
//  - obsluzone przez dedykowana logike w cast_permanent (etbAttach / reanimate
//    / reflexReady / warunki),
//  - niszowe (1 karta) poza progiem >=2 kart.
const INTENTIONAL_EXCEPTIONS = {
  // Samoszkodzenie — penalizowane w galezi cast_permanent (M169/K).
  damage_to_controller: 'samookaleczenie — kara w cast_permanent',
  lose_life: 'samookaleczenie — kara w cast_permanent',
  // Wlasne mielenie — ryzyko deck-outu; bonus 0 celowo.
  mill_cards: 'self-mill — ryzyko deck-outu, brak bonusu',
  // Koszty platnosci przy wejsciu.
  pay_life: 'koszt zycia, nie skutek',
  pay_mana: 'koszt many, nie skutek',
  pay_x_cast_from_graveyard: 'rzut z grobu — wycena przez freeCastVariantScore',
  // Obsluzone w dedykowanych galeziach cast_permanent:
  attach_self_to_target: 'equipment ETB — galeź etbAttach w cast_permanent',
  reanimate_under_your_control: 'reanimacja — galeź w cast_permanent (+2xmoc)',
  reflexive_sacrifice: 'refleks — galeź reflexReady w resolve_sacrifice_choice',
  conditional: 'efekt warunkowy — sterowany przez condition w etbEnterBonusValue',
  // Niszowe (1 karta) poza progiem pokrycia.
  add_flying_counter_to_face_down_you_control: 'niszowe (veiled-ascension, 1 karta)',
  damage_from_enchanted_power: 'niszowe aura (pain-for-all, 1 karta)',
  untap_enchanted_permanent: 'minor aura (silken-strength, 1 karta)',
  job_select: 'lagodne uporzadkowanie biblioteki (2 karty) — poza progiem wartosci',
};

const MIN_CARDS = 2;

test('każdy typ efektu ETB (>=2 karty) jest w ETB_EFFECT_BONUS lub jawnie wyjątkowany', () => {
  const covered = coveredEtbBonusKeys();
  const reg = createCardRegistry();
  const byType = {};
  for (const card of reg.all()) {
    for (const ab of card.abilities ?? []) {
      if (ab?.type !== 'triggered' || ab.trigger?.event !== 'enter_battlefield') continue;
      const effs = Array.isArray(ab.effect) ? ab.effect : [ab.effect];
      for (const e of effs) {
        const t = e?.type;
        if (!t) continue;
        (byType[t] ??= new Set()).add(card.id);
      }
    }
  }
  const uncovered = [];
  for (const [type, cards] of Object.entries(byType)) {
    if (cards.size < MIN_CARDS) continue;
    const known = covered.has(type) || type in INTENTIONAL_EXCEPTIONS;
    if (!known) uncovered.push({ type, count: cards.size, ids: [...cards] });
  }
  assert.deepEqual(
    uncovered,
    [],
    `Niepokryte typy efektow ETB (>=${MIN_CARDS} karty) wymagaja wpisu w ETB_EFFECT_BONUS `
      + `lub wyjatku celowego:\n`
      + uncovered.map((u) => `  ${u.type} (${u.count}: ${u.ids.join(', ')})`).join('\n'),
  );
});

test('ETB_EFFECT_BONUS zawiera nowo dodane typy korzystne (kierunek strażnika)', () => {
  // Przeciwwaga L5: straznik mierzy REGULE, nie tylko niepustosc pliku.
  const covered = coveredEtbBonusKeys();
  for (const key of ['untap_permanent', 'springbloom_sacrifice_search', 'fertile_thicket_reveal']) {
    assert.ok(covered.has(key), `ETB_EFFECT_BONUS nie zna klucza: ${key}`);
  }
});
