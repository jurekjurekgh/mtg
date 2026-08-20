// M156 — strażnik klasyfikacji celów triggerów (L28/L51: „tabela typów + jedna
// funkcja egzekwująca", po 6. wystąpieniu klasy L50 — efekt celowany bez
// klasyfikacji = remis wariantów u bota = pierwszy cel z listy, często wróg
// dla efektu przyjaznego lub własny stwór dla wrogiego).
//
// Każdy typ efektu występujący w TRIGGERZE z celem (trigger.requiresTarget)
// musi być świadomie sklasyfikowany dokładnie jednym z trzech sposobów:
//   1. WROGI     — typ ∈ HOSTILE_TRIGGER_TARGET_EFFECTS (game-state.js);
//   2. PRZYJAZNY — triggerTargetEffectFriendly(ability) === true
//                  (pump, licznik '+', grant keywordów, transfer '+');
//   3. NEUTRALNY — wpis w REVIEWED_NEUTRAL poniżej, z uzasadnieniem
//                  (zwykle: spec celu i tak ogranicza wybór do własnych
//                  obiektów, więc zła strona celu jest niemożliwa).
//
// Nowa karta z triggerem z celem i nowym typem efektu ŻEZWIĄ ten test czerwono
// — autor musi ją sklasyfikować (dopisać do zbioru w game-state.js albo
// rozszerzyć gałąź friendly), zamiast czekać, aż bot „głupnie" na stole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { HOSTILE_TRIGGER_TARGET_EFFECTS, triggerEffectIsHostile, triggerTargetEffectFriendly } from '../src/engine/game-state.js';

const REGISTRY = createCardRegistry();

/**
 * Typy przejrzane neutralne — NIE trafiają do klasyfikacji wrogi/przyjazny,
 * bo spec celu eliminuje ryzyko zlej strony (np. „wybierz własną kartę
 * z grobu") albo wybór nie różnicuje się kontrolerem. Każdy wpis ma
 * uzasadnienie; usunięcie wpisu wymaga klasyfikacji w engine.
 */
const REVIEWED_NEUTRAL = new Map([
  // animowanie WŁASNEGO artefaktu (spec artifact_you_control) — wybór tylko
  // spośród własnych obiektów.
  ['animate_linked', 'skilled-animator: spec artifact_you_control (tylko własne)'],
  // wygnanie WŁASNEGO lądu (spec land_you_control) — koszt ETB, brak strony wroga.
  ['exile_own_land', 'wormfang-newt: spec land_you_control (tylko własne)'],
  // odesłanie karty z ręki PRZECIWNIKA na wierzch jego biblioteki — cel to
  // decyzja „którą kartę", nie „czyj permanent" (spec opponent).
  ['opponent_hand_card_to_top', 'chittering-rats: cel = karta ręki przeciwnika'],
  // komponenty KOSZTU zoraline (zapłać życie/manę) — właściwy efekt to return
  // z grobu; target to własna karta w grobie.
  ['pay_life', 'zoraline: komponent kosztu przy return z grobu (własne karty)'],
  ['pay_mana', 'zoraline: komponent kosztu przy return z grobu (własne karty)'],
  // wierzch biblioteki z WŁASNEGO grobu (spec controlledBy: controller).
  ['put_graveyard_card_on_top', 'mystic-sanctuary: własna karta z grobu'],
  // reanimacja stwora z GROBU PRZECIWNIKA pod kontrolę gracza — korzystna,
  // ale kandydaci to karty w grobie, nie permanenty na stole.
  ['reanimate_under_your_control', 'puppeteer-clique: karty w grobie przeciwnika'],
  // zmiana celu czaru na stosie — unikalny cel (czar), strona bez znaczenia.
  ['redirect_spell_target', 'willbender: cel = czar na stosie'],
  // zdjęcie licznika z artefaktu/enchantmentu gracza, który wziął obrażenia —
  // kandydaci ograniczeni deskryptorem (controlledBy: damaged_player).
  ['remove_counter', 'kappa-tech-wrecker: spec controlledBy:damaged_player'],
  // ląd z WŁASNEGO grobu do ręki.
  ['return_card_from_graveyard_to_hand', 'circle-of-the-land-druid: własny ląd z grobu'],
  // permanent z WŁASNEGO grobu na pole bitwy (spec controlledBy: controller).
  ['return_permanent_from_graveyard', 'zoraline: własna karta z grobu (maxManaValue)'],
  // „base power and toughness 4/4 do końca tury" na WŁASNYM stworze
  // (spec creature_you_control); zysk zależny od bieżącego P/T, nie od strony.
  ['set_base_pt_until_end_of_turn', 'voice-of-the-vermin: spec creature_you_control'],
  // odkręcenie dowolnego nie-lądu — narzędzie utylitarnie (własne lub wroga),
  // wycena odbywa się w botach per cel (M146: untap_permanent).
  ['untap_permanent', 'narzędziowy: wycena per cel w heuristic-bocie (M146)'],
]);

