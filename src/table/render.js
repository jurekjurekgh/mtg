import {
  IMAGE_MODE, cardImageSources, hoverImageSources, hoverModeLabel, hoverPreviewShape,
  nextHoverMode, HOVER_MODES, tileImageSources,
} from './card-images.js';
import { choiceRequest } from '../protocol/types.js';
import { UNDERCITY_ROOMS } from '../engine/effects.js';
import { DAY_NIGHT_TOKEN, UNDERCITY_DUNGEON } from '../cards/card-data.js';
import {
  PLAYER_NAMES, HUMAN_ID, commandOptionKey, TRIGGER_EVENT_LABELS,
  FACE_DOWN_LABEL, faceDownName,
} from './session.js';
import { escapeHtml, manaCostHtml } from './mana-icons.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { installTapGesture } from './gestures.js';

/**
 * Renderowanie stołu: PlayerView + log sesji → DOM (M7).
 *
 * Zasady granicy: moduł dostaje wyłącznie publiczny widok sesji
 * (session.view()) i nigdy nie mutuje stanu gry — akcje gracza wracają
 * do sesji przez callback `play(cmd)`. Teksty rysujemy przez textContent
 * (świadomie bez innerHTML, zob. audyt §7), żeby markup kart i komend
 * nigdy nie został zinterpretowany jako HTML.
 *
 * M7: karty są „kaflami\" wyglądającymi jak karty (syntetyczna kolorowa twarz
 * z nazwą, kosztem, typem i P/T) zamiast tekstowych chipów. Stół jest na całą
 * szerokość (wróg u góry, Ty na dole, ręka na samym dole); groby/exile/biblioteka
 * są w warstwie inspektora stref; hover i klik otwierają podgląd karty.
 */

/** Polskie etykiety skróconych komend ze śladu bota (B5, summarize() z bota). */
const REASONING_ACTION_LABELS = Object.freeze({
  play_land: 'Zagranie landa',
  tap_for_mana: 'Tapnięcie many',
  draw_card: 'Dobranie karty',
  cast_permanent: 'Zagranie permanentu',
  plot_card: 'Plotowanie karty',
  suspend_card: 'Zawieszenie karty',
  warp_card: 'Rzut za koszt warp',
  cast_spell: 'Rzucenie czaru',
  cast_cleave: 'Rzucenie z Cleave',
  activate_ability: 'Aktywacja zdolności',
  resolve_combat: 'Rozstrzygnięcie walki',
  resolve_scry: 'Scry',
  resolve_surveil: 'Surveil (wybór kart do grobu)',
  resolve_backup: 'Backup (wybór celu)',
  resolve_devour_choice: 'Devour (wybór poświęcenia)',
  resolve_endure_choice: 'Endure (liczniki/token)',
  resolve_delirium_target: 'Delirium (wybór celu)',
  resolve_mentor_target: 'Mentor (wybór celu)',
  resolve_graveyard_top_choice: 'Karty z grobu na wierzch biblioteki',
  resolve_food_choice: 'Food (poświęcenie)',
  resolve_amass_choice: 'Amass — która Armia?',
  resolve_discover_choice: 'Discover (wybór)',
  resolve_explore_choice: 'Explore (wybór)',
  resolve_craft_exile: 'Craft (wybór wygnania)',
  resolve_hand_creature: 'Położenie stwora z ręki',
  resolve_legend_choice: 'Prawo legend (który zostaje?)',
  resolve_trigger_target: 'Cel triggera (wybór)',
  resolve_grave_free_cast: 'Darmowy rzut z grobu (zapłać {X})',
  resolve_opponent_target: 'Wskaż cel obrażeń (wybór przeciwnika)',
  resolve_optional_trigger_choice: 'Efekt „you may"',
  resolve_enter_as_copy: 'Wejście jako kopia',
  resolve_destroy_equipment_choice: 'Zniszczenie equipmentu',
  resolve_mulligan_choice: 'Mulligan (ręka startowa)',
  resolve_mulligan_bottom_choice: 'Odłożenie kart na spód',
  resolve_search_choice: 'Szukanie w bibliotece',
  resolve_fertile_thicket: 'Fertile Thicket (wierzch biblioteki)',
  resolve_springbloom: 'Springbloom Druid (poświęcenie landa)',
  resolve_damage_assignment: 'Rozdzielenie obrażeń bojowych',
  resolve_color_choice: 'Wybór koloru',
  resolve_index_choice: 'Index (kolejność wierzchu)',
  resolve_modal_choice: 'Tryb czaru („choose one")',
  resolve_redirect_choice: 'Przekierowanie obrażeń',
  resolve_proliferate: 'Proliferate (licznik)',
  resolve_hand_top_choice: 'Karta z ręki na wierzch',
  // M166/D (Inferno Titan).
  resolve_damage_division: 'Podział obrażeń (kwoty)',
  resolve_land_type_choice: 'Wybór typu landa',
  resolve_library_placement: 'Wierzch czy spód biblioteki',
  resolve_pay_or_sacrifice: 'Zapłata albo poświęcenie',
  resolve_optional_pay_choice: 'Dobrowolna dopłata',
  resolve_moonlit_choice: 'Moonlit (wybór efektu)',
  resolve_damage_target: 'Cel obrażeń',
  resolve_reveal_order: 'Kolejność kart na wierzchu',
  resolve_discard_choice: 'Odrzucenie karty',
  resolve_sacrifice_choice: 'Poświęcenie stwora',
  // M151 (audyt żywym testerem): brakująca etykieta wyciekała jako surowy
  // identyfikator „resolve_exploit_choice" w panelu akcji (Silumgar Butcher —
  // Exploit). Teraz czytelny polski opis.
  resolve_exploit_choice: 'Exploit (wybór poświęcenia)',
  declare_attackers: 'Deklaracja atakujących',
  declare_blockers: 'Deklaracja blokujących',
  pass_priority: 'Pass priorytetu',
  concede: 'Poddanie',
});

/** Czytelna nazwa skróconej komendy (np. „attack[id,id]” → „Atak (2 stworów)”). */
function reasoningActionLabel(summary) {
  if (summary === 'declare_attackers') return 'Deklaracja ataku';
  if (summary.startsWith('attack[')) {
    const ids = summary.slice(7, -1);
    return ids ? `Atak (${ids.split(',').length} stworów)` : 'Brak ataku';
  }
  if (summary.startsWith('block[')) return 'Blok';
  if (summary.startsWith('cast_permanent')) return REASONING_ACTION_LABELS.cast_permanent;
  if (summary.startsWith('cast_spell')) return REASONING_ACTION_LABELS.cast_spell;
  if (summary.startsWith('cast_cleave')) return REASONING_ACTION_LABELS.cast_cleave;
  return REASONING_ACTION_LABELS[summary] ?? summary;
}

/**
 * Czytelny, jednozdaniowy opis jednego śladu decyzji bota (B5):
 * „T3 · Faza główna — Zagranie landa (ocena 90); alternatywy: …".
 * To jest „dlaczego bot zagrał X": bot wybiera opcję z najwyższą oceną.
 */
export function botReasoningText(entry) {
  // Trace bota zna tylko krok („main" dla obu faz głównych) — bez fazy.
  const step = entry.step === 'main' ? 'Faza główna' : (STEP_LABELS[entry.step] ?? entry.step);
  const chosen = reasoningActionLabel(entry.chosen);
  const alternatives = (entry.options ?? [])
    .filter((option) => option.cmd !== entry.chosen)
    .slice(0, 3)
    .map((option) => `${reasoningActionLabel(option.cmd)} (${option.score})`)
    .join(', ');
  const base = `T${entry.turn} · ${step} — ${chosen} (ocena ${entry.score})`;
  if (!alternatives) return `${base}.`;
  const total = (entry.options?.length ?? 0);
  return `${base}; najlepsza z ${total} opcji. Alternatywy: ${alternatives}.`;
}

const STEP_LABELS = Object.freeze({
  untap: 'Odkręcenie',
  upkeep: 'Podtrzymanie',
  draw: 'Dobieranie',
  beginning_of_combat: 'Początek walki',
  declare_attackers: 'Deklaracja atakujących',
  declare_blockers: 'Deklaracja blokujących',
  combat_damage: 'Obrażenia w walce',
  end_of_combat: 'Koniec walki',
  end: 'Krok końcowy',
  cleanup: 'Sprzątanie',
});

/**
 * Urządzenia dotykowe (iPad/iPhone): hover-podgląd jest zbędny i gryzie się
 * z menu kontekstowym po tapnięciu (tap emuluje mouseenter + click). Na
 * dotyku wpinamy wyłącznie klik; hover zostaje tylko dla prawdziwych wskaźników.
 */
function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) return true;
  } catch { /* starsze przeglądarki bez matchMedia */ }
  return 'ontouchstart' in window;
}

const TOUCH_DEVICE = isTouchDevice();

/** Czytelna nazwa bieżącego kroku tury. */
export function stepLabel(turn) {
  if (turn.step === 'main') return turn.phase === 'postcombat_main' ? 'Druga faza główna' : 'Faza główna';
  return STEP_LABELS[turn.step] ?? turn.step;
}

/** M73d (B): polskie nazwy typów celów (koniec surowych slugów w opisach). */
const TARGET_TYPE_LABELS = Object.freeze({
  creature: 'stwór', player: 'gracz', any_target: 'dowolny cel',
  // M166/B (Cacophodon — untap target permanent).
  permanent: 'permanent',
  artifact: 'artefakt', artifact_or_creature: 'artefakt lub stwór',
  artifact_or_enchantment: 'artefakt lub enchantment',
  artifact_or_creature_or_enchantment: 'artefakt, stwór lub enchantment',
  artifact_or_creature_or_land: 'artefakt, stwór lub land',
  tapped_creature: 'zatapnięty stwór',
  untapped_creature: 'odtapnięty stwór',
  artifact_you_control: 'twój artefakt', land: 'ląd', land_you_control: 'twój ląd',
  enchantment: 'enchantment', nonland_permanent: 'permanent niebędący lądem',
  other_nonland_permanent: 'inny permanent niebędący lądem',
  nonartifact_nonblack_creature: 'stwór niebędący artefaktem ani czarnym',
  creature_you_control: 'twój stwór', creature_opponent_controls: 'stwór przeciwnika',
  creature_or_vehicle: 'stwór lub Vehicle',
  creature_with_subtypes: 'stwór z podtypem', creature_with_power_at_least: 'stwór o sile ≥',
  creature_card_in_graveyard: 'karta-stwór w grobie', creature_card_in_opponent_graveyard: 'karta-stwór w grobie przeciwnika',
  card_in_graveyard: 'karta w grobie', permanent_card_in_graveyard: 'karta-permanent w grobie',
  instant_or_sorcery_card_in_graveyard: 'instant/sorcery w grobie',
  noncreature_spell_on_stack: 'czar niebędący stworem na stosie',
  spell_on_stack: 'czar na stosie',
  artifact_spell_on_stack: 'czar-artefakt na stosie',
  opponent: 'przeciwnik',
  // M126/#4 (Żywy Tester): w tekście kafli świeciły surowe slugi
  // („cel: creature_without_subtype", „cel: equipment_you_control").
  // Audyt WSZYSTKICH 32 typów celu w bazie wykazał 6 braków — tester trafił
  // dwa, reszta czekała na rzadszy układ partii. Strażnik w testach pilnuje
  // kompletności mapy (L29: fallback `?? type` to cichy wyciek, nie ochrona).
  creature_without_subtype: 'stwór bez podtypu',
  creature_with_keyword: 'stwór z wybranym słowem kluczowym',
  creature_opponent_damaged_this_turn: 'stwór, któremu przeciwnik zadał obrażenia w tej turze',
  equipment_you_control: 'twój ekwipunek',
  land_card_in_graveyard: 'karta-ląd w grobie',
  spell_with_single_target_on_stack: 'czar z jednym celem na stosie',
});
/**
 * M138/Z5 (audyt Żywym Testerem): etykieta celu musi nieść PARAMETR specyfikacji,
 * inaczej zdanie jest urwane w połowie. Na stole widziałem „cel: stwór o sile ≥”
 * (bez liczby!), „cel: stwór bez podtypu” (Oracle: non-Mount) i „cel: stwór
 * z podtypem” (Oracle: Wolf or Werewolf). Mapa `TARGET_TYPE_LABELS` opisuje sam
 * TYP; tu doklejamy to, co odróżnia konkretny cel od dowolnego innego.
 *
 * Przyjmuje spec (obiekt) albo goły string typu — stare wywołania działają dalej.
 */
const targetTypeLabel = (spec) => {
  const type = typeof spec === 'string' ? spec : spec?.type;
  const base = TARGET_TYPE_LABELS[type] ?? type;
  if (typeof spec === 'string' || !spec) return base;
  if (type === 'creature_without_subtype' && spec.subtype) return `stwór bez podtypu ${spec.subtype}`;
  if (type === 'creature_with_subtypes' && spec.subtypes?.length) return `stwór z podtypem ${spec.subtypes.join(' lub ')}`;
  if (type === 'creature_with_power_at_least' && spec.min != null) return `stwór o sile ≥ ${spec.min}`;
  if (type === 'creature_with_keyword' && spec.keyword) return `stwór ze słowem kluczowym ${KEYWORD_LABELS[spec.keyword] ?? spec.keyword}`;
  return base;
};

/** Opis efektów czaru do wiersza karty („Obrażenia 2, cel: stworek"). */
export function describeSpellEffects(spell) {
  if (!spell) return '';
  // Modal „Choose one" (Steel Sabotage, Selesnya Charm): kafle nie miały
  // spell.effects — puste pole reguł. Opisujemy tryby z nazwami.
  if (Array.isArray(spell.modes) && spell.modes.length > 0) {
    const modeBits = spell.modes.map((mode) => {
      const inner = describeSpellEffects({
        effects: mode.effects ?? [],
        targets: mode.targets ?? [],
      });
      const label = mode.name ?? 'tryb';
      return inner ? `${label}: ${inner}` : label;
    });
    return `wybierz jedno — ${modeBits.join(' / ')}`;
  }
  const parts = (spell.effects ?? []).map((effect) => {
    if (effect.type === 'damage') return `Obrażenia ${effect.amount}`;
    if (effect.type === 'pump') return `+${effect.power}/+${effect.toughness} do końca tury`;
    if (effect.type === 'create_token') {
      // amount > 1: „N× token" (Gather the Townsfolk 2×, Howl 2×+, Undead Servant wg grobu).
      // Domyślny amount=1 (ETB tworzące jeden token, np. Crested Herdcaller 3/3) —
      // zostaje bez „N×" (zgodnie z dotychczasowym opisem).
      const count = Number.isFinite(effect.amount) && effect.amount > 1 ? `\u00d7${effect.amount} ` : '';
      // Dynamiczna liczba tokenów (Howl of the Night Pack: „for each Forest
      // you control" — amount to string). Doklejamy czytelny opis źródła
      // liczby, zamiast gołego „Stwórz 2/2 Wolf" (audyt diamentowy cz.2).
      const dynamicNote = typeof effect.amount === 'string' ? ` (${dynamicAmount(effect.amount)})` : '';
      // Fateful hour (CR 702.86, Gather the Townsfolk): gdy amountIfCondition
      // podaje inną liczbę tokenów dla niskiego życia, doklej „(X przy życiu ≤ N)".
      const fateful = Number.isFinite(effect.ifLifeAtMost) && Number.isFinite(effect.amountIfCondition)
        ? ` (${effect.amountIfCondition} przy \u017cyciu \u2264 ${effect.ifLifeAtMost})` : '';
      return `Stw\u00f3rz ${count}${dynamicPt(effect.power)}/${dynamicPt(effect.toughness)} ${effect.name ?? 'token'}${dynamicNote}${fateful}`;
    }
    return describeEffect(effect);
  });
  const target = (spell.targets ?? []).length
    ? (spell.targets[0].type === 'any_target' ? 'dowolny cel' : `cel: ${targetTypeLabel(spell.targets[0])}`)
    : '';
  return [parts.join(' + '), target].filter(Boolean).join(' \u00b7 ');
}

/**
 * Feature 2026-08-11: typy komend, które dostają „ptaszek wyciszenia"
 * (nie przerywaj auto-passu) w panelu „Twoje działania". Świadomie BEZ
 * generycznych akcji: pass, dobranie, ląd, deklaracje walki, resolve_*.
 */
export const OPTION_IGNORABLE_TYPES = Object.freeze([
  'cast_permanent', 'cast_spell', 'cast_cleave', 'cast_escape', 'cast_flashback',
  'cast_adventure', 'cast_adventure_creature', 'activate_ability', 'plot_card', 'suspend_card',
]);

const ACTION_RANK = Object.freeze({
  resolve_mulligan_choice: -3, resolve_mulligan_bottom_choice: -3, resolve_backup: -2, resolve_scry: -1, resolve_surveil: -1, draw_card: 0, play_land: 1, tap_for_mana: 2, plot_card: 3, suspend_card: 3, warp_card: 3, cast_permanent: 4, cast_spell: 5, cast_cleave: 5, activate_ability: 5,
  declare_attackers: 5, declare_blockers: 6, resolve_combat: 7, pass_priority: 8, concede: 9,
});

/**
 * Grupuje warianty, które są jednym wyborem użytkownika: cel czaru/zdolności,
 * wartość X, wybór atakującego dla ninjutsu albo decyzja scry/backup. Combat
 * pozostaje jawnie enumerowany, bo ma osobny model deklaracji w engine.
 */
function choiceRequestGroupKey(command) {
  // M87: tryby modalne (Steel Sabotage Kontr vs Odbicie) i warianty
  // poświęcenia (Village Rites) nie mogą wpadać do jednego „Cel czaru".
  if (command.type === 'cast_spell' && (command.targets?.length || command.sacrificeTargetId || command.modeIndex != null)) {
    return `spell:${command.objectId}:${command.modeIndex ?? 'x'}`;
  }
  if (command.type === 'cast_cleave' && command.targets?.length) return `cleave:${command.objectId}`;
  if (command.type === 'cast_permanent' && command.targets?.length) {
    return `permanent:${command.objectId}:${Boolean(command.bestow)}`;
  }
  // Phyrexian mana (CR 118.9): warianty płatności {W/P} — maną albo 2 życiem.
  if (command.type === 'cast_escape' && command.escapeExileIds?.length) {
    return `escape:${command.objectId}`;
  }
  if (command.type === 'cast_permanent' && command.phyrexianPayWithLife != null) {
    return `permanent-x:${command.objectId}`;
  }
  if (command.type === 'activate_ability'
    && (command.targets?.length || command.xValue != null || command.attackerId != null || command.tapCreatureId != null || command.tapOtherCreatureId != null || command.crewCreatureIds?.length
      // M160/B1 (Seismic Monstrosaur): warianty kosztu „poświęć ląd” (jeden
      // wpis per ląd) grupują się jak crew/tap — bez tego panel pokazywał
      // N identycznych wpisów „Aktywuj: … — dobierz 1 kartę”.
      || command.sacrificeLandId != null)) {
    return `ability:${command.objectId}:${command.abilityIndex}`;
  }
  if (command.type === 'resolve_scry') return 'resolve_scry';
  if (command.type === 'resolve_surveil') return 'resolve_surveil';
  if (command.type === 'resolve_index_choice') return 'resolve_index_choice';
  if (command.type === 'resolve_damage_assignment') return 'resolve_damage_assignment';
  if (command.type === 'resolve_clash_choice') return 'resolve_clash_choice';
  if (command.type === 'resolve_room_target') return 'resolve_room_target';
  if (command.type === 'resolve_backup') return 'resolve_backup';
  if (command.type === 'resolve_sacrifice_choice') return 'resolve_sacrifice_choice';
  if (command.type === 'resolve_trigger_target') return 'resolve_trigger_target';
  if (command.type === 'resolve_grave_free_cast') return 'resolve_grave_free_cast';
  if (command.type === 'resolve_opponent_target') return 'resolve_opponent_target';
  if (command.type === 'resolve_search_choice') return 'resolve_search_choice';
  if (command.type === 'resolve_color_choice') return 'resolve_color_choice';
  if (command.type === 'resolve_fertile_thicket') return 'resolve_fertile_thicket';
  if (command.type === 'resolve_springbloom') return 'resolve_springbloom';
  if (command.type === 'resolve_devour_choice') return 'resolve_devour_choice';
  if (command.type === 'resolve_endure_choice') return 'resolve_endure_choice';
  if (command.type === 'resolve_delirium_target') return 'resolve_delirium_target';
  if (command.type === 'resolve_mentor_target') return 'resolve_mentor_target';
  if (command.type === 'resolve_graveyard_top_choice') return 'resolve_graveyard_top_choice';
  if (command.type === 'resolve_food_choice') return 'resolve_food_choice';
  if (command.type === 'resolve_amass_choice') return 'resolve_amass_choice';
  if (command.type === 'resolve_discover_choice') return 'resolve_discover_choice';
  if (command.type === 'resolve_explore_choice') return 'resolve_explore_choice';
  if (command.type === 'resolve_craft_exile') return 'resolve_craft_exile';
  if (command.type === 'resolve_hand_creature') return 'resolve_hand_creature';
  if (command.type === 'resolve_legend_choice') return 'resolve_legend_choice';
  if (command.type === 'resolve_redirect_choice') return 'resolve_redirect_choice';
  if (command.type === 'resolve_proliferate') return 'resolve_proliferate';
  if (command.type === 'resolve_modal_choice') return 'resolve_modal_choice';
  if (command.type === 'resolve_optional_trigger_choice') return 'resolve_optional_trigger_choice';
  if (command.type === 'resolve_enter_as_copy') return 'resolve_enter_as_copy';
  if (command.type === 'resolve_destroy_equipment_choice') return 'resolve_destroy_equipment_choice';
  if (command.type === 'resolve_discard_choice') return 'resolve_discard_choice';
  // M163/A (uwaga właściciela): decyzje wielowariantowe bez klucza renderują
  // się jako luźne przyciski z identycznymi etykietami (Exploit Butchera).
  if (command.type === 'resolve_exploit_choice') return 'resolve_exploit_choice';
  if (command.type === 'resolve_damage_division') return 'resolve_damage_division';
  if (command.type === 'resolve_epic_choice') return 'resolve_epic_choice';
  if (command.type === 'resolve_optional_draw') return 'resolve_optional_draw';
  if (command.type === 'resolve_hand_top_choice') return 'resolve_hand_top_choice';
  if (command.type === 'resolve_land_type_choice') return 'resolve_land_type_choice';
  if (command.type === 'resolve_library_placement') return 'resolve_library_placement';
  if (command.type === 'resolve_pay_or_sacrifice') return 'resolve_pay_or_sacrifice';
  if (command.type === 'resolve_optional_pay_choice') return 'resolve_optional_pay_choice';
  if (command.type === 'resolve_moonlit_choice') return 'resolve_moonlit_choice';
  if (command.type === 'resolve_damage_target') return 'resolve_damage_target';
  if (command.type === 'resolve_reveal_order') return 'resolve_reveal_order';
  if (command.type === 'resolve_mulligan_choice') return 'resolve_mulligan_choice';
  if (command.type === 'resolve_mulligan_bottom_choice') return 'resolve_mulligan_bottom_choice';
  return null;
}

function choiceRequestType(commands) {
  const first = commands[0];
  if (first.type === 'cast_escape') return 'escape';
  if (first.type === 'cast_flashback') return 'flashback';
  if (first.type === 'resolve_scry') return 'scry';
  if (first.type === 'resolve_surveil') return 'surveil';
  if (first.type === 'resolve_index_choice') return 'index';
  if (first.type === 'resolve_damage_assignment') return 'damage_assignment';
  if (first.type === 'resolve_clash_choice') return 'clash';
  if (first.type === 'resolve_room_target') return 'room-target';
  if (first.type === 'resolve_backup') return 'target';
  if (first.type === 'resolve_sacrifice_choice') return 'sacrifice';
  if (first.type === 'resolve_trigger_target') return 'target';
  if (first.type === 'resolve_opponent_target') return 'target';
  if (first.type === 'resolve_search_choice') return 'target';
  if (first.type === 'resolve_color_choice') return 'command';
  if (first.type === 'resolve_fertile_thicket') return 'target';
  if (first.type === 'resolve_springbloom') return 'target';
  if (first.type === 'resolve_devour_choice') return 'sacrifice';
  if (first.type === 'resolve_endure_choice') return 'command';
  if (first.type === 'resolve_delirium_target') return 'target';
  if (first.type === 'resolve_mentor_target') return 'target';
  if (first.type === 'resolve_graveyard_top_choice') return 'target';
  if (first.type === 'resolve_food_choice') return 'sacrifice';
  if (first.type === 'resolve_amass_choice') return 'target';
  if (first.type === 'resolve_discover_choice') return 'command';
  if (first.type === 'resolve_explore_choice') return 'command';
  if (first.type === 'resolve_craft_exile') return 'command';
  if (first.type === 'resolve_hand_creature') return 'target';
  if (first.type === 'resolve_legend_choice') return 'target';
  if (first.type === 'resolve_redirect_choice') return 'target';
  if (first.type === 'resolve_proliferate') return 'target';
  if (first.type === 'resolve_modal_choice') return 'command';
  if (first.type === 'resolve_optional_trigger_choice') return 'command';
  if (first.type === 'resolve_enter_as_copy') return 'target';
  if (first.type === 'resolve_destroy_equipment_choice') return 'command';
  if (first.type === 'resolve_discard_choice') return 'target';
  if (first.type === 'resolve_hand_top_choice') return 'target';
  if (first.type === 'resolve_land_type_choice') return 'command';
  if (first.type === 'resolve_library_placement') return 'command';
  if (first.type === 'resolve_pay_or_sacrifice') return 'command';
  if (first.type === 'resolve_optional_pay_choice') return 'command';
  if (first.type === 'resolve_moonlit_choice') return 'command';
  if (first.type === 'resolve_damage_target') return 'target';
  if (first.type === 'resolve_reveal_order') return 'command';
  if (first.type === 'resolve_mulligan_choice') return 'command';
  if (first.type === 'resolve_mulligan_bottom_choice') return 'command';
  if (first.xValue != null) return 'value';
  if (first.phyrexianPayWithLife != null) return 'phyrexian';
  if (first.targets?.length) return 'target';
  return 'command';
}

/**
 * M66 (B): walka bez kombinacji — WSZYSTKIE warianty declare_attackers /
 * declare_blockers zwijamy do JEDNEGO wpisu-wizarda (przełączniki przy
 * stworach), a resolve_damage_assignment do wizarda rozdzielania obrażeń.
 * Używane przez panel akcji i menu kontekstowe.
 */
