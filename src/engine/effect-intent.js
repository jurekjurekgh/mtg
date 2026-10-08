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
  // Batch 59 (Scavenging Harpy): wygnanie karty z grobu PRZECIWNIKA — cel
  // wybiera się spośród cudzych kart, więc bot bierze najwartościowszą.
  'exile_graveyard_card',
  'exile_nonland_permanent_linked', 'bounce_permanent', 'bounce_to_library_top',
  // PMSSB-1 (fala A): bottom i Vanish to też wrogie odbicia (L41 z
  // REMOVAL_EFFECTS w bocie; katalog nie ma dziś triggerów z tymi typami,
  // ale klasyfikacja musi być kompletna na wejście pierwszej takiej karty).
  'bounce_to_library_bottom', 'owner_library_top_or_bottom',
  'sacrifice_permanent', 'player_sacrifices_creature', 'tap_permanent', 'shrink',
  'pump_negative', 'cant_block', 'mill_cards', 'dont_untap_next_untap_step',
  // Batch60 (Timely Interference, kicked): wymuszony blok — wrogi wobec celu
  // (lustro cant_block: odbiera decyzję w combacie).
  'blocks_if_able_until_end_of_turn',
  // M177/E (Azorius Justiciar): detain odbiera celowi atak/blok/aktywacje.
  'detain',
]);
// Liczniki wrogie dla obdarowanego: `stun` (zamiast odkręcenia, CR 122.1d/614.6)
// i `finality` (śmierć zamieniona na wygnanie). Liczniki MINUSOWE obniżają
// statystyki (CR 122.1), więc są wrogie niezależnie od tego, czy katalog ma
// dziś kartę, która je rozdaje triggerem — reguła po NAZWIE licznika, nie po
// nazwie karty (ADR 0002). O4 z audytu #147 (tamta lista niosła tylko
// stun/finality, a bot miał własną — rozjazd klasy L41 jak przy PMSSB-23/F1).
const HOSTILE_COUNTERS = new Set(['stun', 'finality']);
const MINUS_STAT_COUNTER_RE = /^-[0-9]+\/[+-]?[0-9]+$/;

/**
 * JEDNO źródło klasyfikacji licznika (CR 122.1) dla silnika i bota:
 * wrogi = z zamkniętej listy (`stun`/`finality`) albo minusowy statystycznie
 * (`-1/-1`, `-0/-1`, w przyszłości `-2/-2` — wzorzec, nie wyliczanka).
 * Bot woła tę funkcję w `counterEffectValue` (L41: klasyfikacja liczników
 * miała trzy kopie, zanim PMSSB-23/F1 je scalił).
 */
export function counterIsHostile(counter) {
  if (typeof counter !== 'string') return false;
  return HOSTILE_COUNTERS.has(counter) || MINUS_STAT_COUNTER_RE.test(counter);
}

/**
 * Pojedynczy efekt wrogi wobec swojego celu (M156 — wydzielone dla
 * strażnika klasyfikacji i triggerTargetEffectFriendly; JEDNA prawda,
 * nie trzy kopie — por. L41). Ujemny pump i wrogi licznik to efekty wrogie
 * mimo typu nieobecnego wprost w zbiorze.
 */
export function triggerEffectIsHostile(effect) {
  if (!effect?.type) return false;
  if (effect.type === 'lose_life' && effect.scope === 'target') return true;
  if (HOSTILE_TRIGGER_TARGET_EFFECTS.has(effect.type)) return true;
  if (effect.type === 'pump' && ((effect.power ?? 0) < 0 || (effect.toughness ?? 0) < 0)) return true;
  // Batch 52 (Fourth Bridge Prowler): ujemny buff „-1/-1 do końca tury" wobec
  // dowolnego stwora to efekt wrogi — ta sama reguła co ujemny pump (ADR 0002).
  if (effect.type === 'buff_creature_until_end_of_turn' && ((effect.power ?? 0) < 0 || (effect.toughness ?? 0) < 0)) return true;
  if (effect.type === 'add_counter' && counterIsHostile(effect.counter)) return true;
  return false;
}
/**
 * B (znalezisko testera, Fourth Bridge Prowler): debuff P/T triggera —
 * {power, toughness} (ujemne delty) dla efektów osłabiających stwora
 * (`pump` / `buff_creature_until_end_of_turn` z ujemną — ten sam warunek co
 * w triggerEffectIsHostile), inaczej null. Generyczne (ADR 0002): bot
 * premiuje ZABÓJSTWO debuffem (704.5f), nie największy cel.
 */
