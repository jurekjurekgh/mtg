// M157 — strażnik inwentaryzacji wycen (TODO właściciela z review PR #66,
// wzorzec L28/L51): KAŻDY typ efektu występujący w CELOWANYM czarze
// (spell.targets / spell.modes[].targets) albo CELOWANEJ zdolności
// aktywowanej (ability.targets) musi być świadomie wyceniony w
// heuristic-bocie — inaczej remis wariantów = „pierwsza oferta z listy"
// (klasa L50: bot pomaga przeciwnikowi lub marnuje kartę).
//
// Kryterium „wyceniony": typ dosłownie wymieniony w kodzie
// src/controllers/heuristic-bot.js (gałąź wyceny albo tabela
// HOSTILE_PERMANENT_EFFECTS/REMOVAL_EFFECTS). To strażnik KLASYFIKACJI
// (wymusza świadomą decyzję), nie test zachowania — zachowania pilnują
// testy bot-quality-*.
//
// Ścieżkę TRIGGERÓW pilnuje osobny strażnik
// (test/bot-trigger-target-classification-guard.test.js, M156/L51).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const BOT_SOURCE = readFileSync('src/controllers/heuristic-bot.js', 'utf-8');

/**
 * Typy przejrzane i ŚWIADOMIE niewycenione — z uzasadnieniem. Każdy wpis
 * musi tłumaczyć, dlaczego remis wariantów nie szkodzi (rider przy valuanym
 * efekcie głównym / wartość wariantów równa / wybór spośród własnych kart).
 */
const REVIEWED_UNVALUED = new Map([
  // Rider „can't be regenerated" przy obrażeniach (Rage of Purphoros) —
  // wariant różnicuje cel przez efekt damage (wyceniony).
  ['cant_be_regenerated_this_turn', 'rider przy damage (wycenionym)'],
  // Clash to rider Release the Ants; wariant różnicuje cel przez damage.
  ['clash', 'rider przy damage (wycenionym)'],
  // Wrapper warunkowy — wyceniane są efekty WEWNĘTRZNE (then/else).
  ['conditional', 'wrapper; wyceniane efekty wewnętrzne'],
  // Rider „destroy equipment attached" (Awaken the Sleeper) przy valuanym
  // gain_control/pump.
  ['destroy_equipment_attached', 'rider przy gain_control (wycenionym)'],
  // Rider ferocious (Force Away) — wariant różnicuje cel przez bounce.
  ['ferocious_draw_discard', 'rider przy bounce (wycenionym)'],
  // Nadanie zdolności (Fake Your Own Death) — wariant różnicowany przez
  // pump +2/+0 (wyceniony, M146: kara za złe okno).
  ['grant_abilities', 'rider przy pump (wycenionym)'],
  // Proliferate (Spread the Sickness) — wariant różnicowany przez destroy.
  ['proliferate', 'rider przy destroy (wycenionym)'],
  // Wybór jedzenia (Insatiable Appetite) — wszystkie warianty równoważne
  // (poświęcenie dowolnego Food).
  ['sacrifice_food_choice', 'warianty równoważne (dowolny Food)'],
  // Zwrot karty stwora z grobu (Grave Exchange) — warianty to karty WŁASNE
  // równorzędne; brak szkody dla strony (pierwsza oferta).
  ['return_creature_card_to_hand', 'warianty równoważne (własna karta z grobu)'],
  // Kopia artefaktu (Cogwork Assembler) — kandydaci to WŁASNE artefakty;
  // remis wybiera pierwszy (suboptimalnie, bez szkody dla strony).
  // Świadome: poprawa wymaga wyceny wartości artefaktu — patrz backlog.
  ['create_copy_token', 'remis = pierwszy własny artefakt (suboptimalne, nie samoszkodne)'],
  // Animacja własnego stwora do końca tury (Silvannus's Invoker) — kandydaci
  // to WŁASNE stwory; remis wybiera pierwszy (suboptimalnie, bez szkody).
  ['animate_permanent_until_end_of_turn', 'remis = pierwszy własny stwór (suboptimalne)'],
  // Odłożenie karty grobu na spód (Barkform Harvester) — warianty równoważne.
  ['put_graveyard_card_on_bottom', 'warianty równoważne (własna karta z grobu)'],
  // Przypięcie własnego equipmentu (Kazuul's Toll Collector) — kandydaci
  // własne; remis bez szkody dla strony.
  ['attach_equipment_to_source', 'remis = pierwszy własny equipment'],
]);

function effs(e) {
  return Array.isArray(e) ? e : (e ? [e] : []);
}

function targetedEffectTypes() {
  const rows = new Map(); // type -> Set('spell:karta'|'ability:karta')
  for (const card of REGISTRY.all()) {
    const spell = card.spell;
    if (spell) {
      for (const mode of spell.modes ?? [spell]) {
        if ((mode.targets ?? []).length === 0) continue;
        for (const e of effs(mode.effects)) {
          if (!e?.type) continue;
          if (!rows.has(e.type)) rows.set(e.type, new Set());
          rows.get(e.type).add(`spell:${card.id}`);
        }
      }
    }
    for (const ab of card.abilities ?? []) {
      if (ab?.type !== 'activated' || (ab.targets ?? []).length === 0) continue;
      for (const e of effs(ab.effect)) {
        if (!e?.type) continue;
        if (!rows.has(e.type)) rows.set(e.type, new Set());
        rows.get(e.type).add(`ability:${card.id}`);
      }
    }
  }
  return rows;
}

test('każdy typ efektu w CELOWANYM czarze/zdolności ma wycenę w heuristic-bocie', () => {
  const unvalued = [];
  for (const [type, where] of targetedEffectTypes()) {
    if (BOT_SOURCE.includes(`'${type}'`)) continue;
    if (REVIEWED_UNVALUED.has(type)) continue;
    unvalued.push(`${type} (${[...where].slice(0, 3).join(', ')})`);
  }
  assert.deepEqual(unvalued, [],
    `typy efektów celowanych bez wyceny w heuristic-bocie:\n  ${unvalued.join('\n  ')}\n`
    + 'Dopisz gałąź wyceny albo tabelę (HOSTILE_PERMANENT_EFFECTS/REMOVAL_EFFECTS), '
    + 'albo dodaj świadomy wpis do REVIEWED_UNVALUED z uzasadnieniem. Remis '
    + 'wariantów kieruje bota w zły cel (L50/L51).');
});

test('REVIEWED_UNVALUED pokrywa wyłącznie typy realnie występujące', () => {
  const used = targetedEffectTypes();
  const stale = [...REVIEWED_UNVALUED.keys()].filter((t) => !used.has(t));
  assert.deepEqual(stale, [],
    `wpisy bez karty w katalogu (usuń po zmianach katalogu): ${stale.join(', ')}`);
});