export function groupCombatDecisions(commands, view) {
  const out = [];
  const attackers = [];
  const blockers = [];
  const stamp = `${view.turn.number}-${view.turn.step}`;
  for (const command of commands) {
    if (command.type === 'declare_attackers') { attackers.push(command); continue; }
    if (command.type === 'declare_blockers') { blockers.push(command); continue; }
    if (command.type === 'resolve_damage_assignment') {
      const request = choiceRequest({
        id: `choice-${stamp}-damage`,
        type: 'damage_assignment',
        options: [command],
      });
      out.push({ request, first: command });
      continue;
    }
    out.push({ command });
  }
  if (attackers.length > 0) {
    const request = choiceRequest({ id: `choice-${stamp}-attackers`, type: 'declare_attackers', options: attackers });
    out.unshift({ request, first: attackers[0] });
  }
  if (blockers.length > 0) {
    const request = choiceRequest({ id: `choice-${stamp}-blockers`, type: 'declare_blockers', options: blockers });
    out.push({ request, first: blockers[0] });
  }
  return out;
}

/**
 * M131 — czy komenda jest jawną REZYGNACJĄ z decyzji („fail to find",
 * „nie poświęcaj", „pomiń")? Rozpoznajemy po kształcie komendy, nie po
 * nazwie karty ani typie decyzji (ADR 0002) — każda decyzja opcjonalna
 * niesie swój wariant „nic nie rób" w jednym z tych pól.
 */
function isDeclineOption(command) {
  if (!command) return false;
  if (command.found === null) return true;      // szukanie w bibliotece
  if (command.skip === true) return true;       // Springbloom i pokrewne
  return false;
}

function buildChoiceRequestEntries(commands, view) {
  const entries = [];
  const groups = new Map();
  let groupIndex = 0;
  // M66 (B): walka najpierw przez grupujące wizardy — koniec list kombinacji.
  for (const entry of groupCombatDecisions(commands, view)) {
    if (entry.request) { entries.push(entry); continue; }
    const command = entry.command;
    // Index (APC): engine oferuje JEDNĄ komendę resolve_index_choice z
    // oryginalną kolejnością (nie enumeruje 5! permutacji) — bezpośrednie
    // zagranie byłoby no-opem. Pakujemy ją w request, żeby klik otwierał
    // wizard przestawiania kart (M65; patrz lookWizardKindOf 'index').
    if (command.type === 'resolve_index_choice') {
      const request = choiceRequest({
        id: `choice-${view.turn.number}-${view.turn.step}-index`,
        type: 'index',
        options: [command],
      });
      entries.push({ request, first: command });
      continue;
    }
    const key = choiceRequestGroupKey(command);
    if (!key) {
      entries.push({ command });
      continue;
    }
    let group = groups.get(key);
    if (!group) {
      group = { key, commands: [], index: groupIndex++ };
      groups.set(key, group);
      entries.push({ group });
    }
    group.commands.push(command);
  }
  return entries.map((entry) => {
    // Wpisy-wizardy (walka M66, Index M65) mają request — przepuścić wprost.
    if (entry.request) return entry;
    if (!entry.group || entry.group.commands.length < 2) {
      return { command: entry.group?.commands[0] ?? entry.command };
    }
    // =====================================================================
    // M131 — zgłoszenie A właściciela (2026-08-17):
    //   „Gloomfang Mauler — zdolność swampcycling działa tylko na Swamp,
    //    więc jaki sens ma modal wyboru celu tej zdolności?"
    //
    // Racja: po dedup egzemplarzy z M122 typecycling zostawia w modalu
    // DOKŁADNIE jedną realną opcję (jedno bagno — wszystkie kopie są
    // nierozróżnialne, biblioteka to strefa ukryta) plus „nie znajduj
    // karty". Modal pyta wtedy „czy chcesz to, o co właśnie poprosiłeś?",
    // a gracz zapłacił już koszt aktywacji, żeby o to poprosić.
    //
    // Reguła jest GENERYCZNA (ADR 0002 — po kształcie decyzji, nie po
    // nazwie karty): jeśli po odjęciu opcji-rezygnacji zostaje dokładnie
    // JEDEN wariant, decyzja nie niesie wyboru i idzie do panelu jako
    // zwykła akcja. Etykieta `commandLabel` mówi wprost, co się stanie
    // („Szukanie: Swamp"), a rezygnacja pozostaje dostępna osobnym
    // przyciskiem — nie odbieramy legalnego ruchu (CR 701.19b: „fail to
    // find" wolno wybrać zawsze).
    //
    // Świadome ograniczenie zakresu: dotyczy wyłącznie decyzji, które MAJĄ
    // jawną opcję rezygnacji (`found === null`). Wybór bez rezygnacji
    // z jednym wariantem to zupełnie inny przypadek (przymusowa decyzja),
    // a jego jedyna opcja i tak trafia wyżej gałęzią `< 2`.
    // =====================================================================
    const declineIndex = entry.group.commands.findIndex(isDeclineOption);
    if (declineIndex !== -1 && entry.group.commands.length === 2) {
      const real = entry.group.commands[declineIndex === 0 ? 1 : 0];
      return { command: real, alsoOffer: entry.group.commands[declineIndex] };
    }
    const first = entry.group.commands[0];
    // M172/E: multi-target z podziałem obrażeń (Inferno Titan) — zamiast
    // enumeracji kombinacji celów jeden wizard kwot (jak przydział po walce).
    const divisionWizard = first.type === 'resolve_trigger_target'
      && view?.pendingTriggerTarget?.divisionTotal > 0;
    const request = choiceRequest({
      id: `choice-${view.turn.number}-${view.turn.step}-${entry.group.index}-${entry.group.key}`,
      type: divisionWizard ? 'damage_division' : choiceRequestType(entry.group.commands),
      options: entry.group.commands,
    });
    return { request, first };
  });
}

/**
 * Klucz „wymienności" komendy: dwie komendy z tym samym kluczem prowadzą do
 * IDENTYCZNEGO skutku w grze, więc pokazywanie obu to szum.
 *
 * M102/U4 (zgłoszenie właściciela 2026-08-16): cztery Foresty w ręce dawały
 * cztery identyczne przyciski „Zagraj ląd: Forest". Świadomie wąski zakres —
 * scalamy tylko `play_land` (zagranie landa nie ma żadnego parametru poza
 * samą kartą, więc egzemplarze są w pełni wymienne). Rzuty czarów zostawiamy
 * osobno: dwie kopie tej samej karty mogą różnić się kosztem alternatywnym,
 * celami czy stanem (np. jedna z licznikami), a to realne decyzje.
 *
 * @returns {string|null} klucz scalania albo null (nie scalamy)
 */
function interchangeableKey(command, view) {
  if (command.type !== 'play_land') return null;
  const object = view.zones?.hand?.find((o) => o.id === command.objectId);
  // Bez znanej karty (FoW / brak obiektu) nie ryzykujemy scalania.
  if (!object?.cardId) return null;
  return `play_land:${object.cardId}`;
}

/**
 * Lista wpisów panelu „Twoje działania" — wynik `buildChoiceRequestEntries`
 * ze scalonymi duplikatami w pełni wymiennych komend.
 *
 * Scalanie jest WYŁĄCZNIE prezentacją: wpis niesie pierwszą realną komendę
 * (`entry.command`), więc klik wykonuje normalny kontrakt silnika.
 *
 * @returns {Array<{command?: object, request?: object, first?: object, label?: string}>}
 */
/**
 * M167/E2 (uwaga właściciela): wypełnia wiersz logu tekstem, owijając NAZWY
 * KART w klikalne <span class="log-card" data-card-id="…"> (pełnoekranowa
 * ilustracja przez delegację w main.js). Dane logu pozostają czystym
 * tekstem (przebieg tur dla AI bez znaczników); longest-name-first chroni
 * przed dopasowaniem podnazw.
 */
export function appendLogLineWithCardLinks(line, text, cardIdByName) {
  if (!cardIdByName || typeof text !== 'string' || !text) {
    line.textContent = text;
    return line;
  }
  const names = [...cardIdByName.keys()].filter((n) => text.includes(n))
    .sort((a, b) => b.length - a.length);
  let rest = text;
  let guard = 0;
  while (rest.length > 0 && guard < 200) {
    guard += 1;
    let bestAt = -1;
    let bestName = null;
    for (const name of names) {
      const at = rest.indexOf(name);
      if (at >= 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; bestName = name; }
    }
    if (bestName == null) {
      line.appendChild(document.createTextNode(rest));
      break;
    }
    if (bestAt > 0) line.appendChild(document.createTextNode(rest.slice(0, bestAt)));
    const cardSpan = document.createElement('span');
    cardSpan.className = 'log-card';
    cardSpan.textContent = bestName;
    cardSpan.dataset.cardId = cardIdByName.get(bestName);
    line.appendChild(cardSpan);
    rest = rest.slice(bestAt + bestName.length);
  }
  return line;
}

export function buildActionEntries(commands, session, view) {
  const entries = buildChoiceRequestEntries(commands, view);
  const byKey = new Map();
  const out = [];
  for (const entry of entries) {
    // M131: decyzja z jednym realnym wariantem rozpada się na DWA przyciski
    // panelu (wykonaj / zrezygnuj) zamiast otwierać modal bez wyboru.
    if (entry.alsoOffer) {
      out.push({ command: entry.command });
      out.push({ command: entry.alsoOffer });
      continue;
    }
    const key = entry.command ? interchangeableKey(entry.command, view) : null;
    if (!key) { out.push(entry); continue; }
    const existing = byKey.get(key);
    if (existing) { existing.count += 1; continue; }
    const merged = { command: entry.command, count: 1 };
    byKey.set(key, merged);
    out.push(merged);
  }
  return out.map((entry) => {
    if (!entry.count) return entry;
    const label = commandLabel(entry.command, session, view);
    // Licznik tylko dla FAKTYCZNYCH duplikatów — pojedyncza karta zostaje
    // bez „(1 z 1)", żeby nie zaśmiecać typowego panelu.
    return entry.count > 1
      ? { command: entry.command, label: `${label} (1 z ${entry.count})`, count: entry.count }
      : { command: entry.command, label };
  });
}

/** Polskie nazwy keywordów do pola reguł. */
// M138/Z10: etykiety zdolności AKTYWOWANYCH, których treścią jest sam keyword
// (`effect: []` — mechanikę realizuje silnik). Osobna mapa od KEYWORD_LABELS,
// bo tam „regenerate” byłoby przymiotnikiem stwora, a tu jest czynnością:
// gracz czyta „{1}{B}{G}: Regeneruj tego stwora”, nie „{1}{B}{G}: Regeneracja”.
const ABILITY_KEYWORD_LABELS = Object.freeze({
  regenerate: 'Regeneruj tego stwora (następne zniszczenie zostaje odwrócone)',
});

const KEYWORD_LABELS = Object.freeze({
  intimidate: 'zastraszenie (blok: artefakty/wspólny kolor)',
  flying: 'Latanie', vigilance: 'Czujność', transform: 'Transform', reach: 'Zasięg',
  haste: 'Pośpiech', menace: 'Postrach', lifelink: 'Dotykanie życia', deathtouch: 'Dotykanie śmierci',
  trample: 'Zadeptywanie', first_strike: 'Pierwsze uderzenie', hexproof: 'Hexproof (niecelowalność)',
  daybound: 'Daybound', nightbound: 'Nightbound', persist: 'Persist', infect: 'Infect',
  // Diament (2026-08-11): brakujące polskie etykiety keywordów — surowe
  // snake_case w linii keywordów (double_strike, level_up, persist itd.).
  defender: 'Obrońca', double_strike: 'Podwójne uderzenie', indestructible: 'Niezniszczalny',
  exalted: 'Egzaltacja', flash: 'Flash (błysk)', infect: 'Infect', level_up: 'Level up',
  persist: 'Persist', morph: 'Morph', changeling: 'Changeling',
  // M127 (uwaga A właściciela): `megamorph` brakowało w mapie, więc etykieta
  // akcji „Obróć twarzą do góry" pokazywała surowy slug małą literą — dokładnie
  // ten sam wyciek co L29 (`MAPA[key] ?? key` jest cichą dziurą, nie fallbackiem).
  megamorph: 'Megamorph',
  // Batch 36 (Molten Nursery): Devoid — karta bezbarwna (CR 702.110? 702.131).
  devoid: 'Devoid (bezbarwna)',
});

// A (2026-08-11): czytelne nazwy liczników pokazywanych na kartach na stole.
// M164: cyfry rzymskie rozdziałów Sagi — wspólny słownik dla rulesText
// (M159/Z4) i badge'u etapu na nakładce kafla (pytanie właściciela 2026-08-20).
const SAGA_ROMAN = ['I', 'II', 'III', 'IV', 'V'];

const COUNTER_LABELS = Object.freeze({
  '+1/+1': '+1/+1', '-1/-1': '-1/-1', oil: 'oil', charge: 'charge', lore: 'lore',
  // Diament cz.2: znaczniki-liczniki zdolności po polsku (było surowe
  // „deathtouch"/„lifelink"/„flying" na kaflach).
  flying: 'Latanie', deathtouch: 'Dotykanie śmierci', lifelink: 'Dotykanie życia', finality: 'Finality',
  // M126/#5 (Żywy Tester): na kaflach świeciło surowe „stun×2" (37 wystąpień
  // w audytowanych partiach) — licznik ogłuszenia z Lodestone Needle. Audyt
  // wszystkich liczników w bazie wykazał też brakujący `level` (Kabira
  // Vindicator). Strażnik w testach pilnuje kompletności tej mapy.
  stun: 'ogłuszenie', level: 'poziom',
});

/** Opis dynamicznej wartości amount (string zamiast liczby). */
const DYNAMIC_AMOUNT_LABELS = Object.freeze({
  artifacts_you_control: 'za każdy twój artefakt',
  cards_named_in_graveyard: 'za każdą kartę o tej nazwie w grobie',
  lands_with_subtype_you_control: 'za każdy land tego podtypu',
  attacking_creatures_count: 'za każdego atakującego stwora',
  mana_from_treasure_spent: 'za wydaną manę ze Skarbów',
  commander_casts: 'za rzuty commandera',
  source_power: 'moc źródła',
});
/** Rzeczownikowa fraza dla dynamicznej liczby obrażeń („tyle obrażeń, ile ..."). */
const DYNAMIC_AMOUNT_NOUNS = Object.freeze({
  artifacts_you_control: 'artefaktów kontrolujesz',
});

/** Czytelna wartość P/T tokena, także dynamiczna (greatest_power_you_control). */
function dynamicPt(v) {
  if (typeof v === 'number') return String(v);
  if (v === 'greatest_power_you_control') return 'X (największa twoja moc)';
  return v ?? '?';
}

function dynamicAmount(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return DYNAMIC_AMOUNT_LABELS[val] ?? val;
  return val ?? '?';
}

/** Znak liczby do opisu pumpów: „+2/+0", „-2/+0". */
function signed(n) { return (Number(n) >= 0 ? '+' : '') + n; }

/** Odmiana polska rzeczownika wg liczby: (1 → one, 2-4 → few, 5+ → many). */
function polishPluralCount(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Diament (2026-08-11): opis dynamicznej wartości P/T (np. „source_power"). */
const DYNAMIC_PT_LABELS = Object.freeze({
  source_power: 'moc źródła',
  oil_counters: 'liczniki oil',
  greatest_mana_among_other_artifacts: 'mana value innych artefaktów',
  card_types_in_all_graveyards: 'liczba typów kart w grobach',
  card_types_in_all_graveyards_plus_1: 'liczba typów kart w grobach +1',
});
function ptAmount(n) {
  if (typeof n === 'number') return signed(n);
  return DYNAMIC_PT_LABELS[n] ?? n;
}

/** Diament cz.2: para P/T — jeśli power i toughness równe (np. oba
 *  source_power u Jyoti), pokaż raz, nie „moc źródła/moc źródła". */
/** Diament cz.2: para P/T — jeśli power i toughness równe i oba są
 *  dynamicznymi etykietami (np. source_power u Jyoti), pokaż raz,
 *  nie „moc źródła/moc źródła\". Dla liczb zawsze pokazuj obie. */
function ptPair(power, toughness) {
  const p = ptAmount(power ?? 0);
  const t = ptAmount(toughness ?? 0);
  if (p === t && typeof power === 'string' && typeof toughness === 'string') return p;
  return `${p}/${t}`;
}

/** Diament (2026-08-11): odmiana „obrażenie/obrażenia/obrażeń" wg liczby. */
function damageCount(n) {
  if (typeof n !== 'number') return `${n ?? 'X'} obrażeń`;
  return `${n} ${polishPluralCount(n, 'obrażenie', 'obrażenia', 'obrażeń')}`;
}

/** Diament (2026-08-11): odmiana „życie/życia" wg liczby (1 → życie). */
function lifeCount(n) {
  return `${n} ${n === 1 ? 'życie' : 'życia'}`;
}

/** Czytelny opis pojedynczego efektu (fallback dla nieznanych typów — polska nazwa). */
function describeEffect(e) {
  // M73d (A): puste efekty (effect: {} w cyclyng/static/level-up) to nie
  // „efekt (undefined)" — pomijamy (audyt żywym testerem).
  if (!e || typeof e.type !== 'string' || e.type === '') return '';
  const generic = {
    pump: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} do końca tury${e.upgradeIfCreatures ? ` (${signed(e.upgradeIfCreatures.power ?? 0)}/${signed(e.upgradeIfCreatures.toughness ?? 0)} przy ${e.upgradeIfCreatures.min}+ stworach)` : ''}`,
    exile_if_dies_this_turn: () => 'jeśli miałby umrzeć w tej turze, wygnaj go zamiast tego',
    create_token: () => {
      const count = Number.isFinite(e.amount) && e.amount > 1 ? `×${e.amount} ` : '';
      const dynamicNote = typeof e.amount === 'string' ? ` (${dynamicAmount(e.amount)})` : '';
      return `stwórz ${count}token ${e.name ?? ''}${dynamicNote}`;
    },
    damage: () => {
      const amt = e.amount;
      if (typeof amt === 'number') return damageCount(amt);
      if (amt === 'X') return 'X obrażeń';
      const noun = DYNAMIC_AMOUNT_NOUNS[amt];
      return noun ? `zada tyle obrażeń, ile ${noun}` : `${dynamicAmount(amt)} obrażeń`;
    },
    gain_life: () => `zyskaj ${lifeCount(e.amount)}`,
    gain_life_target: () => `cel zyskuje ${lifeCount(e.amount)}`,
    remove_counter: () => `usuń licznik ${e.counter}`,
    add_counter: () => `połóż licznik ${e.counter}`,
    exile_permanent: () => 'wygnij artefakt/enchantment',
    tap_permanent: () => 'tap',
    lock_untap: () => 'blokada odkręcania (póki źródło zatapnięte)',
    dont_untap_next_untap_step: () => 'nie odkręca się w następnym untap step',
    surveil: () => `surveil ${e.amount ?? 1}`,
    clash: () => 'clash',
    take_initiative: () => 'obejmij inicjatywę',
    pay_x_cast_from_graveyard: () => 'możesz zapłacić {X} i rzucić instant/sorcery o MV X z dowolnego grobu za darmo (potem wygnanie)',
    draw_cards: () => `dobierz ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')}`,
    lose_life: () => `utrata ${e.amount ?? 1} życia`,
    pay_mana: () => `zapłać ${e.amount} many`,
    pay_life: () => `zapłać ${e.amount} życia`,
    return_permanent_from_graveyard: () => `wróć nonland permanent z grobu${e.finalityCounter ? ' z finality' : ''}`,
    transform: () => 'transform (obróć kartę)',
    scry: () => `scry ${e.amount ?? 1}`,
    search_library_two_cards_hand_and_grave: () => 'przeszukaj bibliotekę: jedna karta do ręki, druga do grobu, potem tasowanie',
    owner_library_top_or_bottom: () => 'właściciel celu kładzie go na wierzch albo spód swojej biblioteki (jego wybór)',
    detain: () => 'detain — do twojej następnej tury cel nie atakuje, nie blokuje i nie aktywuje zdolności',
    sacrifice_permanent: () => 'poświęć ten permanent',
    grant_keywords_until_end_of_turn: () => `zdobądź ${(e.keywords ?? []).map((k) => KEYWORD_LABELS[k] ?? k).join(', ')} do końca tury`,
    // M73c: pełna mapa pozostałych typów — koniec „efekt." i surowych slugów.
    add_mana: () => 'dodaj manę',
    add_flying_counter_to_face_down_you_control: () => 'połóż licznik flying na zakrytych stworach',
    amass: () => 'amass (stwórz/rozrośnij Armię)',
    animate_linked: () => 'animuj do końca tury',
    animate_permanent_until_end_of_turn: () => 'stanie się stworem do końca tury',
    // M101/B7 (CR 702.171): bez tego wpisu etykieta pokazywała surowy slug
    // „efekt (set_saddled)" — dokładnie jak w zgłoszeniu B.
    set_saddled: () => 'zostanie osiodłany do końca tury',
    become_basic_land_type: () => 'stań się podstawowym lądem',
    bounce_permanent: () => 'wróć na rękę właściciela',
    bounce_to_library_top: () => 'włóż na wierzch biblioteki właściciela',
    buff_creatures_you_control: () => `${ptPair(e.power ?? 0, e.toughness ?? 0)} dla twoich stworów do końca tury`,
    buff_creature_until_end_of_turn: () => `${ptPair(e.power ?? 0, e.toughness ?? 0)} do końca tury`,
    buff_land_creatures: () => `${ptPair(e.power ?? 0, e.toughness ?? 0)} dla land creatures do końca tury`,
    buff_opponents_creatures: () => `${ptPair(e.power ?? 0, e.toughness ?? 0)} dla stworów przeciwnika do końca tury`,
    cant_be_blocked: () => 'nie może być blokowany',
    cant_be_regenerated_this_turn: () => 'nie może być regenerowany',
    cant_block: () => 'nie może blokować',
    cloak: () => 'cloak (wierzch biblioteki twarzą w dół jako 2/2)',
    control_to_owners_all_creatures: () => 'kontrola stworów wraca do właścicieli',
    counter_spell: () => 'skontruj czar',
    fireball_resolve: () => 'X obrażeń podzielone po równo między cele',
    craft_transform: () => 'craft — transform',
    damage_defending_player: () => `${damageCount(dynamicAmount(e.amount))} obrońcy`,
    damage: () => {
      const amt = e.amount;
      if (typeof amt === 'number') return damageCount(amt);
      if (amt === 'X') return 'X obrażeń';
      const noun = DYNAMIC_AMOUNT_NOUNS[amt];
      return noun ? `zada tyle obrażeń, ile ${noun}` : `${dynamicAmount(amt)} obrażeń`;
    },
    damage_each_opponent: () => e.amountFrom === 'manaSpent'
      ? `obrażenia każdemu przeciwnikowi (wydana mana)` : `${damageCount(e.amount)} każdemu przeciwnikowi`,
    damage_enchanted_permanent_controller: () => `${damageCount(e.amount)} kontrolerowi zaczarowanego`,
    damage_enchanted_player: () => `${damageCount(e.amount)} zaczarowanemu graczowi`,
    damage_to_controller: () => `${damageCount(e.amount)} kontrolerowi`,
    destroy_if_least_power: () => 'zniszcz, jeśli cel ma najmniejszą moc na polu bitwy (lub remisuje)',
    destroy_permanent: () => 'zniszcz cel',
    destroy_artifact_gain_life_mana_value: () => 'zniszcz artefakt; zyskujesz życie równe jego kosztowi many',
    set_base_pt_until_end_of_turn: () => `bazowe P/T ${e.power}/${e.toughness} do końca tury`,
    mill_from_bottom: () => `mieli ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')} od spodu biblioteki`,
    grant_abilities: () => 'nadaj zdolność do końca tury',
    discard_cards: () => `odrzuć ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')}`,
    discard_each_opponent: () => 'każdy przeciwnik odrzuca kartę',
    discover: () => 'discover (odsłoń i rzuć za darmo)',
    draw_cards_both_players: () => `oboje dobierają ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')}`,
    draw_then_discard: () => 'dobierz, potem odrzuć',
    exalted_pump: () => `${signed(e.power ?? 1)}/${signed(e.toughness ?? 1)} do końca tury (egzaltacja)`,
    exile_all: () => 'wygnij wszystkie (filtr)',
    exile_opponent_creature: () => 'wygnij stwora przeciwnika',
    exile_own_land: () => 'wygnij własny ląd',
    exile_target_creature: () => 'wygnij stwora',
    exile_nonland_permanent_linked: () => 'wygnij nie-lądowy permanent do odejścia',
    exile_return_transformed: () => 'wygnij, potem wróć przekształcone',
    explore: () => 'explore',
    investigate: () => 'investigate (stwórz token Clue)',
    create_copy_token: () => 'stwórz token-kopię artefaktu (haste, exile na koniec tury)',
    gain_control_until_end_of_turn: () => 'przejmij kontrolę do końca tury, odkręć i haste',
    destroy_equipment_attached: () => 'zniszcz cały wyposażony Equipment',
    prevent_combat_damage_except_enchanted: () => 'prewencja obrażeń bojowych (poza zaczarowanymi i enchantment-creatures)',
    return_source_from_graveyard_to_hand: () => 'wróć z grobu na rękę',
    copy_creature: () => 'stań się kopią celu',
    job_select: () => 'job select (stwórz 1/1 Hero i przypnij)',
    living_weapon: () => 'living weapon (stwórz 0/0 Germ i przypnij)',
    attach_self_to_target: () => 'przypnij ten sprzęt do wybranego stwora',
    regenerate: () => 'tarcza regeneracji (przetrwa zniszczenie do końca tury)',
    each_player_loses_life_fraction: () => 'każdy gracz traci część życia (zaokrąglone w górę)',
    // M166/B (Batch 40, Feed the Infection — Corrupted).
    opponents_lose_life_if_poison: () => 'każdy przeciwnik z licznikami poison traci życie',
    // M166/D (Inferno Titan).
    damage_divided: () => 'obrażenia dzielone między cele',
    becomes_subtype_until_end_of_turn: () => 'zmiana podtypu i utrata keyworda do końca tury',
    apply_to_each_target: () => 'ten sam efekt na każdym z celów',
    reveal_subtype_deal_damage: () => 'możesz ujawnić kartę z ręki — obrażenia przeciwnika',
    next_spell_discount: () => 'następny czar podtypu tańszy w tej turze',
    return_card_from_graveyard_to_hand: () => 'zwrot karty z grobu do ręki',
    ferocious_draw_discard: () => 'ferocious: dobierz, potem odrzuć',
    fertile_thicket_reveal: () => 'odsłoń wierzch biblioteki',
    goad: () => 'goad (musi atakować)',
    grant_abilities: () => 'nadaj zdolności do końca tury',
    graveyard_creatures_to_library_top_choice: () => 'karty z grobu na wierzch biblioteki',
    index_look: () => 'zobacz wierzch biblioteki (Index)',
    look_top_put_one_hand_rest_grave: () => 'zobacz wierzch biblioteki, jedną do ręki, resztę do grobu',
    look_top_put_one_hand_rest_bottom: () => 'zobacz X kart z wierzchu — jedna do ręki, reszta na spód biblioteki',
    reveal_top_pick_land_rest_grave: () => 'odsłoń wierzch, możesz wziąć ląd do ręki, resztę do grobu',
    epic_experiment: () => 'wygnaj wierzch biblioteki i rzuć czary bez kosztu',
    mill_both_players: () => `mieli po ${e.amount ?? 1} karcie z biblioteki każdy gracz`,
    mill_cards: () => `mieli ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')} (do grobu)`,
    mill_from_bottom: () => `mieli ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')} od spodu biblioteki`,
    opponent_hand_card_to_top: () => 'karta z ręki przeciwnika na wierzch biblioteki',
    player_sacrifices_creature: () => 'cel poświęca stwora',
    prevent_damage_this_turn: () => 'prewencja obrażeń do końca tury',
    prevent_next_damage: () => `prewencja kolejnych ${e.amount ?? 1} obrażeń`,
    proliferate: () => 'proliferate',
    pump_by_creature_count: () => `${signed(e.power ?? 1)}/${signed(e.toughness ?? 1)} za każdego stwora`,
    pump_by_gates: () => '+X/+X, X = liczba kontrolowanych bram (Gate)',
    // Generyczny if/then/else (Trade Route Envoy): opis obu gałęzi.
    // M146 (audyt żywym testerem): surowy identyfikator zamiast polskiego opisu
    // (landEnteredThisTurn na kaflu Mysteries of the Deep).
    conditional: () => {
      const thenDesc = e.then ? describeEffect(e.then) : '';
      const elseDesc = e.else ? describeEffect(e.else) : '';
      const CONDITIONS = {
        controlsCreatureWithCounter: 'kontrolujesz stwora z licznikiem',
        landEnteredThisTurn: 'land wchodził pod twoją kontrolą w tej turze (Landfall)',
      };
      return `jeśli ${CONDITIONS[e.condition] ?? e.condition}: ${thenDesc}; w przeciwnym razie: ${elseDesc}`;
    },
    pump_enchanted_creature: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} do końca tury`,
    pump_food_result: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} do końca tury`,
    put_graveyard_card_on_bottom: () => 'karta z grobu na spód biblioteki',
    put_graveyard_card_on_top: () => 'karta z grobu na wierzch biblioteki',
    put_graveyard_card_onto_battlefield: () => 'karta z grobu na pole bitwy',
    put_multicolored_creature_from_hand: () => 'wielokolorowy stwór z ręki na pole bitwy',
    reanimate_under_your_control: () => 'reanimacja pod twoją kontrolą',
    redirect_spell_target: () => 'przekieruj cel czaru',
    return_banished_to_hand: () => 'zwróć wygnane na rękę',
    return_creature_card_to_hand: () => 'stwór z grobu na rękę',
    return_exiled_to_battlefield: () => 'wygnane wraca na pole bitwy',
    return_to_battlefield_tapped: () => 'wróć na pole bitwy zatapnięte',
    return_to_battlefield_under_control_at_upkeep: () => 'wróć na pole bitwy na początku upkeep',
    return_with_counter: () => 'wróć na pole bitwy z licznikiem',
    reveal_hand_choose_exile: () => 'odsłoń rękę, wybierz do wygnania',
    reveal_top_put_creature: () => 'odsłoń wierzch, stwór na pole bitwy',
    reveal_top_to_bottom_order: () => 'odsłoń wierzch, ułóż w kolejności',
    sacrifice_each_other_creature: () => 'poświęć każde inne stworzenie',
    sacrifice_food_choice: () => 'poświęć Food (+5/+5) albo +3/+3 do końca tury',
    search_basic_land_morbid: () => 'szukaj basic landa (morbid)',
    search_library_to_battlefield: () => 'szukaj w bibliotece na pole bitwy',
    search_library_to_hand: () => 'szukaj w bibliotece do ręki',
    springbloom_sacrifice_search: () => 'poświęć ląd, szukaj 2 basic landów',
    start_engines: () => 'start your engines!',
    station_counters: () => `połóż liczniki charge (station)`,
    tap_all_lands_opponents_control: () => 'tap wszystkie lądy przeciwnika',
    tap_permanents: () => 'tap permanenty',
    transfer_counters_on_dies: () => 'przenieś liczniki',
    turn_face_up: () => 'obróć twarzą do góry',
    unearth_return: () => 'unearth (z grobu z haste, exile na końcu tury)',
    untap_permanent: () => 'odkręć',
    untap_enchanted_permanent: () => 'odkręć zaczarowany permanent',
    untap_all_creatures_you_control: () => 'odkręć wszystkie twoje stwory',
    venture_into_undercity: () => 'venture do lochu',
    // M122/#5 (Żywy Tester, ostrza vs wiedzmin seed 3005): panel akcji
    // świecił surowym slugiem „efekt (attach_equipment_to_source)".
    // Audyt WSZYSTKICH 121 typów efektów w bazie wykazał 9 braków — tester
    // trafił tylko pierwszy z nich; strażnik w testach pilnuje reszty.
    attach_equipment_to_source: () => 'przyczep ekwipunek do tego stwora',
    damage_creatures_with_keyword: () => `${damageCount(e.amount ?? 1)} stworom z „${e.keyword ?? '?'}”`,
    damage_from_target_power: () => 'obrażenia równe mocy stwora',
    endure_x: () => 'endure X (liczniki +1/+1 albo token Spirit)',
    grant_protection_until_end_of_turn: () => 'ochrona do końca tury',
    incubate: () => `inkubuj ${e.amount ?? 1}`,
    return_card_from_graveyard_to_hand: () => 'wróć kartę z grobu na rękę',
    reveal_hand_choose_discard: () => 'odsłoń rękę i odrzuć wybraną kartę',
    search_library_to_battlefield_tapped: () => 'szukaj w bibliotece landa na pole bitwy (zatapniętego)',
  };
  const fn = generic[e.type];
  if (fn) return fn();
  return `efekt (${e.type})`;
}