/**
 * C (znalezisko właściciela 2026-09-12, Academy Journeymage): czy
 * rozstrzygnięcie triggera USUWA cel ze stołu (zniszczenie / wygnanie /
 * odbicie do ręki / biblioteki / poświęcenie). Wtedy z celem giną też
 * przyklejone do niego AURY (trafiają na cmentarz właściciela, CR 704.5m) —
 * bot premiuje zdejmowanie obłożonego wrogiego stwora (dodatkowa karta
 * wroga w plecy) i unika zrywania WŁASNYCH aur. Generyczne (ADR 0002):
 * wyłącznie po typach efektów. Tapnięcie / shrink / obrażenia (bez
 * gwarancji zejścia) celowo poza sygnałem — aury zostają na stole.
 */
const TARGET_REMOVING_TRIGGER_EFFECTS = new Set([
  'destroy_permanent', 'destroy_if_least_power',
  'exile_permanent', 'exile_target_creature', 'exile_opponent_creature',
  'exile_nonland_permanent_linked',
  'bounce_permanent', 'bounce_to_library_top',
  // PMSSB-1 (fala A): jak wyżej — bottom/Vanish zrywają aury (CR 704.5m).
  'bounce_to_library_bottom', 'owner_library_top_or_bottom',
  'sacrifice_permanent',
]);
export function triggerTargetRemovesTargetOf(ability) {
  const effs = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  return effs.some((e) => TARGET_REMOVING_TRIGGER_EFFECTS.has(e?.type));
}
export function triggerTargetDebuffOf(ability) {
  const effs = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  for (const e of effs) {
    if ((e?.type === 'pump' || e?.type === 'buff_creature_until_end_of_turn')
      && ((e.power ?? 0) < 0 || (e.toughness ?? 0) < 0)) {
      return { power: Math.min(0, e.power ?? 0), toughness: Math.min(0, e.toughness ?? 0) };
    }
  }
  return null;
}
/**
 * B (znalezisko właściciela 2026-09-12, Battle-Rattle Shaman): pump SIŁY
 * triggera — {power, toughness} (dodatnie delty) dla efektów pompujących
 * siłę stwora (`pump` / `buff_creature_until_end_of_turn` z power > 0
 * i toughness ≥ 0 — ten sam warunek znakowy co „przyjazny" w
 * triggerTargetEffectFriendly), inaczej null. Generyczne (ADR 0002): bot
 * celuje pumpem siły stwora, którym MOŻE atakować — +X/+0 na stworze,
 * który nie atakuje, wygasa bez skutku (Shaman odpala się na początku
 * combatu, PRZED deklaracją ataku). Pump samej toughness (+0/+Y) celowo
 * poza sygnałem: chory stwór nadal blokuje, więc buff ma sens.
 */
/**
 * M407 (uwaga z gry — Shiva/Mesmerize): sygnał daru ewazji „can't be blocked
 * this turn" (deskryptor `cant_be_blocked`, ADR 0002). Komenda niesie go jak
 * `debuff`/`pump`, żeby bot wyceniał cel dedykowaną polityką ataku
 * (`cantBeBlockedTargetValue`): dar ma wartość wyłącznie na stworze, który
 * w tej turze ZAATAKUJE, i to największym (właściciel: „mógł wybrać np.
 * siebie — 4/3, wtedy wjechałby we mnie i zadał obrażenia”).
 */