test('każda zdolność triggerowa z celem ma świadomą klasyfikację', () => {
  const unclassified = [];
  for (const card of REGISTRY.all()) {
    for (const ability of card.abilities ?? []) {
      if (ability?.type !== 'triggered' || !ability.trigger?.requiresTarget) continue;
      const effs = Array.isArray(ability.effect) ? ability.effect : (ability.effect ? [ability.effect] : []);
      if (effs.length === 0) continue;
      // Klasyfikacja per ZDOLNOŚĆ (jak w engine): przyjazna / zawiera efekt
      // wrogi / wszystkie efekty przejrzane neutralne.
      if (triggerTargetEffectFriendly({ effect: ability.effect })) continue;
      if (effs.some(triggerEffectIsHostile)) continue;
      const rest = effs.map((e) => e?.type).filter(Boolean).filter((type) => !REVIEWED_NEUTRAL.has(type));
      for (const type of rest) unclassified.push(`${card.id}: ${type}`);
    }
  }
  assert.deepEqual(unclassified, [],
    `typy efektów w triggerach z celem bez klasyfikacji:\n  ${unclassified.join('\n  ')}\n`
    + 'Dopisz typ do HOSTILE_TRIGGER_TARGET_EFFECTS (efekt wrogi), rozszerz '
    + 'triggerTargetEffectFriendly (efekt przyjazny) albo dodaj wpis do '
    + 'REVIEWED_NEUTRAL z uzasadnieniem. Nie zostawiaj efektu bez klasyfikacji — '
    + 'remis wariantów u bota kieruje go w zły cel (L50/L51).');
});

test('REVIEWED_NEUTRAL nie zawiera typów sklasyfikowanych w engine', () => {
  // Nakładanie się list = niespójność: usuń wpis z jednej z nich.
  const overlap = [...REVIEWED_NEUTRAL.keys()]
    .filter((t) => HOSTILE_TRIGGER_TARGET_EFFECTS.has(t));
  assert.deepEqual(overlap, [],
    `typy i w engine, i w REVIEWED_NEUTRAL: ${overlap.join(', ')}`);
});

test('REVIEWED_NEUTRAL pokrywa wyłącznie typy realnie występujące w katalogu', () => {
  const used = new Set();
  for (const card of REGISTRY.all()) {
    for (const ability of card.abilities ?? []) {
      if (ability?.type !== 'triggered' || !ability.trigger?.requiresTarget) continue;
      const effs = Array.isArray(ability.effect) ? ability.effect : (ability.effect ? [ability.effect] : []);
      for (const e of effs) if (e?.type) used.add(e.type);
    }
  }
  const stale = [...REVIEWED_NEUTRAL.keys()].filter((t) => !used.has(t));
  assert.deepEqual(stale, [],
    `wpisy REVIEWED_NEUTRAL bez karty w katalogu (usuń po zmianie katalogu): ${stale.join(', ')}`);
});