/** Czytelny opis zdolności aktywowanej (koszt + cele + efekty). */
/** Tekst kosztu zdolności: „{2}, {T}" (do opisów Cycling/Channel). */
/**
 * M138/Z2 (audyt Żywym Testerem): JEDNA lista kosztów pozamanowych dla obu
 * miejsc, które opisują koszt zdolności — kafla karty (`costTextOf`) i etykiety
 * przycisku (`abilityCostHtml`). Dotąd każde liczyło własną listę i rozjechały
 * się: kafel Goblin Pickera obiecywał „{1}, {T}: dobierz kartę”, a aktywacja
 * odrzucała kartę z ręki. Audyt 304 kart rejestru wykazał osiem takich pól;
 * strażnik w `test/m138-*.test.js` pilnuje, żeby każde pole kosztu obecne
 * w danych miało tu wpis (L31: mapa ≠ jej użycie).
 */
const NON_MANA_COST_LABELS = Object.freeze([
  ['discardCard', 'odrzuć kartę'],
  ['discardCards', (n) => `odrzuć ${n} ${polishPluralCount(n, 'kartę', 'karty', 'kart')}`],
  ['sacrificeSelf', 'poświęć'],
  ['sacrificeLand', 'poświęć ląd'],
  ['tapCreature', 'tapnij swojego stwora'],
  ['tapOtherCreature', 'tapnij innego swojego stwora'],
  ['exileFromGraveyard', 'wygnaj tę kartę z grobu'],
  ['payLifeX', 'zapłać X życia'],
  // M177/E (Merchant's Dockhand): koszt „Tap X untapped artifacts you control”.
  ['tapXArtifacts', 'tapnij X swoich nietapniętych artefaktów'],
  ['crewPower', (n) => `załoga ${n}`],
  ['saddlePower', (n) => `saddle ${n}`],
  ['removeCounter', (c) => {
    const amount = c.amount ?? 1;
    const counter = c.name ?? 'charge';
    return `zdejmij ${amount} ${polishPluralCount(amount, 'licznik', 'liczniki', 'liczników')} ${COUNTER_LABELS[counter] ?? counter}`;
  }],
]);

function costTextOf(ability) {
  const cost = ability?.cost ?? {};
  const parts = [];
  // M138/Z10: koszt kolorowy pokazywany jako sama liczba kłamał — Trestle Troll
  // ({1}{B}{G}) wyglądał na „{3}”, czyli opłacalny dowolną maną. Pipy kolorów
  // są częścią kosztu (CR 202.1), więc rozbijamy generic + kolory tak samo jak
  // `abilityCostHtml` (wcześniej dwa miejsca liczyły to samo inaczej).
  const colors = cost.colors ?? [];
  if (cost.manaX) parts.push('{X}');
  const generic = Math.max(0, (cost.mana ?? 0) - colors.length);
  if (generic > 0 || (!cost.manaX && colors.length === 0 && cost.mana != null)) parts.push(`{${generic}}`);
  for (const color of colors) parts.push(`{${color}}`);
  if (cost.tap) parts.push('{T}');
  // M138/Z2: koszty POZAMANOWE na kaflu karty. To ta sama lista co
  // w `abilityCostHtml` (etykieta przycisku akcji) — kafel liczył koszt
  // osobno i pokazywał „{1}, {T}: dobierz 1 kartę”, przemilczając „odrzuć
  // kartę” z Goblin Pickera. Gracz płacił koszt, o którym nie wiedział.
  for (const [field, label] of NON_MANA_COST_LABELS) {
    if (cost[field]) parts.push(typeof label === 'function' ? label(cost[field]) : label);
  }
  return parts.join(', ');
}

/** Diament (2026-08-11): opis zdolności STATYCZNEJ (pump/condition/scope/
 * keywords/mustAttack/cantAttackAlone/costModifier/...). Wcześniej pusty —
 * kafle pokazywały „· ·"/„· · · ·" (Veiled, Kabira, inne). */
function describeStatic(ability) {
  const parts = [];
  const cond = ability?.condition ?? {};
  const scope = ability?.scope?.affects;
  const pump = ability?.pump;
  if (pump && (pump.power != null || pump.toughness != null)) {
    const pt = ptAmount(pump.power ?? 0) === ptAmount(pump.toughness ?? 0)
      ? ptAmount(pump.power ?? 0)
      : `${ptAmount(pump.power ?? 0)}/${ptAmount(pump.toughness ?? 0)}`;
    if (scope === 'other_creatures_you_control') parts.push(`inne twoje stwory: ${pt}`);
    else if (scope === 'all_creatures_you_control') parts.push(`twoje stwory: ${pt}`);
    else parts.push(pt);
  }
  // Keywordy zdolności STATYCZNEJ: pokazujemy tylko, gdy zdolność jest
  // SCOPOWANA na inne obiekty (Altar of the Goyf → Lhurgoyf trample, True
  // Conviction → other creatures). Dla zdolności SAMODZIAŁAJĄCEJ (brak
  // scope) keyword i tak trafia do keywordLine przez effectiveKeywords —
  // powtórzenie go tu dawało dublet (Ainok Artillerist „Zasięg · Zasięg",
  // audyt diamentowy challenge 2).
  // M138/Z3 (audyt Żywym Testerem): keyword WARUNKOWY (bez scope) też musi tu
  // być. Ainok Artillerist pokazywał „gdy ma licznik +1/+1” — warunek bez
  // skutku, zdanie urwane. Powód: dopóki warunek nie zachodzi, keyword nie
  // wchodzi do `effectiveKeywords`, więc nie ma go też w keywordLine — i kafel
  // milczy o całej zdolności. Dublet, przed którym broniła bramka `scope`,
  // grozi tylko przy keywordzie BEZWARUNKOWYM (ten faktycznie jest już
  // w keywordLine), więc warunek wystarcza jako rozróżnienie.
  const hasCondition = Boolean(cond && Object.keys(cond).length > 0);
  if (ability?.keywords?.length && (scope || hasCondition)) {
    const kws = (ability.keywords).map((k) => KEYWORD_LABELS[k] ?? k).join(' ');
    const who = ability?.scope?.subtype
      ? `twoje stwory ${ability.scope.subtype}`
      : (scope === 'other_creatures_you_control' ? 'inne twoje stwory'
        : (scope === 'all_creatures_you_control' ? 'twoje stwory' : null));
    parts.push(who ? `${who}: ${kws}` : kws);
  }
  if (cond.minLevel != null || cond.maxLevel != null) {
    const range = cond.minLevel != null && cond.maxLevel != null
      ? `${cond.minLevel}-${cond.maxLevel}` : (cond.minLevel != null ? `${cond.minLevel}+` : `${cond.maxLevel}-`);
    parts.push(`poziomy ${range}`);
  }
  if (cond.minLandsControlled) parts.push(`przy ${cond.minLandsControlled}+ landach`);
  if (cond.minArtifactsControlled) parts.push(`przy ${cond.minArtifactsControlled}+ artefaktach`);
  if (cond.minCardsDrawnThisTurn) parts.push(`przy ${cond.minCardsDrawnThisTurn}+ dobranych kartach`);
  if (cond.controlsAnotherMulticolored) parts.push('gdy kontrolujesz inny wielokolorowy permanent');
  if (cond.controlsAnotherArtifact) parts.push('gdy kontrolujesz inny artefakt');
  if (cond.hasCounter) parts.push(`gdy ma licznik ${COUNTER_LABELS[cond.hasCounter] ?? cond.hasCounter}`);
  if (cond.minCreatureCardsInGraveyard) parts.push(`przy ${cond.minCreatureCardsInGraveyard}+ stworach w grobie`);
  if (ability.cantBlock || ability.cant_block) parts.push('nie może blokować');
  if (ability.mustAttack) parts.push('musi atakować');
  if (ability.cantAttackAlone) parts.push('nie może atakować sam');
  if (ability.cantBlockAlone) parts.push('nie może blokować sam');
  if (ability.cantAttackUnlessDefenderHasFlying) parts.push('atakuje tylko, gdy obrońca ma latanie');
  if (ability.faceDownEnterFlyingCounter) parts.push('zakryte stwory wchodzą z licznikiem flying');
  if (ability.costModifier) parts.push('obniża koszt czarów');
  return parts.join(' · ');
}

function describeAbility(ability, { withCost = true, withTarget = true } = {}) {
  // M73d (A): cyclyng/channel — czytelny opis zamiast „efekt (undefined)"
  // (definicje mają effect: {}; część kart nie ma keyword 'cycling').
  if (ability?.cycling) {
    const draw = ability.cycling.drawCards != null ? ' → dobierz kartę' : '';
    const kinds = Object.keys(ability.cycling).flatMap((guard) => ability.cycling[guard] ?? []);
    const search = draw ? '' : (kinds.length ? ` → szukaj: ${kinds.join(' lub ')}` : '');
    return `Cycling ${costTextOf(ability)}${draw || search}`;
  }
  if (ability?.channel) {
    return `Channel ${costTextOf(ability)} — szukaj podstawowego lądu`;
  }
  // M138/Z10 (audyt Żywym Testerem): zdolność, której treścią jest KEYWORD,
  // a nie lista efektów (`effect: []` — mechanikę realizuje silnik po
  // `ability.keyword`), renderowała się jako samotny koszt. Trestle Troll
  // pokazywał w środku kafla gołe „{3}” — Oracle: „{1}{B}{G}: Regenerate this
  // creature.”. Cycling i channel miały już swoje gałęzie, reszta nie.
  const bareKeyword = ability?.keyword;
  const effectList = Array.isArray(ability?.effect) ? ability.effect : (ability?.effect ? [ability.effect] : []);
  if (bareKeyword && effectList.length === 0 && ability?.type !== 'static') {
    const label = ABILITY_KEYWORD_LABELS[bareKeyword] ?? (KEYWORD_LABELS[bareKeyword] ?? bareKeyword);
    const cost = costTextOf(ability);
    return withCost && cost ? `${cost}: ${label}` : label;
  }
  if (ability?.type === 'static') return describeStatic(ability);
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const parts = effects.filter((e) => e && typeof e.type === 'string' && e.type !== '').map(describeEffect);
  const target = (ability?.targets ?? [])[0];
  // M100/E10 (P11 — Żywy Tester h08): „any target" → „dowolny cel" bez
  // pleonazmu „cel: dowolny cel" (etykieta już zawiera słowo „cel").
  // M138/Z8: `cost.maxPowerX` ogranicza CEL, a nie koszt (Entrancing Lyre:
  // „Tap target creature with power X or less”) — bez tego gracz wybierał X
  // nie wiedząc, że ta sama liczba decyduje, kogo wolno tapnąć.
  const powerCap = ability?.cost?.maxPowerX ? ' o sile ≤ X' : '';
  const targetText = (withTarget && target)
    ? (target.type === 'any_target' ? targetTypeLabel(target.type) : `cel: ${targetTypeLabel(target)}${powerCap}`)
    : '';
  // B (2026-08-11): w etykiecie akcji „Aktywuj: X (koszt …)" koszt jest już
  // pokazany osobno (costPart) — zdublowany koszt w describeAbility mylił.
  // Diament (2026-08-11): withTarget:false dla etykiety AKCJI — cel i tak jest
  // dopisany osobno „→ cel: <nazwa>" (audyt: dublowany „cel: gracz").
  // M138/Z2: koszt liczy `costTextOf` — TRZECIA kopia tej samej logiki (obok
  // `abilityCostHtml` i `costTextOf`) gubiła pipy kolorów i wszystkie koszty
  // pozamanowe, przez co kafel Goblin Pickera obiecywał „{1}, {T}: dobierz
  // kartę”, a aktywacja odrzucała kartę z ręki (L28: tabela zamiast n-tej kopii).
  const head = withCost ? costTextOf(ability) : '';
  const effectText = parts.join(' + ');
  if (!targetText) return [head, effectText].filter(Boolean).join(': ');
  const base = [head, targetText].filter(Boolean).join(': ');
  return [base, effectText].filter(Boolean).join(' — ');
}

/** Czytelny opis zdolności triggerowanej (np. „Gdy ta karta umrze: zyskaj 2 życia”). */
function describeTriggered(ability, controllerId = HUMAN_ID) {
  const trigger = ability?.trigger ?? {};
  // M146 (znalezisko audytu #2): kafel karty PRZECIWNIKA pokazywał „twój
  // permanent" (perspektywa kontrolera karty, ale czytane przez gracza).
  // Dla kart przeciwnika używamy neutralnego „kontrolera".
  const mine = controllerId == null || controllerId === HUMAN_ID;
  const own = (mine ? 'twój' : 'kontrolera');
  const ownPermanent = (mine ? 'twój permanent' : 'permanent kontrolera');
  // M73d (A2): trigger modalny (Etherwrought Page — 3 tryby) nie ma efektów —
  // pokazujemy tryby zamiast pustego „: .".
  if (Array.isArray(ability?.modes) && ability.modes.length > 0 || Array.isArray(trigger?.modes) && trigger.modes.length > 0) {
    const modesList = ability?.modes ?? trigger?.modes ?? [];
    const names = modesList.map((m) => m.name ?? 'tryb').join(' / ');
    return `wybierz tryb: ${names}`;
  }
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const parts = effects.filter((e) => e && typeof e.type === 'string' && e.type !== '').map(describeEffect).join(', ');
  // M159/Z2 (Żywy Tester g7, Exterminator Magmarch): trigger z warunkiem
  // multiplayer („if another opponent…”) jest w 1v1 martwy z definicji
  // formatu — kafel mówi to wprost zamiast renderować pusty szum.
  if (trigger.condition?.anotherOpponentExists) {
    return 'Trigger wymaga drugiego przeciwnika — nieaktywny w grze 1v1';
  }
  if (trigger.event === 'dies') return `Gdy ta karta umrze: ${parts}.`;
  if (trigger.event === 'combat_damage_to_player') return `Gdy zada obrażenia graczowi: ${parts}.`;
  if (trigger.event === 'enter_battlefield' && trigger.sacrificeIfUnpaid) return `Gdy wejdzie na pole bitwy: zapłać {${trigger.payMana ?? 0}} albo ją poświęć (płatność automatyczna).`;
  if (trigger.event === 'enter_battlefield') {
    // Celowany ETB z obrażeniami (Forge Devil, Reclusive Artificer): damage
    // idzie na CEL — „zada N obrażeń celowi" zamiast gołego „N obrażeń".
    const hasDamage = effects.some((e) => e.type === 'damage');
    if (trigger.requiresTarget && hasDamage) {
      const rew = effects.map((e) => {
        if (e.type === 'damage') {
          const amt = e.amount;
          if (typeof amt === 'number') return `zada ${damageCount(amt)} celowi`;
          if (amt === 'X') return 'zada X obrażeń celowi';
          const noun = DYNAMIC_AMOUNT_NOUNS[amt];
          return noun ? `zada tyle obrażeń, ile ${noun}, celowi` : `zada ${dynamicAmount(amt)} obrażeń celowi`;
        }
        return describeEffect(e);
      }).join(' i ');
      return `Gdy wejdzie na pole bitwy: ${rew}.`;
    }
    return `Gdy wejdzie na pole bitwy: ${parts}.`;
  }
  if (trigger.event === 'attacks') return `Gdy atakuje: ${parts}.`;
  if (trigger.event === 'bat_attacks') return `Gdy nietoperz, który kontrolujesz, atakuje: ${parts}.`;
  if (trigger.event === 'upkeep') return `Na początku upkeep (${trigger.condition?.noSpellsLastTurn ? 'gdy wcześniej nie rzucano czarów' : 'gdy rzucono 2+ czary'}): ${parts}.`;
  // Czytelne opisy powszechnych triggerów (audyt żywym testerem M80) — zamiast
  // surowego fallbacku „Trigger <event>".
  if (trigger.event === 'any_creature_dies') return `Gdy jakiekolwiek stworzenie umrze: ${parts}.`;
  if (trigger.event === 'enchantment_you_control_enters') return `Konstelacja — gdy ${own} enchantment wchodzi: ${parts}.`;
  if (trigger.event === 'land_entered_under_your_control') return `Landfall — gdy land wchodzi pod ${mine ? 'twoją kontrolą' : 'kontrolą kontrolera'}: ${parts}.`;
  if (trigger.event === 'creature_you_control_enters') return `Gdy stwór wchodzi pod twoją kontrolą: ${parts}.`;
  if (trigger.event === 'artifact_you_control_enters') return `Gdy artefakt wchodzi pod twoją kontrolą: ${parts}.`;
  if (trigger.event === 'other_creature_you_control_dies') {
    return `Gdy kontrolowany stwór umiera, a ta karta jest w grobie: zapłać {${trigger.payMana ?? 0}} i wróć na rękę.`;
  }
  if (trigger.event === 'land_entered_under_opponent_control') return `Gdy land wchodzi pod kontrolą przeciwnika: ${parts}.`;
  if (trigger.event === 'end_step') {
    const cond = trigger.condition?.minTappedCreaturesControlled
      ? ` (gdy kontrolujesz ${trigger.condition.minTappedCreaturesControlled}+ zatapnięte stwory)` : '';
    return `Na początku kroku końca${cond}: ${parts}.`;
  }
  if (trigger.event === 'exploits') return `Gdy ten stwór exploituje: ${parts}.`;
  if (trigger.event === 'equipped_creature_attacks') return `Gdy wyposażony stwór atakuje: ${parts}.`;
  if (trigger.event === 'aura_host_targeted_by_spell') return `Gdy zaczarowany stwór staje się celem czaru: ${parts}.`;
  if (trigger.event === 'you_cast_second_spell_each_turn') return `Gdy rzucisz drugi czar w turze: ${parts}.`;
  if (trigger.event === 'you_cast_noncreature_spell') return `Gdy rzucisz czar niebędący stworem: ${parts}.`;
  if (trigger.event === 'when_you_cast_spell') return `Gdy rzucisz czar: ${parts}.`;
  if (trigger.event === 'beginning_of_combat') return `Na początku walki: ${parts}.`;
  if (trigger.event === 'player_casts_spell') {
    const colorNote = trigger.spellColorsInclude?.length
      ? ` (${trigger.spellColorsInclude.join('/')})` : '';
    return `Gdy gracz rzuci czar${colorNote}: ${parts}.`;
  }
  if (trigger.event === 'leaves_battlefield') return `Gdy ta karta opuszcza pole bitwy: ${parts}.`;
  if (trigger.event === 'other_permanent_you_control_dies') return `Gdy inny ${ownPermanent} ginie: ${parts}.`;
  if (trigger.event === 'permanents_you_control_leave_battlefield') return `Gdy ${ownPermanent} opuszcza pole bitwy: ${parts}.`;
  if (trigger.event === 'enchanted_creature_damage_to_opponent') return `Gdy zaczarowany stwór zada obrażenia przeciwnikowi: ${parts}.`;
  if (trigger.event === 'any_combat_damage_to_player') return `Gdy ${mine ? 'jeden z twoich stworów' : 'stwór kontrolera'} zada obrażenia bojowe graczowi: ${parts}.`;
  if (trigger.event === 'card_put_into_graveyard_from_nonbattlefield') return `Gdy karta trafia do grobu spoza pola bitwy: ${parts}.`;
  if (trigger.event === 'cards_exiled_from_your_graveyard') return `Ilekroć karty trafiają na wygnanie z twojego grobu: ${parts}.`;
  if (trigger.event === 'spell_targets_this_creature') return `Gdy czar celuje w tę kartę: ${parts}.`;
  if (trigger.event === 'another_creature_enters') return `Gdy inny stwór wchodzi na pole bitwy: ${parts}.`;
  // M100/E10 (P7 — Żywy Tester h08/h13): mentor ma efekt [] (obsługiwany
  // przez wizard resolve_mentor_target) — bez zdania efektu wychodziło
  // „Gdy ten stwór atakuje jako mentor: ." (fallback niżej był nieosiągalny).
  if (trigger.event === 'mentor_attacks') {
    return parts
      ? `Gdy ten stwór atakuje jako mentor: ${parts}.`
      : 'Gdy ten stwór atakuje jako mentor: wybrany atakujący stwór o mniejszej sile dostaje licznik +1/+1.';
  }
  if (trigger.event === 'attacks_alone') return `Gdy atakuje samotnie: ${parts}.`;
  if (trigger.event === 'turned_face_up') return `Gdy ten stwór zostanie odwrócony twarzą do góry: ${parts}.`;
  if (trigger.event === 'noncombat_damage_to_opponent') {
    return parts
      ? `Gdy źródło, które kontrolujesz, zada niebojowe obrażenia przeciwnikowi: ${parts}.`
      : 'Gdy źródło, które kontrolujesz, zada niebojowe obrażenia przeciwnikowi — ten stwór zada tyle samo obrażeń celowi (delirium).';
  }
  // M73d Gold: użyj TRIGGER_EVENT_LABELS z session.js dla spójnego tłumaczenia
  // surowych nazw zdarzeń triggerów (np. you_cast_noncreature_spell → "rzucenie czaru
  // niebędącego stworem"). Fallback na surową nazwę, gdy brak tłumaczenia.
  const eventLabel = TRIGGER_EVENT_LABELS[trigger.event] ?? trigger.event;
  // Specjalne opisy dla triggerów z pustym efektem (mentor, itp.)
  if (trigger.event === 'mentor_attacks') return `Trigger ${eventLabel}: cel dostaje licznik +1/+1.`;
  if (!parts) return `Trigger ${eventLabel}.`;
  return `Trigger ${eventLabel}: ${parts}.`;
}