export function triggerTargetEvasionGrantOf(ability) {
  const effs = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  return effs.some((e) => e?.type === 'cant_be_blocked');
}
/**
 * F (zgłoszenie właściciela 2026-10-08, Warmaker Gunship / Reclusive
 * Artificer): deskryptor obrażeń triggera (`effect: {type:'damage', amount}`),
 * inaczej null. Kwotę niesie jako LICZBĘ albo WARIANT dynamiczny
 * (`artifacts_you_control` = „equal to the number of artifacts you control"),
 * więc sam deskryptor nie wystarczy — kwotę liczy wspólny resolver silnika
 * (`resolveDamageAmount`, L41). Ten helper odpowiada wyłącznie na pytanie o
 * INTENCJĘ (jak friendly/debuff/pump): czy trigger celowi ZADAJE obrażenia.
 */
export function triggerTargetDamageEffectOf(ability) {
  const effs = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  return effs.find((e) => e?.type === 'damage') ?? null;
}
export function triggerTargetPowerPumpOf(ability) {
  const effs = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  for (const e of effs) {
    if ((e?.type === 'pump' || e?.type === 'buff_creature_until_end_of_turn')
      && (e.power ?? 0) > 0 && (e.toughness ?? 0) >= 0) {
      return { power: e.power ?? 0, toughness: e.toughness ?? 0 };
    }
  }
  return null;
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
    // M407 (uwaga z gry — Shiva/Mesmerize): „Target creature can't be blocked
    // this turn" (deskryptor cant_be_blocked) to DAR przyjazny dla obdarowanego
    // — jak grant_keywords (M156/F1). Bez tej gałęzi friendly=false stawiało
    // wycenę na gałęzi WROGIEJ (−20−wartość), więc bot wybierał NAJSŁABSZEGO
    // własnego stwora (właściciel: „kreaturę, która ma najmniejszy power”).
    || e?.type === 'cant_be_blocked'
    // C-R2 (audyt Batch53, 2026-09-05): zwrot WŁASNEJ karty z grobu — do ręki
    // (Ironclad Slayer, Circle Druid) albo na wierzch biblioteki (Mystic
    // Sanctuary) — to korzyść kontrolera, a spec „controlledBy: controller"
    // i tak ogranicza cele do własnych kart. Bez tej gałęzi friendly=false,
    // wycena C-R2 dawała znak wrogi (−20−wartość) i bot wybierał „brak celu"
    // zamiast NAJLEPSZEJ karty grobu.
    || e?.type === 'return_card_from_graveyard_to_hand'
    || e?.type === 'put_graveyard_card_on_top'
    // PMSSB-41/B (zgłoszenie właściciela, Nanoform Sentinel): ODKRĘCENIE
    // permanentu jest PRZYJAZNE dla obdarowanego — odkręcona karta działa dla
    // SWOJEGO kontrolera (bloker/atakujący/źródło many wraca do gry).
    // Bez tej gałęzi `friendly` było `false` dla KAŻDEGO celu, więc bot
    // wyceniał trigger gałęzią WROGĄ i oddawał odkręcenie wrogowi: pomiar
    // PRZED dał wybór „odkręć LĄD PRZECIWNIKA" (58 vs −29 dla własnego stwora).
    // Wartość CELU liczy osobna miara `untapTargetValue` (bot) — ta sama
    // w czarze, aktywacji i triggerze (L41).
    || e?.type === 'untap_permanent');
}

/**
 * Działania dostępne przy stosowaniu opcjonalnego efektu. CR 608.2d:
 * nie można wybrać czynności niemożliwej (np. tapnięcia tapped permanenta).
 * Wspólne dla oferty/walidacji engine oraz prognozy bota na PUBLICZNYM celu.
 * To lista do WYBORU, nie automatyczny toggle; odmowa to osobna odpowiedź `apply:false`.
 */
export function optionalEffectVariants(effect, target) {
  if (!effect) return [];
  if (effect.type !== 'tap_or_untap_permanent') return [effect];
  if (!target || (target.zone != null && target.zone !== 'battlefield')) return [];
  return [{ ...effect, type: target.tapped ? 'untap_permanent' : 'tap_permanent' }];
}
