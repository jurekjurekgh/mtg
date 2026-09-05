// Klasyfikacja INTENCJI efektu (przyjazny vs wrogi) — wydzielone z
// `game-state.js` w M203/2, żeby `spells.js` (oferty rzutów) i `game-state.js`
// (oferty celów triggerów) korzystały z JEDNEGO źródła bez cyklu importów
// (strażnik: test/import-cycles). Generyczne (ADR 0002): wyłącznie po
// deskryptorach efektów, zero nazw kart.

/**
 * M150/A — czy trigger celowany (resolve_trigger_target) jest PRZYJAZNY dla
 * celu (pump/licznik na WŁASNYM stworze — Battle-Rattle Shaman, ETB „put a
 * +1/+1 counter on target creature\") czy WROGI (obrażenia/usunięcie — Forge
 * Devil, Jill, Reclusive Artificer). Generyczne (ADR 0002): wyłącznie po
 * deskryptorach efektów, zero nazw kart. Bot wycenia cel na tej podstawie,
 * więc nie wybiera WROGIEGO stwora dla przyjaznego pumpu.
 */
// Eksportowane dla strażnika klasyfikacji celów triggerów
// (test/bot-trigger-target-classification-guard.test.js) — każdy typ efektu
// w triggerze z celem musi być świadomie sklasyfikowany (wrogi / przyjazny /
// przejrzany neutralny), inaczej remis wariantów u bota kieruje efekt
// w zły cel (klasa L50 — 6 wystąpień: M96, M135, M138/Z1, M146, M156/F1, Q2).
export const HOSTILE_TRIGGER_TARGET_EFFECTS = new Set([
  // Batch 45 (Pain for All): obrażenia = moc zaczarowanego stwora — wrogi.
  'damage_from_enchanted_power',
  'damage', 'damage_from_target_power', 'damage_divided', 'damage_to_controller', 'destroy_permanent',
  'destroy_if_least_power', 'destroy_artifact_gain_life_mana_value',
  'exile_permanent', 'exile_target_creature', 'exile_opponent_creature',
  'exile_nonland_permanent_linked', 'bounce_permanent', 'bounce_to_library_top',
  'sacrifice_permanent', 'player_sacrifices_creature', 'tap_permanent', 'shrink',
  'pump_negative', 'cant_block', 'mill_cards', 'dont_untap_next_untap_step',
  // M177/E (Azorius Justiciar): detain odbiera celowi atak/blok/aktywacje.
  'detain',
]);
// Liczniki wrogie dla obdarowanego (stun — nie odkręca; finality — śmierć
// zamieniona na wygnanie). Pozostałe liczniki '+' są przyjazne (gałąź poniżej).
const HOSTILE_COUNTERS = new Set(['stun', 'finality']);

/**
 * Pojedynczy efekt wrogi wobec swojego celu (M156 — wydzielone dla
 * strażnika klasyfikacji i triggerTargetEffectFriendly; JEDNA prawda,
 * nie trzy kopie — por. L41). Ujemny pump i wrogi licznik to efekty wrogie
 * mimo typu nieobecnego wprost w zbiorze.
 */
export function triggerEffectIsHostile(effect) {
  if (!effect?.type) return false;
  if (HOSTILE_TRIGGER_TARGET_EFFECTS.has(effect.type)) return true;
  if (effect.type === 'pump' && ((effect.power ?? 0) < 0 || (effect.toughness ?? 0) < 0)) return true;
  // Batch 52 (Fourth Bridge Prowler): ujemny buff „-1/-1 do końca tury" wobec
  // dowolnego stwora to efekt wrogi — ta sama reguła co ujemny pump (ADR 0002).
  if (effect.type === 'buff_creature_until_end_of_turn' && ((effect.power ?? 0) < 0 || (effect.toughness ?? 0) < 0)) return true;
  if (effect.type === 'add_counter' && HOSTILE_COUNTERS.has(effect.counter)) return true;
  return false;
}
// Keywordy SZKODLIWE dla obdarowanego (nadanie ich wrogowi to zysk, nie strata).
// W katalogu dziś nie występują, ale klasyfikacja „każdy grant = przyjazny"
// bez tego zbioru byłaby pułapką przy pierwszej karcie typu „gains defender".
const HOSTILE_GRANTED_KEYWORDS = new Set(['defender', 'cant_block', 'cant_attack']);
export function triggerTargetEffectFriendly(ability) {
  const effs = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  if (effs.length === 0) return false;
  if (effs.some(triggerEffectIsHostile)) return false;
  // Przyjazny, gdy któryś efekt to pozytywny pump (power/toughness > 0) albo
  // licznik +1/+1 (counter zaczyna się od '+') — celujemy własny stwór.
  return effs.some((e) =>
    (e?.type === 'pump' && (e.power ?? 0) >= 0 && (e.toughness ?? 0) >= 0
      && (e.power ?? 0) + (e.toughness ?? 0) > 0)
    || (e?.type === 'add_counter' && typeof e.counter === 'string' && e.counter.startsWith('+'))
    // M156/F1 (Lotusguard Disciple): nadanie keywordów do końca tury jest
    // przyjazne dla obdarowanego (lifelink, indestructible, flying...) — bez
    // tej gałęzi friendly=false i bot obdarowywał NAJLEPSZEGO stwora wroga.
    || (e?.type === 'grant_keywords_until_end_of_turn' && (e.keywords ?? []).length > 0
      && !(e.keywords ?? []).some((k) => HOSTILE_GRANTED_KEYWORDS.has(k)))
    // M156/Q2 (pętla jakości, Servant of the Scale): przeniesienie liczników
    // +1/+1 na cel po śmierci źródła to efekt przyjazny — bez tej gałęzi
    // friendly=false i bot obdarzał NAJSŁABSZEGO własnego stwora (kara
    // -20-wartość zamiast premii 30+wartość).
    || (e?.type === 'transfer_counters_on_dies' && typeof e.counter === 'string'
      && e.counter.startsWith('+'))
    // Batch 52: dodatni buff „+X/+Y do końca tury" wobec dowolnego stwora
    // jest przyjazny (ujemny klasyfikuje triggerEffectIsHostile powyżej).
    || (e?.type === 'buff_creature_until_end_of_turn'
      && (e.power ?? 0) >= 0 && (e.toughness ?? 0) >= 0
      && (e.power ?? 0) + (e.toughness ?? 0) > 0)
    // C-R2 (audyt Batch53, 2026-09-05): zwrot WŁASNEJ karty z grobu — do ręki
    // (Ironclad Slayer, Circle Druid) albo na wierzch biblioteki (Mystic
    // Sanctuary) — to korzyść kontrolera, a spec „controlledBy: controller"
    // i tak ogranicza cele do własnych kart. Bez tej gałęzi friendly=false,
    // wycena C-R2 dawała znak wrogi (−20−wartość) i bot wybierał „brak celu"
    // zamiast NAJLEPSZEJ karty grobu.
    || e?.type === 'return_card_from_graveyard_to_hand'
    || e?.type === 'put_graveyard_card_on_top');
}