/** Tekst reguł do pola karty: keywordy, efekty czaru lub opis zdolności. */
export function rulesText(info) {
  if (info.faceDown) return '';
  const keywordLine = (info.keywords ?? []).map((kw) => KEYWORD_LABELS[kw] ?? kw).join(' ');
  const abilityLine = info.abilities && info.abilities.length
    ? info.abilities.map((a) => {
      if (a.type === 'triggered') return describeTriggered(a, info.controllerId);
      if (a.keyword === 'ninjutsu') return `Ninjutsu {${a.cost?.mana ?? '?'}}: wróć nieblokowanego atakującego, wejdź zatapnięta i atakująca`;
      if (a.keyword === 'megamorph') return `Megamorph {${a.cost?.mana ?? '?'}}: obróć twarzą do góry i połóż +1/+1`;
      if (a.keyword === 'morph') return `Morph {${a.cost?.mana ?? '?'}}: obróć twarzą do góry`;
      // M100/E10 (P9 — Żywy Tester h09/h13): zdolność equip już opisuje
      // equipLine wyżej; bez tego describeAbility doklejało goły „{4}".
      if (a.keyword === 'equip' && info.equipment) return '';
      return describeAbility(a);
    }).filter(Boolean).join('  ·  ')
    : '';
  const spellLine = info.spell ? describeSpellEffects(info.spell) : '';
  const plotLine = info.plot ? `Plot {${info.plot.cost ?? '?'}}: wygnaj z ręki, później rzuć bez kosztu` : '';
  const equip = info.equipment;
  const equipLine = equip
    ? `Equip {${equip.equip ?? '?'}}${(equip.keywords ?? []).length ? ` — nosiciel: ${(equip.keywords).map((k) => KEYWORD_LABELS[k] ?? k).join(', ')}` : ''}${equip.pump ? ` ${signed(equip.pump.power ?? 0)}/${signed(equip.pump.toughness ?? 0)}` : ''}`
    : '';
  const morphLine = info.morph && info.morph.megamorphCost != null
    ? `Megamorph {${info.morph.megamorphCost}}: możesz zagrać twarzą w dół jako 2/2 za {${info.morph.cost}}, potem obrócić za koszt Megamorph (+1/+1)`
    : (info.morph && info.morph.morphCost != null
      ? `Morph {${info.morph.morphCost}}: możesz zagrać twarzą w dół jako 2/2 za {${info.morph.cost}}, potem obrócić za koszt Morph`
      : '');
  // M100/E10 (P8 — Żywy Tester h09/h13): aura bez własnych zdolności
  // renderowała się bez żadnego opisu (Nature's Embrace: puste pole!) —
  // deskryptor aura niesie pompowanie/keywordy/grant many i to one SĄ
  // treścią karty dla gracza (CR 613 — efekt ciągły aury).
  const aura = info.aura;
  const auraLine = aura
    ? [
      aura.pump ? `stwór: ${signed(aura.pump.power ?? 0)}/${signed(aura.pump.toughness ?? 0)}` : '',
      (aura.keywords ?? []).length ? `stwór ma: ${aura.keywords.map((k) => KEYWORD_LABELS[k] ?? k).join(', ')}` : '',
      // M138/Z9 (audyt Żywym Testerem): aura ODBIERAJĄCA keyword miała kafel
      // zupełnie pusty — „Grounded · 2 · Enchantment — Aura” i nic więcej,
      // choć cała karta to „Enchanted creature loses flying”. Engine
      // (permanents.js) obsługuje `losesKeywords` od dawna; w render.js to
      // słowo nie padało ani razu. Ten sam bug co M100/E10 (pusty opis aury),
      // tylko dla przeciwnego znaku efektu.
      (aura.losesKeywords ?? []).length ? `stwór traci: ${aura.losesKeywords.map((k) => KEYWORD_LABELS[k] ?? k).join(', ')}` : '',
      // M174/D (Predator's Gambit): warunkowe keywordy aury — opis warunku
      // po deskryptorze (dziś: brak innych stworów kontrolera).
      ...(aura.conditionalKeywords ?? []).map((ck) => {
        const kws = (ck.keywords ?? []).map((k) => KEYWORD_LABELS[k] ?? k).join(', ');
        const cond = ck.condition?.controlsNoOtherCreatures ? 'gdy kontroler nie ma innych stworów'
          : ck.condition?.activePlayerIsController === true ? 'w turze kontrolera'
          : ck.condition?.activePlayerIsController === false ? 'poza turą kontrolera' : 'warunkowo';
        return `${kws} (${cond})`;
      }),
      // M138 (znalezisko #11, złapane już przez NOWY detektor w audycie
      // kontrolnym): pozostałe deskryptory aury też są treścią karty. Moonlit
      // Meditation miała kafel „Enchantment — Aura” i nic więcej, mimo że
      // zmienia zasady tworzenia tokenów. Ta sama rodzina co Z9 — łatanie
      // pojedynczego pola zostawiłoby resztę na następny audyt.
      aura.cantAttack ? 'zaczarowany nie może atakować' : '',
      aura.cantBlock ? 'zaczarowany nie może blokować' : '',
      aura.cantAttackYou ? 'zaczarowany nie może atakować ciebie' : '',
      aura.replaceTokenCreation
        ? `pierwsze tworzenie tokenów w turze: zamiast nich kopie zaczarowanego permanentu${aura.replaceTokenCreation.optional ? ' (możesz)' : ''}`
        : '',
      aura.grantMana ? `ląd: „T: dodaj ${aura.grantMana.amount ?? 2} many dowolnego koloru"` : '',
    ].filter(Boolean).join(' · ')
    : '';
  const landLine = info.kind === 'land' ? 'T: dodaj 1 manę' : '';
  // M159/Z4 (Żywy Tester g6): Saga w ręce/na stole renderowała się BEZ
  // treści („Invasion of the Giants · 2 · Enchantment — Saga” i nic) —
  // rozdziały są całą treścią karty dla gracza (ta sama rodzina co pusty
  // opis aury M100/E10 i M138/Z9). Opisujemy je z deskryptorów (ADR 0002).
  const sagaLine = info.saga?.chapters?.length
    ? `Saga — ${info.saga.chapters.map((chapter, index) => {
      const roman = SAGA_ROMAN[index] ?? String(index + 1);
      const chapterParts = (Array.isArray(chapter) ? chapter : [chapter])
        .filter((e) => e && typeof e.type === 'string').map(describeEffect).filter(Boolean).join(', ');
      return `${roman}: ${chapterParts || '?'}`;
    }).join(' · ')}`
    : '';
  return [keywordLine, spellLine, plotLine, equipLine, auraLine, abilityLine, morphLine, sagaLine, landLine].filter(Boolean).join(' · ');
}

/** Etykieta przycisku akcji — po polsku, z nazwami kart i celów.
 *  UWAGA: prefiksy („Dobierz kartę\", „Zagraj ląd\", „Rzuć:\"…) są częścią
 *  kontraktu testu UI — ikony dodajemy wyłącznie przez CSS (::before). */
/**
 * Odmiana liczebnika „opcja" przy liczbie (uwaga właściciela A, 2026-08-10):
 * 1 opcja · 2–4 opcje · 5+ opcji · wyjątek 12–14 → opcji (i 22–24, 32–34… opcje).
 */
function optionsCountLabel(count) {
  if (count === 1) return '1 opcja';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  return `${count} ${few ? 'opcje' : 'opcji'}`;
}

/** Deskryptory grup wyboru po typie żądania — rzeczowniki (bez „wybierz"). */
const CHOICE_GROUP_TYPE_DESCRIPTORS = Object.freeze({
  declare_attackers: 'Deklaracja atakujących',
  declare_blockers: 'Deklaracja blokujących',
  damage_assignment: 'Rozdzielenie obrażeń bojowych',
  // M172/E: wizard podziału obrażeń między cele (Inferno Titan).
  damage_division: 'Podział obrażeń między cele',
  scry: 'Scry — co odłożyć na spód?',
  surveil: 'Surveil — karty do grobu',
  index: 'Index — kolejność na wierzchu biblioteki',
  clash: 'Clash — wierzch czy spód?',
  sacrifice: 'Poświęcenie',
  value: 'Wartość X',
  phyrexian: 'Zapłata: mana czy życie?',
  escape: 'Ucieczka (Escape) — karty do wygnania',
  'room-target': 'Cel pokoju lochu',
});

/** Deskryptory grup wyboru po typie pierwszej komendy (typ żądania generyczny). */
const CHOICE_GROUP_COMMAND_DESCRIPTORS = Object.freeze({
  resolve_mulligan_choice: 'Mulligan',
  resolve_mulligan_bottom_choice: 'Karty na spód biblioteki (mulligan)',
  resolve_search_choice: 'Szukanie w bibliotece',
  resolve_fertile_thicket: 'Fertile Thicket — wierzch biblioteki',
  resolve_springbloom: 'Springbloom Druid — land do poświęcenia',
  resolve_backup: 'Backup — który stwór dostaje liczniki?',
  resolve_trigger_target: 'Cel wyzwalonej zdolności',
  resolve_grave_free_cast: 'Rzut z grobu za {X} (Halo Forager)',
  resolve_delirium_target: 'Delirium — cel obrażeń',
  resolve_mentor_target: 'Mentor — kto dostaje licznik?',
  resolve_graveyard_top_choice: 'Karta z grobu na wierzch biblioteki',
  resolve_hand_creature: 'Stwór do położenia obok kosztu',
  resolve_legend_choice: 'Prawo legend — który zostaje?',
  resolve_redirect_choice: 'Przekierowanie obrażeń',
  resolve_proliferate: 'Proliferate — cel licznika',
  resolve_discard_choice: 'Karta do odrzucenia',
  resolve_hand_top_choice: 'Karta z ręki na wierzch biblioteki',
  resolve_damage_division: 'Podział obrażeń między cele',
  resolve_damage_target: 'Cel obrażeń',
  resolve_sacrifice_choice: 'Poświęcenie stwora',
  resolve_devour_choice: 'Devour — poświęcenie stwora',
  resolve_food_choice: 'Food — poświęcić za wzmocnienie?',
  resolve_amass_choice: 'Amass — która Armia dostaje liczniki?',
  resolve_modal_choice: 'Tryb czaru („choose one")',
  resolve_discover_choice: 'Discover — rzucić czy wziąć do ręki?',
  resolve_endure_choice: 'Endure — liczniki czy token?',
  resolve_explore_choice: 'Explore — co z odsłoniętą kartą?',
  resolve_craft_exile: 'Craft — karta do wygnania',
  resolve_color_choice: 'Kolor (np. ochrona)',
  resolve_optional_trigger_choice: 'Efekt dobrowolny („you may")',
  resolve_enter_as_copy: 'Wejście jako kopia — który Ally?',
  resolve_destroy_equipment_choice: 'Zniszczyć equipment?',
  resolve_land_type_choice: 'Typ landa',
  resolve_library_placement: 'Wierzch czy spód biblioteki',
  resolve_pay_or_sacrifice: 'Zapłata albo poświęcenie',
  resolve_optional_pay_choice: 'Dobrowolna dopłata',
  resolve_moonlit_choice: 'Moonlit — wybór efektu',
  resolve_reveal_order: 'Kolejność kart na wierzchu biblioteki',
});

/**
 * Tytuł „rzeczowy" grupy celów — z nazwą karty/zdolności, BEZ prefiksu
 * „Wybierz:" (uwaga właściciela A: „Aura: Benevolent Blessing (3 opcje)").
 * null → etykieta schodzi na deskryptor czynności z prefiksem „Wybierz:".
 */
function choiceSourceTitle(cmd, session, view) {
  // Uwaga C właściciela (2026-08-10): modal wyboru ma nazywać kartę, która
  // go wywołała. Komendy resolve_* nie niosą objectId — źródło czytamy
  // z oczekujących decyzji w widoku (publiczna informacja stołowa).
  if (cmd?.type === 'resolve_trigger_target' && view?.pendingTriggerTarget?.cardId) {
    const pt = view.pendingTriggerTarget;
    const base = session.nameOf(pt.cardId);
    // M172/B (uwaga właściciela): rozdział Sagi przedstawia się TYTUŁEM
    // z Oracle i opisem efektu — „Shiva… — Mesmerize: nie może być
    // blokowany (cel)" zamiast generycznego „cel triggera".
    if (pt.chapterName) {
      const label = describeEffect({ type: pt.effectType });
      return label ? `${base} — ${pt.chapterName}: ${label} (cel)` : `${base} — ${pt.chapterName}: cel triggera`;
    }
    return `${base} — cel triggera`;
  }
  if (cmd?.type === 'resolve_modal_choice' && view?.pendingModalTrigger?.cardId) {
    return `${session.nameOf(view.pendingModalTrigger.cardId)} — wybór trybu`;
  }
  // M162/C (uwaga właściciela): Chittering Rats — źródło decyzji „karta z
  // ręki na wierzch biblioteki" w tytule modala (sourceCardId z pendingu,
  // wystawiony w playerView wyłącznie właścicielowi decyzji).
  if (cmd?.type === 'resolve_hand_top_choice' && view?.pendingHandTopChoice?.sourceCardId) {
    return `${session.nameOf(view.pendingHandTopChoice.sourceCardId)} — karta z ręki na wierzch biblioteki`;
  }
  // M163/A: Exploit (Silumgar Butcher) — tytuł grupy nazywa źródło decyzji
  // (karta publiczna na polu bitwy; pendingExploit w widoku tylko właściciela).
  if (cmd?.type === 'resolve_exploit_choice' && view?.pendingExploit?.sourceCardId) {
    return `${session.nameOf(view.pendingExploit.sourceCardId)} — Exploit (poświęć stwora)`;
  }
  // M166/D: Inferno Titan — tytuł grupy nazywa źródło i łączną kwotę.
  if (cmd?.type === 'resolve_damage_division' && view?.pendingDamageDivision?.sourceCardId) {
    return `${session.nameOf(view.pendingDamageDivision.sourceCardId)} — podziel ${view.pendingDamageDivision.total} obrażeń`;
  }
  if (!cmd || cmd.objectId == null) return null;
  const zones = ['hand', 'battlefield', 'stack', 'graveyard', 'library'];
  let object = null;
  for (const zone of zones) {
    object = (view?.zones?.[zone] ?? []).find((o) => o.id === cmd.objectId) ?? null;
    if (object) break;
  }
  if (!object) return null;
  // M87: tytuł idzie i do innerHTML przycisku, i do textContent nagłówka
  // modala — escapeHtml dawał „Hunter&#39;s Blowgun" w oknie wyboru.
  const name = session.nameOf(object.cardId);
  if (cmd.type === 'cast_permanent' && cmd.targets?.length) {
    if (cmd.bestow) return `Bestow: ${name}`;
    if (object.aura) return `Aura: ${name}`;
    return `Cel dla: ${name}`;
  }
  if (cmd.type === 'cast_spell' && cmd.sacrificeTargetId && !cmd.targets?.length) {
    return `Poświęć stwora — ${name}`;
  }
  if (cmd.type === 'cast_spell' && cmd.targets?.length) {
    const mode = (cmd.modeIndex != null && object.spell?.modes)
      ? object.spell.modes[cmd.modeIndex] : null;
    return mode?.name ? `Cel czaru: ${name} — ${mode.name}` : `Cel czaru: ${name}`;
  }
  if (cmd.type === 'cast_cleave' && cmd.targets?.length) return `Cel czaru (Cleave): ${name}`;
  // M106/Z5 (audyt stołu): equip grupował się jako „Cel zdolności: Sprzęt",
  // a opcje w środku mówiły „Wyposaż: Sprzęt → stwór" — dwie różne nazwy tej
  // samej akcji. Nazwa keyworda jest w deskryptorze, więc grupa może nazwać
  // rzecz po imieniu (jak station/crew w M103/C2).
  if (cmd.type === 'activate_ability' && cmd.targets?.length) {
    const ability = session.state?.objects?.get(cmd.objectId)?.abilities?.[cmd.abilityIndex];
    if (ability?.keyword === 'equip') return `Wyposaż: ${name}`;
    return `Cel zdolności: ${name}`;
  }
  // M103/C2 (zgłoszenie właściciela): warianty station/crew/tap-innego-stwora
  // grupują się po obiekcie — bez tej gałęzi tytuł spadał do generycznego
  // „Wybierz: Wariant (N opcji)" i gracz nie wiedział, czego dotyczy wybór.
  if (cmd.type === 'activate_ability'
    && (cmd.tapOtherCreatureId != null || cmd.tapCreatureId != null || cmd.crewCreatureIds?.length
      || cmd.sacrificeLandId != null)) {
    return `Aktywuj: ${name}`;
  }
  return null;
}

/**
 * Pełna etykieta przycisku grupy wyborów w panelu „Twoje działania" (uwaga
 * właściciela A, 2026-08-10): opis CO wybieramy — nazwany tytuł („Aura:
 * Benevolent Blessing (3 opcje)") albo deskryptor czynności z prefiksem
 * („Wybierz: Mulligan (2 opcje)"), z odmienioną liczbą — nigdy generyczne
 * „Wybierz: wybierz (N opcji)".
 */
/** Tytuł grupy BEZ licznika — nagłówek modala wyboru (main.js introLabel). */
export function choiceGroupTitle(request, session, view) {
  const options = request?.options ?? [];
  const titled = choiceSourceTitle(options[0], session, view);
  if (titled) return titled;
  const descriptor = CHOICE_GROUP_TYPE_DESCRIPTORS[request?.type]
    ?? CHOICE_GROUP_COMMAND_DESCRIPTORS[options[0]?.type]
    ?? (request?.type === 'target' ? 'Cel' : 'Wariant');
  return `Wybierz: ${descriptor}`;
}

export function choiceGroupLabel(request, session, view) {
  // M172/E: wizard podziału obrażeń — liczba enumerowanych kombinacji to
  // szum („(33 opcje)"); wpis panelu opisuje CZYNNOŚĆ, nie licznik ofert.
  if (request?.type === 'damage_division') {
    const total = view?.pendingTriggerTarget?.divisionTotal;
    const src = view?.pendingTriggerTarget?.cardId ? session.nameOf(view.pendingTriggerTarget.cardId) : null;
    return `${src ? `${src} — ` : ''}podziel ${total ?? '?'} ${total === 1 ? 'obrażenie' : (total >= 2 && total <= 4 ? 'obrażenia' : 'obrażeń')} między cele`;
  }
  const count = (request?.options ?? []).length;
  return `${choiceGroupTitle(request, session, view)} (${optionsCountLabel(count)})`;
}

/**
 * Etykiety CAŁEJ listy opcji jednego wyboru, z rozróżnieniem duplikatów.
 *
 * M102/U3 (audyt żywym testerem): modale pokazywały nierozróżnialne opcje —
 * „Szukanie: Forest" ×17 (17 kopii tej samej karty w bibliotece) czy cztery
 * landy o tej samej nazwie do poświęcenia. Nazwa karty nie wystarcza, gdy na
 * liście stoi kilka EGZEMPLARZY tej samej karty: gracz klika w ciemno i nie
 * wie, czy trafił w ten obiekt, o który mu chodziło.
 *
 * Pojedyncza etykieta nie może tego naprawić — nie wie o istnieniu bliźniaka.
 * Numerujemy więc tam, gdzie widać całą listę, i TYLKO faktyczne duplikaty
 * (unikaty zostają nietknięte, żeby nie zaśmiecać typowych wyborów).
 *
 * @param {object[]} options — komendy jednego wyboru
 * @returns {string[]} — etykiety w tej samej kolejności co `options`
 */
export function labelChoiceOptions(options, session, view) {
  const list = Array.isArray(options) ? options : [];
  const labels = list.map((cmd) => commandLabel(cmd, session, view));
  const counts = new Map();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const seen = new Map();
  return labels.map((label) => {
    const total = counts.get(label) ?? 0;
    if (total < 2) return label;
    const index = (seen.get(label) ?? 0) + 1;
    seen.set(label, index);
    return `${label} (${index} z ${total})`;
  });
}

/**
 * M126/#1 — efekty, które CZYTAJĄ własną bibliotekę. Przy pustej bibliotece
 * gracza taka zdolność jest jałowa: koszt (mana + tapnięcie) zostaje
 * zapłacony, a skutku nie ma (CR 701.54a — explore bez karty nic nie robi;
 * analogicznie scry/surveil/mill/look).
 *
 * Żywy Tester (M126) pokazał to na Guidestone Compass, a audyt rozszerzył
 * na całą rodzinę: Seer's Lantern, Prismari Campus, Cellar Door. Nie
 * blokujemy zagrania (bywa świadome — np. żeby zatapnąć własny permanent),
 * ale mówimy wprost, że nie będzie skutku — ten sam wzorzec co ostrzeżenie
 * „czar fizzluje" przy Bone Splinters (M102/U8).
 */
const LIBRARY_READING_EFFECTS = new Set([
  'explore', 'scry', 'surveil', 'mill_cards', 'mill_from_bottom',
  'look_top_n', 'discover', 'draw_cards',
]);

/** Czy własna biblioteka gracza jest pusta (w jego widoku)? */
function ownLibraryEmpty(view) {
  const library = view?.zones?.library ?? [];
  return library.every((o) => o?.controllerId !== view.playerId);
}

/** Czy zdolność czyta bibliotekę i nie ma z czego jej przeczytać? */
function abilityFizzlesOnEmptyLibrary(ability, view) {
  if (!ability || !ownLibraryEmpty(view)) return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : (ability.effect ? [ability.effect] : []);
  if (effects.length === 0) return false;
  // Ostrzegamy tylko, gdy CAŁA treść zdolności zależy od biblioteki —
  // inaczej „mill 3 + zysk życia" dostałby fałszywe ostrzeżenie.
  return effects.every((e) => e?.type && LIBRARY_READING_EFFECTS.has(e.type));
}

/**
 * M126/#2 — zdolności, których treść zależy od zawartości WŁASNEJ RĘKI.
 * Dragon Arch („{2}, {T}: You may put a multicolored creature card from your
 * hand onto the battlefield") bez wielokolorowego stwora w ręce zabiera
 * {2} i tapnięcie, a nie robi nic (CR 608.2b — „you may" bez kandydata).
 * Ta sama klasa co pusta biblioteka, inny zasób.
 */
const HAND_DEPENDENT_EFFECTS = new Map([
  ['put_multicolored_creature_from_hand', (card) => card.kind === 'creature' && (card.colors ?? []).length >= 2],
]);

/** Czy zdolność zależy od karty w ręce, której gracz nie ma? */
function abilityFizzlesOnHand(ability, view) {
  if (!ability) return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : (ability.effect ? [ability.effect] : []);
  if (effects.length === 0) return false;
  return effects.every((effect) => {
    const predicate = effect?.type ? HAND_DEPENDENT_EFFECTS.get(effect.type) : null;
    if (!predicate) return false;
    const hand = (view?.zones?.hand ?? []).filter((o) => o?.controllerId === view.playerId);
    return !hand.some((card) => predicate(card));
  });
}

export function commandLabel(cmd, session, view) {
  const obj = (id) => view.zones.hand.find((o) => o.id === id)
    ?? view.zones.battlefield.find((o) => o.id === id)
    ?? view.zones.stack.find((o) => o.id === id)
    ?? view.zones.graveyard.find((o) => o.id === id)
    ?? view.zones.library.find((o) => o.id === id)
    ?? view.zones.exile?.find((o) => o.id === id);
  const playerNameOf = (id) => PLAYER_NAMES[id] ?? view.players?.find((p) => p.id === id)?.name ?? id;
  const nameOfObjectId = (id) => {
    const player = view.players?.find((p) => p.id === id);
    if (player) return escapeHtml(player.name ?? id);
    const object = obj(id);
    // Face-down (morph, CR 708.2): „morph" zamiast „?" w etykietach celów
    // (audyt żywym testerem M73c — „Rzuć: Expunge → cel: ?").
    // M100/E10 (P12 — Żywy Tester h01): WŁASNY morph ma być nazwany
    // (właściciel zna tożsamość własnej zakrytej karty — CR 708.6; np.
    // „Rzuć: Village Rites — poświęć Segmented Krotiq"). playerView maskuje
    // cardId wrogiego face-down do null → wróg zostaje „morph" (CR 708.2).
    // M100/E12 (pytanie właściciela): własny morph nazwany ZE znacznikiem
    // „(Morph)" — sama nazwa sugerowałaby pełnego stwora, a to zakryte 2/2.
    // M127: brzmienie znacznika z jednego źródła (session.faceDownName).
    // M155 (audyt żywym testerem): tokeny niosą jawną nazwę (object.name);
    // cardId `token_*` jest poza rejestrem, więc session.nameOf zwracałby
    // surowy id („token_squirrel").
    // M172/D: token-kopia z numerem — „Nazwa (kopia N)" w etykietach celów.
    const tokenName = object?.isToken && object.name != null
      ? (object.copyNumber ? `${object.name} (kopia ${object.copyNumber})` : object.name)
      : null;
    const base = object
      ? (object.faceDown
        ? faceDownName(object.cardId != null ? session.nameOf(object.cardId) : null)
        : (tokenName || session.nameOf(object.cardId)))
      : session.nameOfObject(id);
    // E (2026-08-11): permanent na polu bitwy, który mogą mieć OBAJ gracze
    // (np. stwór na stole) — do nazwy w modalach wyboru dopisujemy kontrolera,
    // żeby było wiadomo, czyja to karta. Skip, gdy kontroler nieznany.
    // Własny face-down ma już znacznik „(morph)" (obiekt z nazwą-kartą to
    // z definicji widoku NASZ — wrogi ma cardId null) — drugi nawias by szumiał.
    const ctrlSkip = Boolean(object?.faceDown && object.cardId != null);
    if (object && object.zone === 'battlefield' && object.controllerId != null && view.players?.length > 1 && !ctrlSkip) {
      const ctrl = playerNameOf(object.controllerId);
      return escapeHtml(`${base} (${ctrl})`);
    }
    return escapeHtml(base);
  };
  // Koszt many karty → HTML z ikonami (MANA_COSTS: string typu „{2}{U}").
  const costOfCard = (card) => {
    const raw = card && card.cardId ? MANA_COSTS[card.cardId] : null;
    return raw ? manaCostHtml(raw) : (card?.manaCost != null ? escapeHtml(String(card.manaCost)) : '?');
  };
  // Koszt zdolności aktywowanej → ikony: {T} + {X}/{N} + pipy kolorów.
  const abilityCostHtml = (ability) => {
    const cost = ability?.cost ?? {};
    // M119/Z4 (audyt żywym testerem): kolejność jak w Oracle — najpierw mana,
    // na końcu symbol tapnięcia („{2}, {T}: Scry 1”). Wcześniej {T} szło na
    // początek i sklejało się z liczbą: Seer's Lantern pokazywał „(koszt T2)”,
    // co czyta się jak jeden symbol, a nie „dwie many i tapnięcie”. Symbol
    // tapnięcia dostaje własny człon listy, żeby nie zlewał się z maną.
    const mana = [];
    if (cost.manaX) mana.push('{X}');
    const colors = cost.colors ?? [];
    const generic = Math.max(0, (cost.mana ?? 0) - colors.length);
    if (generic > 0) mana.push(`{${generic}}`);
    for (const c of colors) mana.push(`{${c}}`);
    // Diament (2026-08-11): koszty pozamany — „odrzuć N" i „poświęć"
    // (Plague Reaver) — koniec pustego „(koszt )".
    const parts = [];
    if (mana.length) parts.push(manaCostHtml(mana.join('')));
    if (cost.tap) parts.push(manaCostHtml('{T}'));
    // M138/Z2 (audyt Żywym Testerem): koszty pozamanowe z JEDNEJ listy
    // (NON_MANA_COST_LABELS) — wspólnej z `costTextOf` na kaflu karty. Dotąd
    // oba miejsca miały własne wyliczanki i rozjechały się: mapa znała
    // `discardCards` (liczbę), a Goblin Picker używa `discardCard` (boolean),
    // więc „odrzuć kartę” nie pojawiało się nigdzie. Obejmuje też
    // M101/B7 (crew/saddle — koszt to łączna MOC tapowanych stworów).
    for (const [field, label] of NON_MANA_COST_LABELS) {
      if (cost[field]) parts.push(typeof label === 'function' ? label(cost[field]) : label);
    }
    return parts.join(', ');
  };
  switch (cmd.type) {
    case 'resolve_index_choice': return 'Index — przestaw karty na wierzchu biblioteki';
    case 'resolve_damage_assignment': return 'Rozdziel obrażenia bojowe (domyślnie lethal-first)';
    case 'draw_card': return 'Dobierz kartę';
    case 'pass_priority': return 'Dalej (pass)';
    case 'concede': return 'Poddaj partię';
    case 'play_land': return `Zagraj ląd: ${nameOfObjectId(cmd.objectId)}`;
    case 'tap_for_mana': return `Przygotuj manę: ${nameOfObjectId(cmd.objectId)}`;
    case 'plot_card': {
      const card = obj(cmd.objectId);
      return `Plotuj: ${nameOfObjectId(cmd.objectId)} (koszt ${card?.plot?.cost != null ? manaCostHtml(`{${card.plot.cost}}`) : '?'})`;
    }
    case 'warp_card': {
      const card = obj(cmd.objectId);
      const wc = card?.warp;
      const remaining = wc ? Math.max(0, (wc.cost ?? 0) - (wc.colors ?? []).length) : 0;
      const costStr = wc
        ? `${(wc.colors ?? []).map((c) => `{${c}}`).join('')}${remaining > 0 ? `{${remaining}}` : ''}`
        : null;
      const cost = costStr != null ? manaCostHtml(costStr) : '?';
      return `Rzuć za warp: ${nameOfObjectId(cmd.objectId)} (koszt ${cost})`;
    }
    case 'suspend_card': {
      const card = obj(cmd.objectId);
      // M151 (audyt żywym testerem): etykieta pokazywała „koszt 1" zamiast
      // koloru ({B}) — suspend.cost to LICZBA jednostek many, a suspend.colors
      // narzuca, które z nich są kolorowymi pipami (Mindstab Suspend 4—{B} =
      // 1 jednostka, czarna). Renderujemy pipy kolorów + pozostałą część
      // generyczną (to samo kodowanie co koszt czaru, render.js:920).
      const sc = card?.suspend;
      const remaining = sc ? Math.max(0, (sc.cost ?? 0) - (sc.colors ?? []).length) : 0;
      const costStr = sc
        ? `${(sc.colors ?? []).map((c) => `{${c}}`).join('')}${remaining > 0 ? `{${remaining}}` : ''}`
        : null;
      const cost = costStr != null ? manaCostHtml(costStr) : '?';
      const n = sc?.timeCounters ?? 4;
      // M151: „4 liczników czasu" było złą odmianą (2–4 → „liczniki").
      return `Zawieś: ${nameOfObjectId(cmd.objectId)} (koszt ${cost}, ${n} ${polishPluralCount(n, 'licznik', 'liczniki', 'liczników')} czasu)`;
    }
    case 'cast_permanent': {
      const card = obj(cmd.objectId);
      if (cmd.bestow) {
        const host = nameOfObjectId(cmd.targets?.[0]);
        return `Zagraj za bestow: ${nameOfObjectId(cmd.objectId)} (koszt ${card?.bestow?.cost != null ? escapeHtml(String(card.bestow.cost)) : '?'}) → zaczaruj ${host}`;
      }
      if (cmd.targets?.length && card?.aura) {
        const host = nameOfObjectId(cmd.targets[0]);
        return `Zagraj aurę: ${nameOfObjectId(cmd.objectId)} (koszt ${costOfCard(card)}) → zaczaruj ${host}`;
      }
      if (cmd.faceDown) return `Zagraj: ${nameOfObjectId(cmd.objectId)} twarzą w dół (2/2, koszt ${card?.morph?.cost != null ? escapeHtml(String(card.morph.cost)) : '?'})`;
      // Phyrexian mana (CR 118.9): gracz wybiera, ile symboli {W/P} opłaci
      // 2 życiem (reszta z many) — wariant komendy cast_permanent.
      if (cmd.phyrexianPayWithLife != null) {
        const symbols = card?.phyrexianManaCost ?? 0;
        const byMana = symbols - cmd.phyrexianPayWithLife;
        const parts = [];
        if (byMana > 0) parts.push(`${byMana}× maną`);
        if (cmd.phyrexianPayWithLife > 0) parts.push(`${cmd.phyrexianPayWithLife}× po 2 życia`);
        return `Zagraj: ${nameOfObjectId(cmd.objectId)} (koszt ${costOfCard(card)} · phyrexian ${parts.join(' + ')})`;
      }
      if (cmd.kicked) {
        const kicker = card?.kicker ?? {};
        const kickerHtml = manaCostHtml(`${kicker.cost != null ? `{${kicker.cost}}` : ''}${(kicker.colors ?? []).map((c) => `{${c}}`).join('')}`);
        return `Zagraj: ${nameOfObjectId(cmd.objectId)} (koszt ${costOfCard(card)} + kicker ${kickerHtml})`;
      }
      return `Zagraj: ${nameOfObjectId(cmd.objectId)} (koszt ${costOfCard(card)})`;
    }
    case 'cast_spell': {
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      // Modal "Choose one" (M30 Aerith, Your Temple, Ruinous Rampage, You're
      // Confronted by Robbers): gdy komenda niesie modeIndex, a tryb ma
      // własną nazwę (spell.modes[modeIndex].name), doklej ją po nazwie karty,
      // żeby gracz widział, KTRÓ opcję wybiera ("Pray for Protection" zamiast
      // samego efektu — wŊaściciel nie wie, co jest czym).
      const cardForMode = obj(cmd.objectId);
      const mode = (cmd.modeIndex != null && cardForMode?.spell?.modes)
        ? cardForMode.spell.modes[cmd.modeIndex] : null;
      const modeName = mode?.name ? ` — ${mode.name}` : '';
      // Czary z X (Fireball, Consume Spirit, Epic Experiment): podaj wartość X,
      // żeby gracz wiedział, ile manuje decyduje (audyt M83 — „(koszt XR)").
      const xPart = cmd.xValue != null ? `, X=${cmd.xValue}` : '';
      const sac = cmd.sacrificeTargetId ? ` — poświęć ${nameOfObjectId(cmd.sacrificeTargetId)}` : '';
      const alt = cmd.payAltCost ? ' — zapłać zamiast poświęcenia' : '';
      // M102/U8: gdy celem czaru jest stwór poświęcany jako koszt, czar na
      // pewno fizzluje (CR 608.2b) — koszt płaci się po wyborze celów
      // (CR 601.2c/601.2h), więc cel znika, zanim czar się rozstrzygnie.
      // Zagranie jest legalne (i bywa zamierzone), ale gracz musi wiedzieć,
      // że straci kartę bez efektu — bez tego wygląda jak zwykły rzut.
      const selfFizzle = cmd.sacrificeTargetId != null
        && (cmd.targets ?? []).includes(cmd.sacrificeTargetId)
        ? ' — UWAGA: czar fizzluje (cel poświęcony jako koszt)' : '';
      return `Rzuć: ${nameOfObjectId(cmd.objectId)}${modeName} (koszt ${costOfCard(cardForMode)}${xPart})${targets ? ` → cel: ${targets}` : ''}${sac}${alt}${selfFizzle}`;
    }
    case 'cast_cleave': {
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const card = obj(cmd.objectId);
      const cleaveCost = card?.spell?.cleave?.manaCost != null
        ? manaCostHtml(`{${card.spell.cleave.manaCost}}`)
        : '?';
      return `Rzuć z Cleave: ${nameOfObjectId(cmd.objectId)} (koszt ${cleaveCost})${targets ? ` → cel: ${targets}` : ''}`;
    }
    case 'cast_escape': {
      // Koszt escape czyta z REGISTRY karty (graveyard view nie niesie spell —
      // strefa grobu to {id,cardId,zone}). escape.cost = {generic} (+ kolory).
      const objCard = obj(cmd.objectId);
      const defCard = objCard?.cardId ? session.cardDetails(objCard.cardId) : null;
      const escCost = defCard?.spell?.escape?.cost;
      const esc = escCost != null ? manaCostHtml(`{${escCost}}`) : '?';
      const exiled = (cmd.escapeExileIds ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const exilePart = exiled ? ` — wygnaj: ${exiled}` : '';
      return `Ucieczka: ${nameOfObjectId(cmd.objectId)} (koszt ${esc})${exilePart}`;
    }
    case 'cast_flashback': {
      const objCard = obj(cmd.objectId);
      const defCard = objCard?.cardId ? session.cardDetails(objCard.cardId) : null;
      const fbCost = defCard?.spell?.flashback?.cost;
      const fb = fbCost != null ? manaCostHtml(`{${fbCost}}`) : '?';
      return `Flashback: ${nameOfObjectId(cmd.objectId)} (koszt ${fb})`;
    }
    case 'cast_adventure': {
      const card = obj(cmd.objectId);
      // M173/A: deskryptor przygody z obiektu widoku ALBO rejestru (obiekt
      // w exile po rzucie przygody niesie tylko id+cardId).
      const adv = card?.adventure ?? (card?.cardId ? session.cardDetails(card.cardId)?.adventure : null) ?? {};
      // adv.cost to PEŁNA wartość many (mana value) — część generyczna to
      // cost − liczba pipów ({1}{B} dla cost 2 + ['B'], nie {2}{B}).
      const advPips = adv.colors ?? [];
      const advGeneric = adv.cost != null ? Math.max(0, adv.cost - advPips.length) : null;
      const advCost = adv.cost != null
        ? manaCostHtml(`${advGeneric > 0 || advPips.length === 0 ? `{${advGeneric}}` : ''}${advPips.map((c) => `{${c}}`).join('')}`)
        : '?';
      return `Przygoda: ${nameOfObjectId(cmd.objectId)} (koszt ${advCost})`;
    }
    case 'cast_adventure_creature': {
      return `Zagraj z przygody: ${nameOfObjectId(cmd.objectId)} (koszt ${costOfCard(obj(cmd.objectId))})`;
    }
    case 'activate_ability': {
      const object = obj(cmd.objectId);
      const ability = (object && object.cardId ? session.abilitiesOf(object.cardId) : [])[cmd.abilityIndex];
      if (ability?.keyword === 'ninjutsu') {
        const attacker = cmd.attackerId ? view.zones.battlefield.find((o) => o.id === cmd.attackerId) : null;
        return `Ninjutsu: ${nameOfObjectId(cmd.objectId)} (koszt ${abilityCostHtml(ability)}, wróć ${attacker ? escapeHtml(session.nameOf(attacker.cardId)) : cmd.attackerId})`;
      }
      if (ability?.keyword === 'cycling' || ability?.cycling) {
        if (ability.cycling?.drawCards != null) {
          return `Cycling: ${nameOfObjectId(cmd.objectId)} (koszt ${abilityCostHtml(ability)}) → dobierz kartę`;
        }
        const kinds = Object.keys(ability.cycling ?? {}).flatMap((guard) => ability.cycling[guard] ?? []);
        return `Cycling: ${nameOfObjectId(cmd.objectId)} (koszt ${abilityCostHtml(ability)}) → szukaj: ${kinds.join(' lub ')}`;
      }
      if (ability?.channel) {
        return `Channel: ${nameOfObjectId(cmd.objectId)} (koszt ${abilityCostHtml(ability)}) → szukaj podstawowego lądu`;
      }
      if (ability?.keyword === 'equip') {
        const target = nameOfObjectId(cmd.targets?.[0]);
        return `Wyposaż: ${nameOfObjectId(cmd.objectId)} → ${target} (koszt ${abilityCostHtml(ability)})`;
      }
      if (object?.faceDown) {
        // Flip-zdolność buduje engine z deskryptora morph (nie ma jej w
        // registry) — rodzaj (Morph/Megamorph) czytamy z object.morph.
        // M127 (uwaga A): nazwa mechaniki wielką literą, jak reszta keywordów
        // w KEYWORD_LABELS (Flash, Persist, Level up) — tu przez tę samą mapę.
        const flipKeyword = object?.morph?.megamorphCost != null ? 'megamorph' : 'morph';
        const flipKind = KEYWORD_LABELS[flipKeyword] ?? flipKeyword;
        const flipCost = object?.morph?.megamorphCost ?? object?.morph?.morphCost;
        const flipColors = object?.morph?.colors ?? [];
        const costHtml = manaCostHtml(`${flipCost != null ? `{${flipCost}}` : ''}${flipColors.map((c) => `{${c}}`).join('')}`);
        return `Obróć twarzą do góry: ${nameOfObjectId(cmd.objectId)} (${flipKind} ${costHtml})`;
      }
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const xPart = cmd.xValue != null ? ` (X=${cmd.xValue})` : '';
      const costHtml = ability ? abilityCostHtml(ability) : '';
      // Koszt czysto pozamany (Plague Reaver: „odrzuć 2 karty, poświęć") czyta
      // się źle jako „koszt odrzuć…" — dostaje dwukropek „(koszt: odrzuć…)".
      // Koszt many/taptu („4U", „T3") zostaje „(koszt 4U)".
      const costPart = costHtml
        ? (/^(odrzuć|poświęć|zapłać|wygnaj|wyrzuć)/.test(costHtml)
          ? ` (koszt: ${costHtml})` : ` (koszt ${costHtml})`)
        : '';
      const tapPart = cmd.tapCreatureId ? ` — tapnij ${nameOfObjectId(cmd.tapCreatureId)}` : (cmd.tapOtherCreatureId ? ` — tapnij ${nameOfObjectId(cmd.tapOtherCreatureId)}` : '');
      // M160/B2 (Seismic Monstrosaur): koszt „poświęć ląd” enumeruje wariant
      // per ląd — etykieta MUSI nazwać, który ląd ginie (poświęcenie to
      // koszt, CR 601.2h; sześć identycznych wpisów było nierozróżnialnych).
      const sacLandPart = cmd.sacrificeLandId != null ? ` — poświęć: ${nameOfObjectId(cmd.sacrificeLandId)}` : '';
      // M101/B7: nazwij AKCJĘ, którą gracz wykonuje (crew albo saddle — nie
      // oba naraz), i powiedz wprost, że wskazane stwory zostaną TAPNIĘTE.
      // Tapnięcie to koszt (CR 701.36a/702.171a), więc gracz musi je widzieć
      // przed kliknięciem.
      const crewNames = (cmd.crewCreatureIds ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const crewVerb = ability?.cost?.saddlePower ? 'osiodłaj' : 'załoga';
      const crewPart = cmd.crewCreatureIds?.length ? ` — ${crewVerb}: tapnij ${crewNames}` : '';
      // M126/#1: zdolność czytająca pustą bibliotekę zabierze koszt i nic nie da.
      const emptyLibWarn = abilityFizzlesOnEmptyLibrary(ability, view)
        ? ' — UWAGA: twoja biblioteka jest pusta, zdolność nie zadziała'
        : (abilityFizzlesOnHand(ability, view)
          ? ' — UWAGA: brak pasującej karty w ręce, zdolność nie zadziała' : '');
      return `Aktywuj: ${nameOfObjectId(cmd.objectId)}${costPart} — ${describeAbility(ability, { withCost: false, withTarget: false })}${xPart}${targets ? ` → cel: ${targets}` : ''}${tapPart}${sacLandPart}${crewPart}${emptyLibWarn}`;
    }
    case 'declare_attackers': {
      const names = (cmd.attackerIds ?? []).map((id) => nameOfObjectId(id));
      return names.length ? `Atak: ${names.join(', ')}` : 'Bez ataku';
    }
    case 'declare_blockers': {
      const parts = Object.entries(cmd.assignments ?? {})
        .map(([blocker, targets]) => `${nameOfObjectId(blocker)} ← ${targets.map((id) => nameOfObjectId(id)).join(' i ')}`);
      return parts.length ? `Blok: ${parts.join('; ')}` : 'Bez bloków';
    }
    case 'resolve_combat': return 'Rozstrzygnij obrażenia w walce';
    case 'resolve_backup': {
      const source = view.pendingBackup?.sourceCardId ? session.nameOf(view.pendingBackup.sourceCardId) : 'Backup';
      const target = nameOfObjectId(cmd.targetId);
      const isSelf = cmd.targetId === view.pendingBackup?.sourceId;
      const counters = view.pendingBackup?.counters ?? 0;
      return isSelf
        ? `Backup: ${source} dostaje ${counters}× +1/+1 (sam siebie)`
        : `Backup: ${target} dostaje ${counters}× +1/+1 (źródło: ${source})`;
    }
    case 'resolve_scry': {
      const looked = view.pendingScry?.cards ?? [];
      const bottoms = (cmd.bottomIds ?? []).map((id) => looked.find((card) => card.id === id)).filter(Boolean);
      if (bottoms.length === 0) {
        return looked.length === 1
          ? `Scry: zostaw ${session.nameOf(looked[0].cardId)} na wierzchu biblioteki`
          : 'Scry: zostaw wszystko na wierzchu biblioteki';
      }
      return `Scry: ${bottoms.map((card) => session.nameOf(card.cardId)).join(', ')} na spód biblioteki`;
    }
    case 'resolve_surveil': {
      const looked = view.pendingSurveil?.cards ?? [];
      const milled = (cmd.millIds ?? []).map((id) => looked.find((card) => card.id === id)).filter(Boolean);
      const order = (cmd.topOrder ?? []).map((id) => looked.find((card) => card.id === id)).filter(Boolean);
      const millText = milled.length
        ? `${milled.map((card) => session.nameOf(card.cardId)).join(', ')} do grobu`
        : 'nic do grobu';
      const orderText = order.length ? `; wierzch: ${order.map((card) => session.nameOf(card.cardId)).join(', ')}` : '';
      return `Surveil: ${millText}${orderText}`;
    }
    case 'resolve_clash_choice': {
      const cardId = view.pendingClash?.cards?.[cmd.playerId] ?? null;
      const what = cardId ? session.nameOf(cardId) : 'odsłoniętą kartę';
      return cmd.putOnBottom
        ? `Clash: ${what} na spód biblioteki`
        : `Clash: ${what} na wierzch biblioteki`;
    }
    case 'resolve_room_target': {
      // Wybór celu pokoju lochu (M24): etykieta pokazuje pokój i kandydata.
      const pending = view.pendingRoomTarget;
      const prefix = pending ? `Pokój ${pending.roomName}: wybierz cel — ` : 'Cel pokoju: ';
      if (pending?.kind === 'player') {
        const name = view.players.find((p) => p.id === cmd.targetId)?.name ?? cmd.targetId;
        return `${prefix}${name}`;
      }
      if (pending?.kind === 'revealed_creature') {
        const card = (pending.cards ?? []).find((c) => c.id === cmd.targetId);
        return `${prefix}${card ? session.nameOf(card.cardId) : cmd.targetId}`;
      }
      return `${prefix}${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_sacrifice_choice': {
      // Grave Exchange: cel poświęca stwora własnego wyboru.
      return `Poświęć: ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_devour_choice': {
      // Devour (Gorger Wurm): sekwencyjne poświęcanie innych własnych stworów.
      if (cmd.done === true) return 'Devour: koniec poświęcania (wejście bez liczników)';
      return `Devour: poświęć ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_exploit_choice': {
      // M163/A (uwaga właściciela): Exploit (Silumgar Butcher) renderował
      // N identycznych „Exploit (wybór poświęcenia)" — bez treści i bez
      // grupowania (case nie istniał). Etykieta nazywa POŚWIĘCANEGO stwora
      // (własnego — jawnego w widoku wybierającego), wzorzec devour.
      if (cmd.skip) return 'Exploit: nie poświęcaj (bez efektu „exploits")';
      return `Exploit: poświęć ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_color_choice': {
      // M163/A: warianty koloru miały identyczne etykiety słownikowe.
      const COLOR_LABELS = { W: 'Biały (W)', U: 'Niebieski (U)', B: 'Czarny (B)', R: 'Czerwony (R)', G: 'Zielony (G)' };
      return `Kolor: ${COLOR_LABELS[cmd.color] ?? cmd.color}`;
    }
    case 'resolve_library_placement': {
      // M177/D (Vanish from Sight): dwa warianty właściciela celu.
      return cmd.placement === 'top'
        ? 'Na WIERZCH twojej biblioteki (odzyskasz najbliższym dobraniem)'
        : 'Na SPÓD twojej biblioteki';
    }
    case 'resolve_land_type_choice': {
      // M163/A: warianty typu landa — j.w. (identyczne etykiety).
      const LAND_LABELS = { Plains: 'Równina (Plains)', Island: 'Wyspa (Island)', Swamp: 'Bagna (Swamp)', Mountain: 'Góry (Mountain)', Forest: 'Las (Forest)' };
      return `Typ landa: ${LAND_LABELS[cmd.landType] ?? cmd.landType}`;
    }
    case 'resolve_moonlit_choice': {
      // M163/A: zamiana vs zwykły token — j.w.
      return cmd.replace
        ? 'Moonlit: zamiana — token kopii zaczarowanej karty'
        : 'Moonlit: zwykły token (bez zamiany)';
    }
    case 'resolve_optional_draw': {
      // M163/A: tak/nie dobioru — j.w.
      return cmd.draw ? 'Dobierz kartę (you may)' : 'Nie dobieraj';
    }
    case 'resolve_optional_trigger_choice': {
      // M163/A: tak/nie dobrowolnego efektu — j.w.
      return cmd.fire ? 'Uruchom efekt dobrowolny (you may)' : 'Zrezygnuj z efektu';
    }
    case 'resolve_endure_choice': {
      // Endure (Kin-Tree Nurturer): liczniki na źródle albo token Spirit.
      return cmd.mode === 'token'
        ? 'Endure: stwórz białego tokena Spirit'
        : 'Endure: liczniki +1/+1 na źródle';
    }
    case 'resolve_delirium_target': {
      // Delirium (Fear of Burning Alive): wybór stwora poszkodowanego gracza.
      return `Delirium: obrażenia w ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_mentor_target': {
      // Mentor (CR 702.133): wybrany atakujący o mniejszej sile dostaje licznik.
      return `Mentor: licznik +1/+1 na ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_graveyard_top_choice': {
      // Forever Young: sekwencyjne przenoszenie kart z grobu na wierzch.
      if (cmd.done === true) return 'Koniec przenoszenia na wierzch biblioteki';
      return `Na wierzch biblioteki: ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_amass_choice': {
      return `Amass: wybierz Armię (${(cmd.armyId ? nameOfObjectId(cmd.armyId) : '?')}, +${cmd.amount ?? 1}/+${cmd.amount ?? 1})`;
    }
    case 'resolve_optional_pay_choice': {
      // M101/B (zgłoszenie właściciela): obie opcje miały etykietę „Dobrowolna
      // dopłata" — nazwę TYPU decyzji, identyczną dla pay:true i pay:false —
      // bo ten `case` w ogóle nie istniał i komendy spadały do `default`.
      // Etykieta opisuje teraz SKUTEK opcji, jak przy food/discover/explore.
      const source = cmd.sourceId ? nameOfObjectId(cmd.sourceId) : null;
      const parts = [];
      if (cmd.cost != null && cmd.cost > 0) {
        // Koszt bywa kolorowy (Furious Forebear: payMana 2 + payColors ['W']
        // = {1}{W}) — pipy kolorów wchodzą w miejsce części generycznej.
        const colors = cmd.costColors ?? [];
        const generic = Math.max(0, cmd.cost - colors.length);
        const symbols = `${generic > 0 ? `{${generic}}` : ''}${colors.map((c) => `{${c}}`).join('')}`;
        parts.push(manaCostHtml(symbols || `{${cmd.cost}}`));
      }
      if (cmd.lifeCost != null && cmd.lifeCost > 0) parts.push(`${cmd.lifeCost} życia`);
      const price = parts.join(' + ');
      if (!cmd.pay) return `Nie płać${source ? ` (${source} — efekt nie odpali)` : ' — efekt nie odpali'}`;
      return `Zapłać${price ? ` ${price}` : ''}${source ? ` (${source})` : ''} — efekt odpali`;
    }
    case 'resolve_pay_or_sacrifice': {
      // M101/B: ta sama klasa błędu co wyżej („Zapłata albo poświęcenie" ×2).
      const source = cmd.sourceId ? nameOfObjectId(cmd.sourceId) : null;
      const price = cmd.cost != null && cmd.cost > 0 ? manaCostHtml(`{${cmd.cost}}`) : null;
      if (cmd.pay) return `Zapłać${price ? ` ${price}` : ''}${source ? ` (zachowaj ${source})` : ''}`;
      return `Poświęć${source ? ` ${source}` : ' permanent'} (bez płacenia)`;
    }
    case 'resolve_food_choice': {
      // Insatiable Appetite: poświęć Food za większy buff albo nie.
      return cmd.sacrifice ? 'Poświęć Food (+5/+5)' : 'Bez poświęcenia Food (+3/+3)';
    }
    case 'resolve_discover_choice': {
      // Discover (Geological Appraiser): rzuć znalezioną kartę albo weź do ręki.
      return cmd.castFree ? 'Discover: rzuć bez kosztu many' : 'Discover: weź kartę do ręki';
    }
    case 'resolve_explore_choice': {
      // Explore (Guidestone Compass): wierzch albo grób.
      return cmd.putInGraveyard ? 'Explore: odłóż kartę do grobu' : 'Explore: zostaw kartę na wierzchu';
    }
    case 'resolve_craft_exile': {
      // Craft (Lodestone Needle): wybór artefaktu do wygnania.
      return `Craft: wygnaj ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_hand_creature': {
      // Dragon Arch: połóż wielokolorowego stwora z ręki (albo nic — you may).
      return cmd.targetId ? `Połóż na pole bitwy: ${nameOfObjectId(cmd.targetId)}` : 'Nie kładź stwora (you may)';
    }
    case 'resolve_legend_choice': {
      // Prawo legend (CR 704.5j): wybraną kopię zostawiamy, reszta idzie do grobu.
      return `Prawo legend: zostaw ${nameOfObjectId(cmd.keepId)}, pozostałe kopie do grobu`;
    }
    case 'resolve_mulligan_choice': {
      if (cmd.keep) return 'Mulligan: Zatrzymaj tę rękę (keep — 7 kart)';
      // Mulligan londyński (CR 103.4): dobierz 7, potem odłóż N na spód —
      // finalna ręka to 7−N (wcześniej „nowa ręka 7 kart" wprowadzała w błąd).
      const already = session.state?.mulliganCounts?.[cmd.playerId] ?? 0;
      const next = already + 1;
      const left = Math.max(0, 7 - next);
      const plural = polishPluralCount(next, 'kartę', 'karty', 'kart');
      return `Mulligan: Weź mulligana — dobierz 7 kart i odłóż ${next} ${plural} na spód (zostanie ${left})`;
    }
    case 'resolve_search_choice': {
      // Szukanie w bibliotece: PlayerView chowa cardId kart biblioteki (FoW),
      // więc nameOfObjectId dawało „?". Pełny stan sesji zna nazwę.
      if (cmd.found == null) return 'Szukanie — nie znajduj karty (rezygnuję)';
      return `Szukanie: ${escapeHtml(session.nameOfObject(cmd.found))}`;
    }
    case 'resolve_springbloom': {
      // M102/U3: bez tej gałęzi wszystkie warianty spadały do `default`
      // i dostawały nazwę CAŁEJ decyzji („Springbloom Druid (poświęcenie
      // landa)") — cztery identyczne opcje, czyli wybór landa w ciemno.
      if (cmd.skip) return 'Springbloom Druid — nie poświęcaj landa (rezygnuję)';
      return `Poświęć land: ${escapeHtml(session.nameOfObject(cmd.sacrificeLandId))}`;
    }
    case 'resolve_mulligan_bottom_choice': {
      const ids = Array.isArray(cmd.cardIds) ? cmd.cardIds : [];
      if (ids.length === 0) return 'Mulligan — nie odkładaj kart na spód (biblioteka pusta)';
      const names = ids.map((id) => nameOfObjectId(id)).join(', ');
      const n = ids.length;
      return `Mulligan — odłóż na spód (${n}): ${names}`;
    }
    case 'resolve_suspend_cast': {
      // M151: rzut zawieszonego czaru z celami enumeruje osobną ofertę PER cel
      // (suspendCastOffers), więc etykieta musi pokazać CEL — inaczej gracz
      // widzi N identycznych „Rzuć zawieszone: X (bez kosztu many)\".
      const susTargets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return cmd.cast
        ? `Rzuć zawieszone: ${nameOfObjectId(cmd.cardId)} (bez kosztu many)${susTargets ? ` → cel: ${susTargets}` : ''}`
        : 'Zostaw w wygnaniu (koniec zawieszenia)';
    }
    case 'resolve_rebound_cast': {
      const rebTargets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return cmd.cast
        ? `Rzuć z odbiciem: ${nameOfObjectId(cmd.cardId)} (bez kosztu many)${rebTargets ? ` → cel: ${rebTargets}` : ''}`
        : 'Zostaw w wygnaniu (koniec odbicia)';
    }
    case 'resolve_epic_choice': {
      // Epic Experiment — rzuć wygnany czar bez kosztu albo zakończ.
      if (cmd.done) return 'Epic Experiment: zakończ (reszta kart do grobu)';
      // M163/A (klasa M151/suspend): oferta per legalny zestaw celów — bez
      // celu w etykiecie warianty tej samej karty są nieodróżnialne.
      const epicTargets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return `Epic Experiment: rzuć bez kosztu — ${nameOfObjectId(cmd.cardId)}${epicTargets ? ` → cel: ${epicTargets}` : ''}`;
    }
    case 'resolve_look_top_choice': {
      // Gurmag Drowner — wybierz kartę z wierzchu do ręki.
      return `Weź do ręki: ${nameOfObjectId(cmd.cardId)}`;
    }
    case 'resolve_hand_top_choice': {
      // M162/C (uwaga właściciela): Chittering Rats u bota otwierał modal
      // „Karta z ręki na wierzch (1 z 5)…" — ten case w ogóle nie istniał,
      // więc etykieta spadała do słownikowej i choice-request numerował
      // identyczne wpisy. Ręka WYBIERAJĄCEGO jest dla niego jawna (FoW),
      // więc etykieta nazywa KARTĘ (wzorzec resolve_graveyard_top_choice).
      return `Karta z ręki na wierzch biblioteki: ${nameOfObjectId(cmd.cardId)}`;
    }
    case 'resolve_damage_division': {
      // M166/D (Inferno Titan): kwoty podziału — etykieta nazywa KAŻDY cel
      // z kwotą (kolejność = targetIds z pendingu w widoku właściciela).
      const pending = view?.pendingDamageDivision;
      const targetIds = pending?.targetIds ?? [];
      const parts = (cmd.amounts ?? []).map((amount, index) => {
        const targetId = targetIds[index] ?? null;
        return targetId == null ? `${amount}` : `${nameOfObjectId(targetId)}: ${amount}`;
      });
      return parts.length > 0 ? `Podziel obrażenia — ${parts.join(', ')}` : 'Podział obrażeń';
    }
    case 'resolve_grave_free_cast': {
      // M174/E: oferta nazywa kartę, koszt X i cele — inaczej N wpisów
      // wygląda identycznie (L29).
      if (cmd.decline || cmd.objectId == null) return 'Zrezygnuj (nie płać {X})';
      const gfcTargets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return `Rzuć z grobu za {${cmd.xValue ?? '?'}}: ${cmd.cardId ? escapeHtml(session.nameOf(cmd.cardId)) : nameOfObjectId(cmd.objectId)}${gfcTargets ? ` → cel: ${gfcTargets}` : ''}`;
    }
    case 'resolve_madness_cast': {
      // M159/F4 (audyt PR #66): oferta niesie objectId (karta w exile —
      // strefa publiczna) i cardId; etykieta ma NAZYWAĆ kartę, nie „?".
      // M161/O1: instant/sorcery z madness enumeruje ofertę PER cel (jak
      // suspend, M151) — etykieta nazywa cel, inaczej N wpisów wygląda
      // identycznie.
      const madTargets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return cmd.cast
        ? `Rzuć za koszt madness: ${nameOfObjectId(cmd.objectId ?? cmd.cardId)}${madTargets ? ` → cel: ${madTargets}` : ''}`
        : `Przełóż do cmentarza (rezygnacja z madness): ${nameOfObjectId(cmd.objectId ?? cmd.cardId)}`;
    }
    case 'resolve_reveal_choice': {
      if (cmd.cardId == null) return 'Nie ujawniaj (bez obrażeń)';
      return `Ujawnij z ręki: ${nameOfObjectId(cmd.cardId)} — obrażenia przeciwnika`;
    }
    case 'resolve_satyr_look_choice': {
      // Satyr Wayfinder — wybierz ląd z odsłoniętych do ręki albo zrezygnuj.
      if (cmd.pickId == null) return 'Nie bierz lądu (reszta do grobu)';
      // M152 (audyt żywym testerem): karty odsłoniętej biblioteki są w
      // PlayerView ukryte (hidden:true, bez cardId) — nameOfObjectId zwracał
      // „?". Satyr Wayfinder odsłania WŁASNE karty (gracz je zna), więc nazwę
      // bierzemy z pełnego stanu sesji (jak resolve_reveal_exile_hand /
      // resolve_discard_choice).
      const visible = obj(cmd.pickId);
      if (!visible?.cardId && session?.nameOfObject) {
        return `Weź ląd do ręki: ${escapeHtml(session.nameOfObject(cmd.pickId))}`;
      }
      return `Weź ląd do ręki: ${nameOfObjectId(cmd.pickId)}`;
    }
    case 'resolve_discard_choice': {
      // M109 (Nightsnare): „You may choose" — rezygnacja z wyboru.
      if (cmd.cardId == null) return 'Nie wskazuj karty (przeciwnik odrzuci dwie wedle wyboru)';
      // M109: karta z ODSŁONIĘTEJ ręki przeciwnika jest w PlayerView ukryta
      // (FoW), więc nazwę bierzemy z pełnego stanu sesji — jak przy
      // resolve_reveal_exile_hand (Dreams of Steel and Oil).
      if (!obj(cmd.cardId)?.cardId && session?.nameOfObject) {
        return `Odrzuć: ${escapeHtml(session.nameOfObject(cmd.cardId))}`;
      }
      // Uwaga D (2026-08-11): wybór KARTY do odrzucenia (koszt, efekt lub
      // limit ręki w cleanup). Wcześniej brak case'a — modal pokazywał
      // „Odrzucenie karty" powtórzone dla każdej opcji, bez nazw kart.
      return `Odrzuć: ${nameOfObjectId(cmd.cardId)}`;
    }
    case 'resolve_reveal_order': {
      // Stomping Slabs — ułóż odsłonięte karty na spodzie biblioteki.
      // M89: odsłonięte karty identyfikujemy po revealedNames (cardIds) —
      // UI pokazuje nazwy kart, nie objectIds. pendingRevealOrder.cardIds
      // to nadal objectIds (spójne z resztą engine i testami), ale UI/label
      // czyta revealedNames (stałe identyfikatory kart).
      const order = cmd.order ?? [];
      const pendingReveal = view?.pendingRevealOrder;
      const revealed = pendingReveal?.revealedNames ?? [];
      // order to objectIds; mapujemy na nazwy po indeksie (objectIds[i] ↔ revealedNames[i]).
      const objectIdToName = new Map();
      for (let i = 0; i < (pendingReveal?.cardIds?.length ?? 0); i += 1) {
        objectIdToName.set(pendingReveal.cardIds[i], revealed[i]);
      }
      const namesList = order.map((oid) => session.nameOf(objectIdToName.get(oid))).join(', ');
      return `Stomping Slabs: ułóż na spodzie (${namesList || 'karty'})`;
    }
    case 'resolve_proliferate': {
      // Proliferate (Courage in Crisis) — wybór dowolnej liczby celów.
      const ids = Array.isArray(cmd.targetIds) ? cmd.targetIds : [];
      if (ids.length === 0) return 'Proliferate: bez celów (nic nie dostaje liczników)';
      const names = ids.map((id) => nameOfObjectId(id)).join(', ');
      return `Proliferate: ${names}`;
    }
    case 'resolve_damage_target': {
      // Stomping Slabs — obrażenia 7 do wybranego celu.
      return `Stomping Slabs: 7 obrażeń w ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_modal_choice': {
      // Modalny trigger upkeep (Etherwrought Page) — wybór trybu.
      // Uwaga C (2026-08-10): etykieta nazywa kartę wywołującą.
      const pending = view.pendingModalTrigger;
      const mode = pending?.modes?.[cmd.modeIndex];
      const source = pending?.cardId ? `${escapeHtml(session.nameOf(pending.cardId))} — ` : '';
      const targetPart = cmd.targetId != null ? ` → cel: ${nameOfObjectId(cmd.targetId)}` : '';
      return mode?.name ? `${source}Tryb: ${mode.name}${targetPart}` : `${source}Wybierz tryb ${(cmd.modeIndex ?? 0) + 1}${targetPart}`;
    }
    case 'resolve_trigger_target': {
      const source = view.pendingTriggerTarget?.cardId
        ? `${escapeHtml(session.nameOf(view.pendingTriggerTarget.cardId))} — ` : '';
      const effectType = view.pendingTriggerTarget?.effectType;
      // M157/F4(a): wariant wielocelowy — lista celów w etykiecie.
      if (Array.isArray(cmd.targetIds)) {
        if (cmd.targetIds.length === 0) return `${source}bez celów („up to")`;
        return `${source}cele triggera: ${cmd.targetIds.map((id) => nameOfObjectId(id)).join(' i ')}`;
      }
      if (cmd.targetId == null) {
        if (effectType === 'bounce_permanent') return `${source}nie zwracaj niczego (odmowa)`;
        return `${source}bez celu (odmowa — „up to one"/„you may")`;
      }
      const target = nameOfObjectId(cmd.targetId);
      if (effectType === 'bounce_permanent') return `${source}zwróć do ręki: ${target}`;
      if (effectType === 'cant_be_blocked') return `${source}nieblokowalność: ${target}`;
      return `${source}cel triggera: ${target}`;
    }
    case 'resolve_redirect_choice': {
      // Willbender — zmiana celu czaru na stosie.
      const pending = view.pendingRedirectChoice;
      const what = pending?.spellCardId ? session.nameOf(pending.spellCardId) : 'czaru';
      return `Willbender: zmień cel ${what} na ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_reveal_exile_hand': {
      // Dreams of Steel and Oil — wybór karty z ręki do wygnania. Nazwa po
      // session.nameOfObject (pełny stan), NIE nameOfObjectId: PlayerView
      // chowa cardId odsłoniętej karty ręki (FoW) i „?" (audyt diamentowy).
      if (cmd.cardId == null) return 'Dreams of Steel and Oil — brak karty w ręce (pomijam)';
      return `Dreams of Steel and Oil — wygnaj z ręki: ${session.nameOfObject(cmd.cardId)}`;
    }
    case 'resolve_reveal_exile_grave': {
      if (cmd.cardId == null) return 'Dreams of Steel and Oil — brak karty w grobie (pomijam)';
      return `Dreams of Steel and Oil — wygnaj z grobu: ${session.nameOfObject(cmd.cardId)}`;
    }
    case 'resolve_enter_as_copy': {
      if (cmd.targetId == null) return 'Wejdź jako 0/0 (bez kopii)';
      return `Kopiuj: ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_destroy_equipment_choice':
      return cmd.destroy ? 'Zniszcz equipment' : 'Zostaw equipment';
    case 'resolve_opponent_target': {
      // Cuombajj Witches: to TY wskazujesz cel obrażeń przeciwnika.
      return `Wskaż cel obrażeń: ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_copy_targets': {
      // Storm (CR 702.40a): „You may choose new targets for the copies."
      return `Kopia czaru — cel: ${nameOfObjectId(cmd.targetId)}`;
    }
    case 'resolve_fertile_thicket': {
      if (cmd.skip) return 'Fertile Thicket — odłóż wszystko na spód (bez landa)';
      const landName = cmd.chosenCardId
        ? escapeHtml(session.nameOfObject(cmd.chosenCardId))
        : 'basic land';
      return `Fertile Thicket — ${landName} na wierzch biblioteki`;
    }
    default: return REASONING_ACTION_LABELS[cmd.type] ?? cmd.type;
  }
}

// --- Pomocnicze budowanie DOM (bez innerHTML, bez classList) -----------

function div(parent, className, text) {
  const el = document.createElement('div');
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);
  if (parent) parent.appendChild(el);
  return el;
}

function clear(el) { if (el) el.textContent = ''; }

/** Klasa koloru ramki/sztuki karty (L = ląd, brak = bezkolorowa). */
function colorKey(colors, kind) {
  if (kind === 'land') return 'L';
  const order = ['W', 'U', 'B', 'R', 'G'];
  for (const c of order) if (colors && colors.includes(c)) return c;
  return '';
}

/** Monogram w polu ilustracji (pierwsza litera nazwy, bez prefiksu „Synthetic\"). */
function glyphFor(name) {
  const base = (name || '').replace(/^Synthetic\s+/i, '').trim();
  return (base.charAt(0) || '•').toUpperCase();
}

function inferKind(object, details) {
  if (object.kind) return object.kind;
  const types = (details && details.types) || [];
  if (types.some((t) => /land/i.test(t))) return 'land';
  if (types.some((t) => /creature/i.test(t))) return 'creature';
  return 'spell';
}

function typeLine(info) {
  const types = info.types || [];
  const subtypes = info.subtypes || [];
  const base = types.length ? types.join(' ') : (info.kind === 'land' ? 'Land' : info.kind === 'creature' ? 'Creature' : 'Spell');
  return subtypes.length ? `${base} — ${subtypes.join(' ')}` : base;
}

/** Normalizuje dane karty z widoku (obiekt gry) i registry w jeden kształt. */
/**
 * M112 (ADR 0017): rola kafla w WALCE liczona z sekcji `view.combat`
 * (informacja publiczna — CR 508/509). Zwraca gotową etykietę badge'a albo
 * null poza walką. Bez tego gracz widział tylko tapnięcie i musiał zgadywać,
 * kto kogo blokuje.
 */
function combatRoleOf(object, combat, session) {
  if (!combat || !object?.id) return null;
  const nameOf = (id) => session?.nameOfObject?.(id) ?? id;
  const blockers = combat.blockers ?? {};
  if ((combat.attackers ?? []).includes(object.id)) {
    const mine = blockers[object.id] ?? [];
    if (mine.length > 0) return `atakuje — blokują: ${mine.map(nameOf).join(', ')}`;
    if ((combat.blockedAttackers ?? []).includes(object.id)) return 'atakuje — zablokowany';
    return 'atakuje — niezablokowany';
  }
  const blocking = Object.entries(blockers)
    .filter(([, ids]) => (ids ?? []).includes(object.id))
    .map(([attackerId]) => nameOf(attackerId));
  if (blocking.length > 0) return `blokuje: ${blocking.join(', ')}`;
  return null;
}

// M175/A3: eksport dla testów pełnej ścieżki badge (m168 testował TYLKO
// buildStateOverlay z ręcznie zbudowanym `info` i przeoczył martwą różnicę).
export function cardInfo(session, object, combat = null) {
  const cardId = object.cardId;
  const faceDown = Boolean(object.faceDown);
  // M100/E12 (pytanie właściciela): WŁASNY zakryty permanent pokazuje
  // NAZWĘ (kontroler zna tożsamość — CR 708.6), ale wyłącznie nazwę:
  // reszta (tekst, staty blueprintu, art) zostaje zamaskowana, żeby kafel
  // nie wyglądał jak pełny stwór — jest „zakryty (morph)", 2/2.
  const ownFaceDown = faceDown && object.controllerId === HUMAN_ID;
  const details = faceDown ? {} : (session.cardDetails(cardId) || {});
  const colors = faceDown ? [] : (session.colorsOf(cardId) || details.colors || []);
  const kind = inferKind(object, details);
  // Załączona aura to na polu bitwy „Enchantment — Aura", a nie stwór;
  // załączony equipment pozostaje „Artifact — Equipment".
  const attachedAura = Boolean(object.attachedTo) && (object.kind === 'aura' || object.bestow || object.aura);
  const attachedEquipment = Boolean(object.attachedTo) && !attachedAura;
  const keywordsNow = faceDown ? [] : (object.keywords?.length ? object.keywords : (details.keywords || []));
  return {
    objectId: object.id,
    cardId: faceDown ? null : cardId,
    isToken: Boolean(cardId && cardId.startsWith('token_')),
    // Face-down permanent (morph/megamorph): 2/2 bez nazwy, kolorów i kosztu
    // — własny z nazwą i znacznikiem (E12), wrogi bezimienny (FoW, CR 708.2).
    name: faceDown
      ? (ownFaceDown ? session.nameOf(object.cardId) : 'Face-down creature')
      // M172/D: kafel kopii pokazuje „Nazwa (kopia N)" — rozróżnialna od oryginału.
      : (object.name ? (object.copyNumber ? `${object.name} (kopia ${object.copyNumber})` : object.name) : session.nameOf(cardId)),
    // M127 (uwaga A): znacznik z jednego źródła — „zakryty (Morph)" dla
    // własnego permanentu, sama nazwa mechaniki dla cudzego (FoW).
    morphBadge: faceDown ? (ownFaceDown ? `zakryty (${FACE_DOWN_LABEL})` : FACE_DOWN_LABEL) : null,
    colors,
    kind,
    // M138/Z6 (audyt Żywym Testerem): typy bierzemy ze STANU GRY, nie z rejestru
    // karty. Warmaker Gunship z 6 licznikami charge (próg 6+) jest artefaktowym
    // stworem 4/3 z lataniem — engine to wie (`object.types` = Artifact+Creature,
    // `kind='creature'`), ale kafel czytał statyczne `details.types` i pokazywał
    // dalej sam „Artifact — Spacecraft”, bez P/T i bez Latania. Gracz nie miał
    // jak zauważyć, że wrogi statek stał się atakującym. P/T obok czytano już
    // z obiektu — to była niespójność w jednym obiekcie danych.
    types: faceDown ? ['Creature'] : (attachedAura ? ['Enchantment', 'Aura'] : (object.types?.length ? object.types : (details.types || []))),
    subtypes: faceDown ? [] : (attachedAura ? [] : (object.subtypes?.length ? object.subtypes : (details.subtypes || []))),
    attachedAura,
    attachedEquipment,
    keywords: keywordsNow,
    // M168/B (uwaga właściciela): AKTYWNE zmiany na kafelu jako badge'e.
    // M175/A3: nadane keywordy jedzie JAWNIE z playerView (`grantedKeywords`
    // = efektywne − wydrukowane ze stanu) — stara różnica „effectiveKeywordsOf
    // − keywordsNow" była zawsze pusta, bo widok wysyła keywordy EFEKTYWNE
    // (obie strony zawierały grant) i badge nigdy się nie pokazywał.
    grantedKeywords: faceDown ? [] : [...(object.grantedKeywords ?? [])],
    lostKeywordsUntilEOT: faceDown ? [] : [...(object.lostKeywordsUntilEOT ?? [])],
    cantBlockNow: Boolean(object.cantBlock),
    cantBeBlockedNow: Boolean(object.cantBeBlocked),
    // M173/C: czasowe stany z widoku (saddle/untap-lock/kontrola/regeneracja).
    saddledNow: Boolean(object.saddled),
    untapLockedNow: Boolean(object.untapLocked || object.dontUntapNextUntapStep),
    tempControlNow: Boolean(object.tempControlUntilEOT),
    cantRegenerateNow: Boolean(object.cantBeRegeneratedThisTurn),
    manaCost: faceDown ? null : (details.manaCost ?? object.manaCost ?? null),
    power: object.power ?? details.power,
    toughness: object.toughness ?? details.toughness,
    livePower: object.power ?? details.power,
    liveToughness: object.toughness ?? details.toughness,
    powerMod: object.powerModifier,
    toughMod: object.toughnessModifier,
    tapped: Boolean(object.tapped),
    // M100/E14 (zgłoszenie B właściciela): badge choroby opisuje OGRANICZENIE
    // — stwór z haste choroby nie odczuwa (CR 302.6 + 702.10), a badge na
    // reanimowanym stworze z Puppeteer Clique („mogła atakować, choć badge
    // mówił choroba") to dezinformacja. Keywordy w widoku są EFEKTYWNE
    // (playerView liczy effectiveKeywords — z grantami i załącznikami).
    summoningSickness: Boolean(object.summoningSickness) && !keywordsNow.includes('haste'),
    goaded: Boolean(object.goaded),
    detained: Boolean(object.detained),
    damage: object.damage || 0,
    // A (2026-08-11): liczniki (np. +1/+1, oil, charge, lore) pokazane na karcie.
    counters: object.counters ?? {},
    spell: details.spell || object.spell,
    abilities: faceDown ? [] : (details.abilities || []),
    morph: details.morph || null,
    plot: details.plot || null,
    equipment: faceDown ? null : (details.equipment || object.equipment || null),
    aura: faceDown ? null : (details.aura || object.aura || null),
    // M159/Z4: rozdziały Sagi są treścią kafla (rulesText) — bez tego pola
    // Saga renderowała się bez żadnego opisu.
    saga: faceDown ? null : (details.saga || object.saga || null),
    attachedTo: object.attachedTo ?? null,
    hostName: object.attachedTo ? (session.nameOfObject?.(object.attachedTo) ?? '') : '',
    // F (2026-08-11): karta-gospodarz pokazuje przypięte do niej aury/equipmenty
    // („zaczarowana: Moonlit Meditation", „wyposażona: …"). Scan pola bitwy w widoku.
    attachments: object.zone === 'battlefield' && object.id
      ? (session.view()?.zones?.battlefield ?? []).filter((o) => o.attachedTo === object.id && o.id !== object.id)
          .map((o) => ({ name: o.cardId ? (session.nameOf(o.cardId) || o.cardId) : o.cardId, kind: (o.aura || o.bestow) ? 'aura' : 'equip' }))
      : [],
    faceDown,
    // M112: znacznik walki („atakuje — niezablokowany", „blokuje: X").
    combatRole: combatRoleOf(object, combat, session),
    isBattlefield: object.zone === 'battlefield',
    // Dane potrzebne wyłącznie do ilustracji. `cardId` obiektu zmienia się przy
    // transformacji (DFC), więc `imageUri` sam z siebie wskazuje właściwą stronę.
    set: faceDown ? null : (details.set ?? null),
    imageUri: faceDown ? null : (details.imageUri ?? null),
    artId: faceDown ? null : (details.artId ?? null),
  };
}

/** Podzbiór pól karty, którym adresuje się ilustrację (moduł card-images). */
function artOf(info) {
  return {
    name: info.name, set: info.set ?? null, imageUri: info.imageUri ?? null,
    artId: info.artId ?? null, faceDown: Boolean(info.faceDown),
  };
}

/**
 * Ładowanie obrazu z listą kandydatów i fallbackiem.
 *
 * Kontrakt: `fallbackEl` (syntetyczna twarz) jest w DOM od początku i pozostaje
 * widoczny, dopóki obraz się nie wczyta. Dzięki temu (a) użytkownik nigdy nie
 * patrzy na pustą ramkę, (b) headless mini-DOM w testach — gdzie `load` nigdy
 * nie pada — widzi dokładnie to, co przed zmianą, (c) błąd sieci/404 to zwykły
 * powrót do twarzy, bez pustych kafli.
 */
function attachImageWithFallback(img, candidates, fallbackEl, onLoad) {
  let index = 0;
  const tryNext = () => {
    if (index >= candidates.length) {
      // Wszystkie adresy przepadły — zostaje syntetyczna twarz.
      img.style.display = 'none';
      img.className = String(img.className || '').replace(/\s*is-loading/, '');
      if (fallbackEl) fallbackEl.style.display = '';
      return;
    }
    img.src = candidates[index];
    index += 1;
  };
  img.addEventListener('error', tryNext);
  img.addEventListener('load', () => {
    img.className = String(img.className || '').replace(/\s*is-loading/, '');
    img.style.display = '';
    if (fallbackEl) fallbackEl.style.display = 'none';
    if (onLoad) onLoad();
  });
  // Obraz NIE może startować z `display: none`: przeglądarka nie pobiera
  // obrazów ukrytych tą własnością (a przy `loading="lazy"` nie pobiera ich
  // nigdy), więc zdarzenie `load` nigdy nie padało i kafel realnej karty
  // zostawał na zawsze przy syntetycznej twarzy. Zamiast ukrywać, obraz jest
  // w DOM przezroczysty (klasa `is-loading`) i leży WARSTWĄ na twarzy —
  // twarz widać do czasu wczytania, potem znika (patrz CSS `.card-img`).
  img.className = `${img.className || ''} is-loading`.trim();
  tryNext();
  return img;
}

/**
 * Wizualna reprezentacja karty: ilustracja druku, a pod spodem (fallback)
 * syntetyczna twarz. Zwraca kontener, żeby wołający mógł dopiąć nakładki stanu.
 */
function buildCardVisual(parent, info, { size = '', zoom = false, skipLiveState = false, textless = false } = {}) {
  const sizeClass = size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : '';
  const visual = div(parent, `cardvis${sizeClass}`);
  const face = buildFace(visual, info, { size, skipLiveState, textless });
  const art = artOf(info);
  const candidates = zoom ? hoverImageSources(art, { hoverMode: 'scryfall' }) : tileImageSources(art);
  if (!candidates.length) return visual;
  const img = document.createElement('img');
  img.className = 'card-img';
  img.alt = info.faceDown ? 'Karta zakryta' : info.name;
  // Lazy-load: kart na stole i w rękach bywa kilkadziesiąt, a Scryfall jest
  // zdalny — przeglądarka pobiera dopiero to, co realnie widać.
  img.loading = 'lazy';
  img.decoding = 'async';
  visual.appendChild(img);
  attachImageWithFallback(img, candidates, face, () => { visual.className = `cardvis${sizeClass} has-img`; });
  return visual;
}

/** Buduje syntetyczną „twarz\" karty (kolorowa ramka, koszt, typ, P/T). */
function buildFace(parent, info, { size = '', skipLiveState = false, textless = false } = {}) {
  const sizeClass = size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : '';
  const face = div(parent, `face c-${colorKey(info.colors, info.kind)}${info.isToken ? ' token' : ''}${sizeClass}`);
  if (textless) {
    // Miniaturka w modalu ruchu bota: bez nazwy/typu/reguł — te są w linii opisu.
    const fart = div(face, 'fart');
    div(fart, 'fglyph', info.faceDown ? '?' : glyphFor(info.name));
    return face;
  }
  // Góra: nazwa + koszt
  const ftop = div(face, 'ftop');
  div(ftop, 'fname', info.name);
  if (info.manaCost != null && info.kind !== 'land') div(ftop, 'fcost', String(info.manaCost));
  // Ilustracja (syntetyczny gradient + monogram)
  const fart = div(face, 'fart');
  div(fart, 'fglyph', info.faceDown ? '?' : glyphFor(info.name));
  // Linia typu
  div(face, 'ftype', typeLine(info));
  // Pole reguł
  div(face, 'fbox', rulesText(info));
  // Znaczniki stanu (tylko pole bitwy). Na kaflu stołu żywy stan jest na
  // nakładce (skipLiveState) — inaczej textContent dubluje P/T i „zaczarowana:”.
  if (info.isBattlefield && !skipLiveState) {
    const flags = [];
    if (info.attachedAura || info.attachedEquipment) {
      const hostId = info.attachedTo;
      let hostName = '';
      if (hostId) {
        // Look up host name from the card info's hostName (set by tileInfo)
        hostName = info.hostName || '';
      }
      const label = info.attachedAura ? 'aura' : 'wyposaża';
      flags.push(hostName ? `${label} → ${hostName}` : label);
    }
    if (info.combatRole) flags.push(info.combatRole);
    if (info.damage > 0) flags.push(`obrażenia ${info.damage}`);
    // M100/E12: kafel zakrytego permanentu niesie znacznik morpha — własny
    // ma nazwę + „zakryty (morph)", wrogi „Face-down creature" + „morph".
    if (info.faceDown) flags.push(info.morphBadge ?? FACE_DOWN_LABEL);
    // M73d (J): choroba przywołania dotyczy tylko stworów (CR 302.6) —
    // artefakty/enchantmenty nie dostają badge (audyt żywym testerem).
    if (info.summoningSickness && (info.kind === 'creature' || (info.types ?? []).includes('Creature'))) flags.push('choroba');
    // F (2026-08-11): karta-gospodarz pokazuje przypięte do niej aury/equipmenty.
    for (const att of info.attachments ?? []) {
      flags.push(att.kind === 'aura' ? `zaczarowana: ${att.name}` : `wyposażona: ${att.name}`);
    }
    // A (2026-08-11): liczniki na karcie (np. „+1/+1 ×2", „oil ×3", „charge ×5").
    for (const [name, count] of Object.entries(info.counters ?? {})) {
      // M165 (korekta właściciela): najpierw ILOŚĆ, potem co — „2x +1/+1"
      // (było „+1/+1 ×2" — wyglądało jak działanie matematyczne).
      if (count > 0) flags.push(`${count}x ${COUNTER_LABELS[name] ?? name}`);
    }
    if (flags.length) {
      const badges = div(face, 'fbadges');
      for (const f of flags) {
        const cls = f.startsWith('obrażenia') ? ' dmg' : (f.includes('×') ? ' counter' : ' sick');
        div(badges, 'fbadge' + cls, f);
      }
    }
  }
  // P/T (stworki) — pomijane na kaflu, gdy nakładka już je pokazuje.
  if (!skipLiveState && info.kind === 'creature' && info.livePower != null && info.liveToughness != null) {
    const buffed = (info.powerMod || info.toughMod) && (Number(info.powerMod) !== 0 || Number(info.toughMod) !== 0);
    const pt = div(face, 'fpt' + (buffed ? ' fmod' : ''), `${info.livePower}/${info.liveToughness}`);
  }
  return face;
}

/**
 * Kafelek karty klikalny i (na desktopie) reagujący na hover.
 * @param {object} opts { session, size, onCardClick, hover, tapped, extraClass }
 */
function tile(parent, info, opts) {
  const wrap = div(parent, `tile${info.tapped ? ' tapped' : ''}${opts.extraClass ? ` ${opts.extraClass}` : ''}`);
  const visual = buildCardVisual(wrap, info, { size: opts.size || '', skipLiveState: true });
  buildStateOverlay(visual, info);
  // Klik / dwuklik / double-tap (M18 + poprawka dotyku 2026-08-03):
  // wspólny kontrakt w gestures.js — na dotyku pojedynczy klik jest odroczony
  // (żeby double-tap wygrał), a syntetyczny click po double-tapie tłumiony.
  // `stateKey` (objectId): renderTableView przebudowuje kafle przy każdym
  // rerenderze, więc stan double-tapa musi przeżyć podmianę węzła między
  // tapnięciami (zgłoszenie 2026-08-06: „double-tap nigdy nie działa").
  installTapGesture(wrap, {
    stateKey: `tile:${info.objectId}`,
    onTap: opts.onCardClick ? () => opts.onCardClick(info.objectId, info.cardId) : null,
    onDoubleTap: opts.onCardDoubleClick ? () => opts.onCardDoubleClick(info.objectId, info.cardId) : null,
  });
  if (opts.hover && opts.hover.start) {
    wrap.addEventListener('mouseenter', (e) => opts.hover.start(info, e));
    wrap.addEventListener('mouseleave', opts.hover.end);
    if (opts.hover.cycle) wrap.addEventListener('wheel', (e) => opts.hover.cycle(info, e));
  }
  return wrap;
}

/**
 * Nakładka stanu gry na ilustracji. Obraz druku pokazuje bazowe P/T i nic nie
 * wie o licznikach, obrażeniach czy chorobie przywołania — te informacje muszą
 * zostać widoczne również wtedy, gdy ilustracja przykryje syntetyczną twarz.
 * Nakładka jest ukryta dopóki obraz się nie wczyta (CSS: `.cardvis.has-img`).
 */
export function buildStateOverlay(visual, info) {
  const flags = [];
  if (info.isBattlefield) {
    // M102/U7: przypięcie aury/equipmentu MUSI być na nakładce. Wcześniejszy
    // komentarz („pokazuje buildFace — tu nie dublujemy") był nieprawdziwy dla
    // kafli stołu: `tile()` i `renderCardInto` wołają buildCardVisual ze
    // `skipLiveState: true`, więc gałąź „wyposaża → <gospodarz>" w buildFace
    // nigdy się tam nie wykonywała. Informacja znikała z OBU ścieżek naraz —
    // gracz widział ekwipunek na stole, ale nie wiedział, kogo wzmacnia.
    // Nazwa gospodarza idzie przez nameOfObject (cardInfo.hostName), więc
    // zakryty gospodarz pozostaje „morphem" (CR 708.2).
    if (info.attachedAura || info.attachedEquipment) {
      const label = info.attachedAura ? 'aura' : 'wyposaża';
      flags.push(['att', info.hostName ? `${label} → ${info.hostName}` : label]);
    }
    // Nadal pokazujemy załączniki GOSPODARZA (info.attachments) niżej.
    // M100/E12: kafel zakrytego permanentu niesie znacznik morpha (własny
    // z nazwą, wrogi jako „morph") — na stole żywy stan jest na nakładce.
    if (info.faceDown) flags.push(['morph', info.morphBadge ?? FACE_DOWN_LABEL]);
    if (info.goaded) flags.push(['goad', 'goad']);
    // M177/E (CR 701.29): detain — nie atakuje, nie blokuje, bez aktywacji.
    if (info.detained) flags.push(['kw', 'zatrzymany (detain)']);
    // M168/B: AKTYWNE zmiany — badge tekstowy, póki efekt działa.
    for (const kw of info.grantedKeywords ?? []) {
      flags.push(['kw', `${KEYWORD_LABELS[kw] ?? kw}`]);
    }
    for (const kw of info.lostKeywordsUntilEOT ?? []) {
      flags.push(['kw', `bez: ${KEYWORD_LABELS[kw] ?? kw}`]);
    }
    if (info.cantBlockNow) flags.push(['kw', 'nie może blokować']);
    if (info.cantBeBlockedNow) flags.push(['kw', 'nie do zablokowania']);
    // M173/C: pozostałe czasowe stany z efektów — audyt na wniosek
    // właściciela (Panic Spellbomb — klasa objęta już przez cantBlockNow).
    if (info.saddledNow) flags.push(['kw', 'osiodłany']);
    if (info.untapLockedNow) flags.push(['kw', 'nie odtapuje się']);
    if (info.tempControlNow) flags.push(['kw', 'kontrola do końca tury']);
    if (info.cantRegenerateNow) flags.push(['kw', 'bez regeneracji']);
    {
      const pMod = Number(info.powerMod ?? 0);
      const tMod = Number(info.toughMod ?? 0);
      if (pMod !== 0 || tMod !== 0) {
        const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
        flags.push(['kw', `${sign(pMod)}/${sign(tMod)}`]);
      }
    }
    if (info.combatRole) flags.push(['combat', info.combatRole]);
    if (info.damage > 0) flags.push(['dmg', `−${info.damage}`]);
    if (info.summoningSickness && (info.kind === 'creature' || (info.types ?? []).includes('Creature'))) flags.push(['sick', 'choroba']);
    // A (2026-08-11): liczniki na nakładce ilustracji.
    // M164: licznik `lore` Sagi pokazujemy WYŁĄCZNIE w badge etapu poniżej
    // (bez dublowania „lore×N" + „Rozdział II (2/3)").
    for (const [name, count] of Object.entries(info.counters ?? {})) {
      if (count > 0 && !(name === 'lore' && info.saga?.chapters?.length)) {
        // M165: najpierw ILOŚĆ — „2x +1/+1" (korekta wizualna właściciela).
        flags.push(['counter', `${count}x ${COUNTER_LABELS[name] ?? name}`]);
      }
    }
    // M164 (pytanie właściciela 2026-08-20): ETAP Sagi jako badge tekstowy —
    // analogia do aur/equipmentów/liczników. Dotąd jedynym znacznikiem postępu
    // był generyczny licznik „lore×N"; badge nazywa AKTYWNY rozdział
    // (licznik lore = numer rozdziału, CR 714.3).
    if (info.saga?.chapters?.length) {
      const total = info.saga.chapters.length;
      const lore = info.counters?.lore ?? 0;
      const roman = SAGA_ROMAN[lore - 1] ?? String(lore);
      flags.push(['saga', lore > 0 ? `Rozdział ${roman} (${lore}/${total})` : `Saga — ${total} rozdz.`]);
    }
    // F (2026-08-11): przypięte aury/equipmenty na nakładce gospodarza.
    for (const att of info.attachments ?? []) {
      // Diament (2026-08-15): spójne z buildFace — „zaczarowana:/wyposażona:"
      // (było angielskie „aura:/equip:" — niespójne z opadem syntetycznym).
      flags.push(['att', att.kind === 'aura' ? `zaczarowana: ${att.name}` : `wyposażona: ${att.name}`]);
    }
  }
  const showPt = info.kind === 'creature' && info.livePower != null && info.liveToughness != null;
  if (!flags.length && !showPt) return null;
  const overlay = div(visual, 'ovl');
  if (flags.length) {
    const badges = div(overlay, 'ovl-badges');
    for (const [kind, text] of flags) div(badges, `ovl-badge ${kind}`, text);
  }
  if (showPt) {
    const buffed = (info.powerMod || info.toughMod) && (Number(info.powerMod) !== 0 || Number(info.toughMod) !== 0);
    div(overlay, `ovl-pt${buffed ? ' mod' : ''}`, `${info.livePower}/${info.liveToughness}`);
  }
  return overlay;
}

export function renderMiniFace(el, session, objectId) {
  clear(el);
  const view = session.view();
  const object = Object.values(view.zones).flat().find((o) => o.id === objectId);
  if (!object) return;
  const info = cardInfo(session, object);
  const visual = buildCardVisual(el, info, { size: 'sm', skipLiveState: true });
  buildStateOverlay(visual, info);
}

/**
 * Zawartość okna hover: ilustracja w wybranym torze, a pod nią (fallback)
 * syntetyczna twarz. Wydzielone z `renderTableView`, żeby dało się testować
 * bez pełnego stołu.
 */
export function renderHoverPreview(host, info, hoverMode = 'scryfall') {
  clear(host);
  const shape = hoverPreviewShape(hoverMode);
  const candidates = hoverImageSources(artOf(info), { hoverMode });
  // M157/A (uwaga właściciela, czwarty raz — usuwamy zaślepkę całkiem):
  // podgląd hover/tap NIE rysuje syntetycznej „niby-karty". Każda karta ma
  // ilustrację (Scryfall; FOT/KON z artId), a pseudo-karta z gradientem
  // i pseudo-tekstem tylko mignęła przed wczytaniem obrazu i psuła UX.
  // M148 zachowane: bez kandydatów (FOT/KON bez artId) podgląd jest PUSTY.
  if (!candidates.length) return host;
  const img = document.createElement('img');
  img.className = 'hover-img';
  img.alt = info.faceDown ? 'Karta zakryta' : info.name;
  img.decoding = 'async';
  img.style.width = `${shape.width}px`;
  img.style.maxHeight = `${shape.height}px`;
  img.style.objectFit = shape.fit;
  host.appendChild(img);
  // M157/A: brak warstwy fallbacku — podgląd pokazuje WYŁĄCZNIE ilustrację.
  attachImageWithFallback(img, candidates, null);
  const art = artOf(info);
  const hasLocal = art.artId != null && art.artId !== '';
  const hint = hasLocal ? ' · scroll zmienia tor' : '';
  div(host, 'hover-mode', `${hoverModeLabel(hoverMode)}${hint}`);
  return host;
}

/**
 * Karta na PEŁNYM EKRANIE — skan ze Scryfalla w maksymalnym rozmiarze
 * (dwuklik na kaflu albo tapnięcie karty bez dostępnych akcji; M18).
 * Fallbackiem pozostaje syntetyczna twarz, jak wszędzie indziej.
 */
export function renderCardFullscreen(host, info, { positionText = null } = {}) {
  clear(host);
  if (!info) return host;
  // M157/A (uwaga właściciela): pełny ekran bez syntetycznej „niby-karty" —
  // wyłącznie skan karty (tożsamość własnej karty zakrytej niesie alt obrazu).
  const candidates = hoverImageSources(artOf(info), { hoverMode: 'scryfall' });
  if (candidates.length) {
    const img = document.createElement('img');
    img.className = 'card-img';
    img.alt = info.faceDown ? 'Karta zakryta' : info.name;
    img.decoding = 'async';
    host.appendChild(img);
    attachImageWithFallback(img, candidates, null);
  }
  // Pozycja w karuzeli strefy („2 / 7") — swipe w lewo/prawo przechodzi po
  // kartach strefy, więc gracz widzi, gdzie jest i ile ich zostało.
  if (positionText) div(host, 'fullscreen-position', positionText);
  div(host, 'fullscreen-hint', 'Dotknij ✕ lub w dowolnym miejscu, żeby zamknąć · przesuń w lewo/prawo, by zmienić kartę');
  return host;
}

/**
 * Treść modala „Rozgrywka" (M18): miniaturki WSZYSTKICH zagranych
 * kart (po jednej na wpis z cardId) z opisem ruchu pod spodem. Bez dużego
 * skanu na górze (decyzja właściciela 2026-08-08: „wszystkie karty jako
 * małe miniaturki powyżej listy akcji") — klik/tap na miniaturkę otwiera
 * pełny ekran karty (callback `onCardClick(cardId)`); tekst ruchu pod
 * miniaturką zostaje no-op, żeby przypadkowe tapnięcie nie zamykało
 * modala.
 *
 * Wznowienie auto-przewijania odbywa się przez komendę gracza
 * `pass_priority`, a NIE przez zamknięcie modala (patrz main.js
 * `closeBotMoveModal`): krzyżyk pauzuje auto-pass i zamyka modal — gracz
 * musi jawnie wykonać pass, żeby bot jechał dalej.
 */
export function renderBotMoves(host, moves, session, { onCardClick = null } = {}) {
  clear(host);
  const list = Array.isArray(moves) ? moves : [];
  if (list.length === 0) {
    div(host, 'zone-empty', 'Nieprzyjaciel nie wykonał żadnego istotnego ruchu.');
    return host;
  }
  const wrap = div(host, 'bot-move-list');
  for (const entry of list) {
    const row = div(wrap, 'bot-move-entry');
    if (entry.cardId && session) {
      const details = session.cardDetails(entry.cardId);
      if (details) {
        const art = div(row, 'bot-move-card');
        // buildCardVisual buduje [img class=card-img] + syntetyczną twarz
        // (fallback) — identycznie jak realne kafle na stole i w ręce.
        buildCardVisual(art, {
          name: details.name, colors: details.colors || [], kind: inferKind({}, details),
          types: details.types || [], subtypes: details.subtypes || [],
          keywords: details.keywords || [], manaCost: details.manaCost ?? null,
          power: details.power, toughness: details.toughness,
          livePower: details.power, liveToughness: details.toughness,
          spell: details.spell, abilities: details.abilities || [],
          morph: details.morph || null, set: details.set ?? null,
          imageUri: details.imageUri ?? null, artId: details.artId ?? null,
        }, { size: 'sm', zoom: true, textless: true });
        if (onCardClick) {
          // Miniaturka otwiera pełny ekran (warstwa card-fullscreen z
          // karuzelą strefy). installTapGesture pokrywa klik i double-tap
          // (desktop + dotyk). stateKey po cardId — rerender modala
          // podmienia węzły, ale tapy muszą przeżyć podmianę.
          const stateKey = `botmove-card:${entry.cardId}:${row.children.length}`;
          installTapGesture(art, {
            stateKey,
            onTap: () => onCardClick(entry.cardId),
            onDoubleTap: () => onCardClick(entry.cardId),
          });
        }
      }
    }
    // Tekst ruchu pod miniaturką (gdy cardId jest) lub zamiast niej
    // (wpisy bez karty — np. „Rozstrzygnięcie walki"). Pusty `bot-move-line`
    // daje klikalną podkładkę pod miniaturką (wypełnia flexbox kolumny).
    div(row, `bot-move-line${entry.cardId ? ' key' : ''}`, `\n${entry.text}`);
  }
  return host;
}

export function renderCardPreview(el, details, { imageMode = IMAGE_MODE.localFirst } = {}) {
  clear(el);
  if (!details) {
    div(el, 'zone-empty', 'Dotknij karty, żeby zobaczyć jej pełny opis.');
    return;
  }
  const info = {
    cardId: details.id,
    name: details.name,
    colors: details.colors || [],
    kind: inferKind({}, details),
    types: details.types || [],
    subtypes: details.subtypes || [],
    keywords: details.keywords || [],
    manaCost: details.manaCost ?? null,
    power: details.power,
    toughness: details.toughness,
    livePower: details.power,
    liveToughness: details.toughness,
    spell: details.spell,
    abilities: details.abilities || [],
    morph: details.morph || null,
    plot: details.plot || null,
    saga: details.saga || null, // M159/Z4: rozdziały Sagi w podglądzie karty
    set: details.set ?? null,
    imageUri: details.imageUri ?? null,
    artId: details.artId ?? null,
    isPreview: true,
  };
  // Duży wizerunek: ta sama ilustracja co na kaflu (rozmiar `large`),
  // z syntetyczną twarzą jako fallbackiem.
  const faceWrap = div(el, 'preview-face-wrap');
  buildCardVisual(faceWrap, info, { size: 'lg', zoom: true });

  const infoCol = div(el, 'preview-info');
  div(infoCol, 'preview-name', details.name);
  div(infoCol, 'preview-line', `${(details.types || []).join(' ')} · zestaw ${details.set} · kolory: ${(details.colors || []).join(', ') || 'brak'}`);
  if (details.manaCost != null) div(infoCol, 'preview-line', `Koszt many: ${details.manaCost}`);
  if (details.power != null) div(infoCol, 'preview-stats', `Siła/Wytrzymałość: ${details.power}/${details.toughness}`);
  const boxText = rulesText(info);
  if (boxText) div(infoCol, 'preview-box', boxText);
  if (details.plan) div(infoCol, 'preview-line', `Plan: ${details.plan}`);
  div(infoCol, 'preview-line', 'Ilustracja (Scryfall, gdy dostępna):');

  const candidates = cardImageSources(details, { mode: imageMode });
  const img = document.createElement('img');
  img.className = 'preview-img';
  img.alt = details.name;
  let candidateIndex = 0;
  const tryNextCandidate = () => {
    if (candidateIndex >= candidates.length) { img.style.display = 'none'; return; }
    img.src = candidates[candidateIndex];
    candidateIndex += 1;
  };
  img.addEventListener('error', tryNextCandidate);
  tryNextCandidate();
  infoCol.appendChild(img);
}

/**
 * Przerysowuje cały stół z aktualnego widoku sesji (M7).
 * @param {{ els: object, session: object, play: (cmd: object) => void,
 *   onCardClick: (objectId: string, cardId: string) => void,
 *   onStackClick?: (objectId: string, cardId: string) => void }} args
 */
export function renderTableView({ els, session, play, onCardClick, onChoiceRequest = null, onCardDoubleClick = null, onStackClick = null, hoverMode = 'scryfall', onHoverModeChange = null, onUndercityClick = null, onDayNightClick = null, onPoisonCardClick = null, ignoredOptionKeys = null, onToggleIgnoredOption = null }) {
  const view = session.view();
  // Czyścimy tylko strefy, które przebudowujemy (hover sterujemy osobno).
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) clear(els[key]);

  // Hover (desktop): powiększona karta pod kursorem — ta sama ilustracja co na
  // kaflu, w rozmiarze `large`, a przy jej braku syntetyczna twarz. Scroll nad
  // kartą przełącza tor podglądu (scryfall → FOT → KON), jak w legacy HTML.
  // Na dotyku (iPad/iPhone) hover pozostaje wyłączony — tapnięcie otwiera
  // wyłącznie menu kontekstowe (M7c).
  let currentHoverMode = hoverMode;
  const hover = TOUCH_DEVICE ? null : {
    start: (info, e) => {
      if (!els.hoverPreview) return;
      clear(els.hoverPreview);
      renderHoverPreview(els.hoverPreview, info, currentHoverMode);
      const shape = hoverPreviewShape(currentHoverMode);
      const x = (e && typeof e.clientX === 'number') ? e.clientX : 0;
      const y = (e && typeof e.clientY === 'number') ? e.clientY : 0;
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 0;
      const vh = (typeof window !== 'undefined' && window.innerHeight) || 0;
      // Pozycjonowanie jak w legacy: obok kursora, z odbiciem przy krawędzi.
      const left = (vw && x + 15 + shape.width > vw) ? x - 15 - shape.width : x + 15;
      const top = (vh && y + 15 + shape.height > vh) ? y - 15 - shape.height : y + 15;
      els.hoverPreview.style.left = `${Math.max(0, left)}px`;
      els.hoverPreview.style.top = `${Math.max(0, top)}px`;
      els.hoverPreview.className = 'hover-preview active';
    },
    end: () => { if (els.hoverPreview) els.hoverPreview.className = 'hover-preview'; },
    cycle: (info, e) => {
      if (!els.hoverPreview) return;
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      // M146: tryby FOT/KON przełączają się globalnie niezależnie od karty;
      // dla kart bez artId hover w tych trybach jest po prostu pusty
      // (brak obrazka — patrz hoverImageSources).
      currentHoverMode = nextHoverMode(currentHoverMode, (e && e.deltaY < 0) ? -1 : 1, HOVER_MODES);
      if (onHoverModeChange) onHoverModeChange(currentHoverMode);
      hover.start(info, e);
    },
  };

  // --- Baner końca gry -------------------------------------------------
  if (view.status !== 'active') {
    const winner = view.players.find((p) => p.id === view.winnerId);
    // CR 104.4b: remis nie ma zwycięzcy — bez tego baner pokazywał „wygrywa: ?".
    // M172/A: informacja „kto wygrał" używa nazw panelu (Gracz/Bot) —
    // „wygrywa: Ty" to zła odmiana (decyzja właściciela).
    const winnerLabel = winner?.name === 'Ty' ? 'Gracz' : winner?.name === 'Nieprzyjaciel' ? 'Bot' : (winner?.name ?? '?');
    const outcome = view.isDraw ? 'REMIS (obaj gracze przegrali jednocześnie)' : `wygrywa: ${winnerLabel}`;
    div(els.banner, 'gameover', `Koniec gry — ${outcome} (seed ${session.state.seed})`);
  }

  // --- Pasek statusu ---------------------------------------------------
  const me = view.players.find((p) => p.id === view.playerId);
  const foe = view.players.find((p) => p.id !== view.playerId);
  const active = view.players.find((p) => p.id === view.turn.activePlayerId);
  div(els.status, 'status-turn', view.status === 'active'
    ? `Tura ${view.turn.number} · ${active?.name} · ${stepLabel(view.turn)}`
    : `Partia zakończona po ${view.turn.number} turach`);
  const foeHand = view.zones.hand.filter((o) => o.hidden).length;
  const ownHand = view.zones.hand.length - foeHand;
  const ownLibrary = view.zones.library.filter((o) => o.controllerId === me?.id).length;
  const foeLibrary = view.zones.library.length - ownLibrary;
  div(els.status, 'status-row',
    `${me?.name}: ❤ ${me?.life} · mana ${me?.mana} · ręka ${ownHand} · biblioteka ${ownLibrary}`);
  div(els.status, 'status-row',
    `${foe?.name}: ❤ ${foe?.life} · ręka ${foeHand} · biblioteka ${foeLibrary}`);

  // --- Stos ------------------------------------------------------------
  if (view.zones.stack.length === 0) {
    div(els.stackZone, 'zone-empty', 'Stos pusty');
  } else {
    for (const spell of view.zones.stack) {
      const caster = view.players.find((p) => p.id === spell.controllerId);
      // Cel na stosie: gracz po imieniu (nie „?" — audyt M83: Release the Ants
      // „→ cel: ?"), permanent po nazwie karty, face-down po „morph".
      const targets = (spell.targets ?? []).map((id) => {
        const tgtPlayer = view.players.find((pl) => pl.id === id);
        if (tgtPlayer) return tgtPlayer.name ?? id;
        const tgtObj = (view.zones.battlefield ?? []).find((o) => o.id === id);
        if (tgtObj) return tgtObj.faceDown ? FACE_DOWN_LABEL : session.nameOf(tgtObj.cardId ?? id);
        return session.nameOfObject(id);
      }).join(', ');
      // Face-down czar (morph/megamorph, CR 708.2): tożsamość ukryta przed
      // przeciwnikiem — zamiast „?" (sugerującego błąd) pokazujemy „morph".
      const spellName = spell.faceDown ? FACE_DOWN_LABEL : session.nameOf(spell.cardId);
      const label = spell.trigger
        ? `Trigger: ${spell.faceDown ? FACE_DOWN_LABEL : session.nameOf(spell.cardId)} (${TRIGGER_EVENT_LABELS[spell.triggerEvent] ?? spell.triggerEvent ?? 'zdolność'})`
        : `${spellName} (rzuca: ${caster?.name})${targets ? ` → cel: ${targets}` : ''}`;
      const item = div(els.stackZone, 'stack-item', label);
      // Zgłoszenie 2026-08-06 (bug C): karty na stosie są klikalne — tapnięcie
      // (i podwójne) nazwy otwiera pełny ekran z jej tekstem, także w trakcie
      // wyboru opcji (np. decyzji surveil), kiedy trzeba doczytać czar.
      if (onStackClick && !spell.hidden) {
        item.className = 'stack-item clickable';
        // stateKey jak w kaflach: strefa stosu też jest czyszczona i odbudowywana
        // przy rerenderze — double-tap musi przeżyć podmianę węzła.
        installTapGesture(item, {
          stateKey: `stack:${spell.id}`,
          onTap: () => onStackClick(spell.id, spell.cardId),
          onDoubleTap: () => onStackClick(spell.id, spell.cardId),
        });
      }
    }
  }

  // --- Bitwiska (wróg u góry, Ty na dole) ------------------------------
  renderBattlefield(els.bfEnemy, view, session, foe?.id, true, onCardClick, hover, onCardDoubleClick);
  renderBattlefield(els.bfOwn, view, session, me?.id, false, onCardClick, hover, onCardDoubleClick);

  // --- Groby i exile (warstwa inspektora stref) ------------------------
  renderZonePile(els.graveOwn, view, session, me?.id, onCardClick, hover, onCardDoubleClick);
  renderZonePile(els.graveEnemy, view, session, foe?.id, onCardClick, hover, onCardDoubleClick);
  renderExile(els.exileZone, view, session, onCardClick, hover, onCardDoubleClick);

  // --- Ręka gracza -----------------------------------------------------
  const ownHandObjects = view.zones.hand.filter((o) => !o.hidden);
  if (ownHandObjects.length === 0) div(els.hand, 'zone-empty', 'Ręka pusta');
  for (const object of ownHandObjects) {
    tile(els.hand, cardInfo(session, object), { session, size: 'sm', onCardClick, hover, onCardDoubleClick });
  }

  // --- Akcje -----------------------------------------------------------
  const commands = view.legalCommands.slice().sort((a, b) => (ACTION_RANK[a.type] ?? 99) - (ACTION_RANK[b.type] ?? 99));
  // M102/U5 (zgłoszenie właściciela 2026-08-16): nagłówek „Twoje działania"
  // NIE pokazuje już liczby. Liczyła surowe `legalCommands`, więc po scaleniu
  // duplikatów (U4) i pogrupowaniu wariantów w modale nie zgadzała się nawet
  // z liczbą widocznych przycisków — nic nie wnosiła, a myliła.
  // M87: sam concede (priorytet przeciwnika / pauza ruchu bota) to NIE błąd —
  // wcześniej alarm „puste okno passu" straszył przy każdym landzie bota.
  // Alarm zostawiamy, gdy widać pass i nic poza concede (auto-pass powinien
  // był przewinąć).
  const actionable = commands.filter((c) => c.type !== 'concede');
  if (view.status === 'active' && actionable.length === 1 && actionable[0].type === 'pass_priority') {
    div(els.actions, 'zone-empty', 'Brak akcji — sesja przewija okna z samym passem. To nie powinno się zdarzyć; zgłoś w PR.');
  }
  // M102/U4: buildActionEntries = grupowanie wariantów decyzji + scalenie
  // duplikatów w pełni wymiennych komend (cztery Foresty w ręce → jeden
  // przycisk „Zagraj ląd: Forest (1 z 4)").
  const actionEntries = onChoiceRequest ? buildActionEntries(commands, session, view) : commands.map((command) => ({ command }));
  for (const entry of actionEntries) {
    const cmd = entry.command ?? entry.first;
    const button = document.createElement('button');
    button.className = 'action';
    if (cmd.type === 'pass_priority') button.className += ' primary';
    if (cmd.type === 'concede') button.className += ' danger';
    // M103 (L15): klucz opcji na przycisku — sonda „oferta bez skutku"
    // Żywego Testera (window.__mtgDebug) mapuje klik na konkretną komendę.
    // Dla grup wyborów klucz pierwszej opcji = to, co kliknie gracz zachłanny.
    const optionKeyCmd = entry.request ? (entry.request.options?.[0] ?? entry.first ?? cmd) : cmd;
    if (optionKeyCmd) button.dataset.optionKey = commandOptionKey(optionKeyCmd);
    if (entry.request) {
      button.className += ' choice-request-trigger';
      // Pełna etykieta grupy (opis CO wybieramy + odmieniona liczba opcji) —
      // prefiks „Wybierz:" ustala choiceGroupLabel (uwaga A, 2026-08-10).
      button.innerHTML = `<span class="action-label">${choiceGroupLabel(entry.request, session, view)}</span>`;
      button.addEventListener('click', () => onChoiceRequest(entry.request));
    } else {
      // Etykieta wyłącznie tekstem (prefiksy są kontraktem testu); ikona przez CSS.
      // action-label: jeden inline-blok w flexie — bez „kolumn" (uwaga D).
      // M102/U4: entry.label niesie licznik egzemplarzy („… (1 z 4)").
      button.innerHTML = `<span class="action-label">${entry.label ?? commandLabel(cmd, session, view)}</span>`;
      if (cmd.type === 'concede') {
        button.addEventListener('click', () => { if (window.confirm('Na pewno poddać partię?')) play(cmd); });
      } else {
        button.addEventListener('click', () => play(cmd));
      }
    }
    // Feature 2026-08-11: ptaszek wyciszenia dla opcji rzutów/zdolności —
    // zaznaczona opcja nie przerywa auto-passu (session.hasMeaningfulDecision
    // ją pomija). Tylko dla POJEDYNCZYCH opcji (nie grup modalnych); innerHTML
    // etykiety ustawiamy PRZED, żeby nie wyczyścić checkboxa.
    // M91 (uwaga B): ptaszek należy się TAKŻE przyciskowi grupy wariantów
    // (Village Rites — wybór poświęcanego stwora, Bone Splinters — wybór celu,
    // każdy czar modalny). Wcześniej `!entry.request` wykluczał grupy, więc
    // gracz mógł wyciszyć taki czar dopiero po otwarciu wizarda — czyli nigdy
    // z panelu. Grupa wycisza WSZYSTKIE swoje warianty naraz (jeden wariant
    // nie wystarczy: auto-pass zatrzymałby się na pozostałych).
    const groupOptions = entry.request ? (entry.request.options ?? []) : null;
    const ignorableEntry = onToggleIgnoredOption && OPTION_IGNORABLE_TYPES.includes(cmd.type)
      && (!groupOptions || groupOptions.every((option) => OPTION_IGNORABLE_TYPES.includes(option.type)));
    if (ignorableEntry) {
      const keys = groupOptions && groupOptions.length > 0
        ? groupOptions.map((option) => commandOptionKey(option))
        : [commandOptionKey(cmd)];
      const key = keys[0];
      // Uwaga B (2026-08-11): ptaszek w <label> z paddingiem — większy obszar
      // aktywny (1-2 spacje wokół pola), żeby omijający ptaszka gracz nie rzucił
      // przypadkowo instanta na cały przycisk. Klik w label przełącza checkbox
      // natywnie; stopPropagation chroni przycisk (nie gra opcji).
      const label = document.createElement('label');
      label.className = 'action-ignore';
      label.title = 'Zaznacz: ta opcja nie przerywa auto-passu';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'action-ignore-input';
      // Grupa jest „wyciszona", gdy wyciszone są wszystkie jej warianty.
      toggle.checked = Boolean(ignoredOptionKeys && keys.every((k) => ignoredOptionKeys.has(k)));
      label.appendChild(toggle);
      label.addEventListener('click', (e) => e?.stopPropagation?.());
      toggle.addEventListener('change', () => {
        // Przełączamy CAŁĄ grupę w jedną stronę (stan brany z pierwszego
        // klucza), żeby częściowe wyciszenie nie zostawiło czaru aktywnym.
        const wasIgnored = Boolean(ignoredOptionKeys && keys.every((k) => ignoredOptionKeys.has(k)));
        for (const k of keys) {
          const isIgnored = Boolean(ignoredOptionKeys && ignoredOptionKeys.has(k));
          if (isIgnored === wasIgnored) onToggleIgnoredOption(k);
        }
      });
      button.appendChild(label);
    }
    els.actions.appendChild(button);
  }

  // --- Log -------------------------------------------------------------
  // M157/E (uwaga właściciela): log pokazuje CAŁĄ rozgrywkę — bez okna
  // ostatnich 80 wpisów (≈4 pełne tury), które wyglądało jak cykliczne
  // czyszczenie sekcji. Najnowsze nadal na górze (reverse).
  const entries = [...session.log].reverse();
  for (const entry of entries) {
    const kind = entry.kind === 'event' && /^—.*—$/.test(entry.text) ? 'step' : entry.kind;
    const line = document.createElement('div');
    line.className = `log-${kind}`;
    // M167/E2 (uwaga właściciela): nazwy kart w logu są KLIKALNE — owijane
    // w <span class="log-card" data-card-id="…">; klik otwiera pełnoekranową
    // ilustrację (delegacja w main.js). Tekst logu pozostaje czystym
    // tekstem w danych (przebieg tur dla AI bez znaczników).
    appendLogLineWithCardLinks(line, entry.text, session.cardIdByName ?? null);
    els.log.appendChild(line);
  }

  // --- Rozumowanie bota (B5) -------------------------------------------
  // Panel w index.html jest domyślnie zwinięty (<details> bez `open`) —
  // render tylko uzupełnia zawartość; licznik pokazuje ile decyzji zapisano.
  if (els.botReasoning) {
    clear(els.botReasoning);
    const reasoning = session.reasoning ?? [];
    if (els.botReasoningCount) {
      els.botReasoningCount.textContent = reasoning.length ? String(reasoning.length) : '';
    }
    if (reasoning.length === 0) {
      div(els.botReasoning, 'zone-empty', 'Brak danych — bot nie zostawił śladu decyzji.');
    } else {
      for (const entry of reasoning.slice(-12).reverse()) {
        div(els.botReasoning, 'reasoning-entry', botReasoningText(entry));
      }
    }
  }

  // --- Przebieg tur (dla AI) (M25) ------------------------------------
  renderTurnHistory(els, session, els.turnHistory2?.checked ? 2 : 1);

  // --- Day/Night (M68) — globalny znacznik, jak loch -------------------
  renderDayNight(els, session, view, { onClick: onDayNightClick, hover });

  // --- Liczniki trucizny (M157/F) — panel jak Undercity/Day/Night --------
  // M169/M: Poison Token klikalny — main przekazuje handler pełnego ekranu
  // (karta specjalna spoza rejestru, jak Day/Night i Undercity).
  renderPoisonPanel(els, view, { onOpenCard: onPoisonCardClick });

  // --- Loch Undercity (M24) -------------------------------------------
  renderUndercity(els, session, view, { onClick: onUndercityClick });
}

/**
 * Loch Undercity (M24): karta specjalna inicjatywy na stole — druk ze
 * Scryfalla (jak w legacy: `api.scryfall.com/cards/tclb/20`), obok znacznik
 * „Inicjatywa" oraz, dla każdego gracza w lochu, zaznaczenie bieżącego pokoju
 * (chip current) i pokoi ukończonych (done). Ukryty, gdy nikt nie wszedł.
 */
/**
 * M68 — Day/Night (CR 708.9): globalny znacznik dnia/nocy na stole, spójny
 * z lochami — karta Day//Night (img ze Scryfall TVOW 21, front/back wg
 * designation) + status. Ukryty, gdy designation nie jest ustalone.
 */
// M157/F (uwaga właściciela): liczniki trucizny mają być jawnie widoczne —
// panel w stylu Undercity/Day-Night z ilustracją karty „Poison Counter"
// (Scryfall tecc/13) i licznikami graczy. Widoczny, gdy ktoś ma truciznę.
const POISON_COUNTER_CARD = Object.freeze({
  name: 'Poison Counter',
  imageUri: 'https://cards.scryfall.io/large/front/8/a/8a9cb417-8709-4336-be36-2fb0cea31fe1.jpg?1783904328',
});

export function renderPoisonPanel(els, view, { onOpenCard = null } = {}) {
  if (!els.poison) return;
  const any = (view.players ?? []).some((p) => (p.poison ?? 0) > 0);
  els.poison.hidden = !any;
  if (!any) return;
  clear(els.poison);
  const card = div(els.poison, 'poison-card');
  // M169/M (uwaga właściciela): karta Poison Token KLIKALNA — pełny ekran
  // jak każdy druk na stole (wzorzec Day/Night z M153/C).
  if (onOpenCard) {
    card.className = 'poison-card clickable';
    card.addEventListener('click', () => onOpenCard(POISON_COUNTER_CARD));
  }
  const img = document.createElement('img');
  img.src = POISON_COUNTER_CARD.imageUri;
  img.alt = POISON_COUNTER_CARD.name;
  img.loading = 'lazy';
  card.appendChild(img);
  const info = div(els.poison, 'poison-info');
  div(info, 'poison-status', 'Liczniki trucizny');
  for (const p of view.players ?? []) {
    div(info, 'poison-count', `${p.id === view.playerId ? 'Ty' : 'Nieprzyjaciel'}: ${p.poison ?? 0} ${polishPluralCount(p.poison ?? 0, 'licznik', 'liczniki', 'liczników')} trucizny`);
  }
  div(info, 'poison-note', 'Gracz z 10 licznikami trucizny przegrywa (CR 704.10). Liczniki znikają tylko z końcem gry — obrażenia ich nie leczą.');
}

export function renderDayNight(els, session, view, { onClick = null, hover = null } = {}) {
  if (!els.daynight) return;
  const designation = view.dayNight ?? null;
  els.daynight.hidden = designation == null;
  if (designation == null) return;
  clear(els.daynight);
  const card = div(els.daynight, 'daynight-card');
  const img = document.createElement('img');
  img.src = designation === 'night' ? DAY_NIGHT_TOKEN.imageUriNight : DAY_NIGHT_TOKEN.imageUriDay;
  img.alt = DAY_NIGHT_TOKEN.name;
  img.loading = 'lazy';
  card.appendChild(img);
  // M153/C (uwaga właściciela): karta specjalna Day/Night miała być
  // klikalna i mieć hover (powiększona wersja), jak basic landy. Tapnięcie
  // otwiera pełny ekran (openDayNightFullscreen), najechanie — powiększenie.
  card.className = card.className ? `${card.className} clickable` : 'clickable';
  card.addEventListener('click', (ev) => {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    if (onClick) onClick();
  });
  if (hover && hover.start) {
    const info = {
      name: DAY_NIGHT_TOKEN.name,
      imageUri: designation === 'night' ? DAY_NIGHT_TOKEN.imageUriNight : DAY_NIGHT_TOKEN.imageUriDay,
      artId: null, set: null, colors: [], kind: 'card', types: ['Card', 'Card'], faceDown: false,
    };
    card.addEventListener('mouseenter', (e) => hover.start(info, e));
    card.addEventListener('mouseleave', hover.end);
    if (hover.cycle) card.addEventListener('wheel', (e) => hover.cycle(info, e));
  }
  const info = div(els.daynight, 'daynight-info');
  div(info, 'daynight-status', designation === 'night' ? 'Noc' : 'Dzień');
  div(info, 'daynight-note', designation === 'night'
    ? 'Wilkołaki daybound są na nightbound stronach. Rzut czaru w turze gracza po wejściu daybounda robi noc; brak czarów aktywnego w poprzedniej turze robi dzień w jego upkeep.'
    : 'Wilkołaki daybound są na daybound stronach. Rzut czaru w turze gracza po wejściu daybounda robi noc.');
}

export function renderUndercity(els, session, view, { onClick = null, hover = null } = {}) {
  if (!els.undercity) return;
  const progress = view.undercityProgress ?? {};
  const entered = Object.entries(progress).filter(([, room]) => room > 0);
  const active = view.initiativePlayerId != null || entered.length > 0;
  els.undercity.hidden = !active;
  if (!active) return;
  clear(els.undercity);
  const card = div(els.undercity, 'undercity-card');
  const img = document.createElement('img');
  img.src = UNDERCITY_DUNGEON.imageUri;
  img.alt = UNDERCITY_DUNGEON.name;
  img.loading = 'lazy';
  card.appendChild(img);
  // Zgłoszenie właściciela A (2026-08-11): karta Undercity na stole nie dawała
  // się otworzyć na pełnym ekranie. Tapnięcie na miniaturkę lochu otwiera
  // pełnoekranowy druk (jak każdy inny kafl).
  card.className = card.className ? `${card.className} clickable` : 'clickable';
  card.addEventListener('click', (ev) => {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    if (onClick) onClick();
  });
  // M153/C: hover jak dla pozostałych kart — powiększony druk pod kursorem.
  if (hover && hover.start) {
    const hInfo = {
      name: UNDERCITY_DUNGEON.name,
      imageUri: UNDERCITY_DUNGEON.imageUri,
      artId: null, set: null, colors: [], kind: 'card', types: ['Dungeon'], faceDown: false,
    };
    card.addEventListener('mouseenter', (e) => hover.start(hInfo, e));
    card.addEventListener('mouseleave', hover.end);
    if (hover.cycle) card.addEventListener('wheel', (e) => hover.cycle(hInfo, e));
  }
  const info = div(els.undercity, 'undercity-info');
  div(info, 'undercity-init', view.initiativePlayerId != null
    ? `Inicjatywa: ${PLAYER_NAMES[view.initiativePlayerId] ?? view.initiativePlayerId}`
    : 'Inicjatywa: nikt');
  for (const [playerId, room] of entered) {
    const row = div(info, 'undercity-player');
    const playerName = PLAYER_NAMES[playerId] ?? playerId;
    div(row, '', `${playerName} — pokój ${room}/${UNDERCITY_ROOMS.length}: ${UNDERCITY_ROOMS[room - 1]?.name ?? '?'}`);
    const rooms = div(row, 'undercity-rooms');
    UNDERCITY_ROOMS.forEach((roomDef, index) => {
      const number = index + 1;
      const stateClass = number === room ? ' current' : (number < room ? ' done' : '');
      div(rooms, `undercity-room${stateClass}`, `${number}. ${roomDef.name}`);
    });
  }
  if (view.initiativePlayerId == null) {
    div(info, 'undercity-note', 'Inicjatywę obejmuje się combat damage na jej posiadacza albo efektem karty (np. Underdark Explorer).');
  }
}

/**
 * Sekcja „Przebieg tur (dla AI)": N ostatnich pełnych tur (1 albo 2) jako
 * gotowy tekst do skopiowania modelowi AI. Imiona: Czarodziejka / Nieprzyjaciel
 * (decyzja właściciela 2026-08-03). Licznik pokazuje liczbę ukończonych tur.
 */
export function renderTurnHistory(els, session, count = 1) {
  if (!els.turnHistory) return;
  const records = session.turnHistory ?? [];
  if (els.turnHistoryCount) {
    els.turnHistoryCount.textContent = records.length ? String(records.length) : '';
  }
  const text = typeof session.turnHistoryText === 'function'
    ? session.turnHistoryText(count)
    : '';
  els.turnHistory.textContent = text || 'Brak ukończonych tur — rozegraj przynajmniej jedną pełną turę, a pojawi się tu jej przebieg.';
}

function renderBattlefield(host, view, session, controllerId, enemy, onCardClick, hover, onCardDoubleClick = null) {
  const mine = view.zones.battlefield.filter((o) => o.controllerId === controllerId);
  if (mine.length === 0) {
    const row = div(host, 'bfrow empty');
    div(row, 'zone-empty', enemy ? 'Brak permanentów przeciwnika' : 'Nie masz permanentów');
    return;
  }
  const lands = mine.filter((o) => o.kind === 'land');
  const others = mine.filter((o) => o.kind !== 'land');
  // Wróg: lądy przy krawędzi (góra), stworki w stronę środka; Ty odwrotnie.
  const groups = enemy
    ? [[lands, 'Lądy'], [others, 'Stworki i inne']]
    : [[others, 'Stworki i inne'], [lands, 'Lądy']];
  for (const [cards, label] of groups) {
    if (!cards.length) continue;
    div(host, 'sub-label', label);
    const row = div(host, 'bfrow');
    for (const object of cards) {
      tile(row, cardInfo(session, object, view.combat ?? null), {
        session, onCardClick, hover, onCardDoubleClick, extraClass: enemy ? 'enemy' : '',
      });
    }
  }
}

function renderZonePile(host, view, session, controllerId, onCardClick, hover, onCardDoubleClick = null) {
  const pile = view.zones.graveyard.filter((o) => o.controllerId === controllerId);
  if (pile.length === 0) {
    div(host, 'zone-empty', 'Grób pusty');
    return;
  }
  for (const object of pile) tile(host, cardInfo(session, object), { session, onCardClick, hover, onCardDoubleClick });
}

function renderExile(host, view, session, onCardClick, hover, onCardDoubleClick = null) {
  const pile = view.zones.exile || [];
  if (!pile.length) {
    div(host, 'zone-empty', 'Exile pusty');
    return;
  }
  // onCardDoubleClick przekazywany jawnie (zgłoszenie 2026-08-06, poboczne):
  // bez tego z exile nie dało się otworzyć pełnego ekranu karty dwuklikiem.
  for (const object of pile) tile(host, cardInfo(session, object), { session, onCardClick, hover, onCardDoubleClick });
}
