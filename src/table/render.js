import {
  IMAGE_MODE, cardImageSources, hoverImageSources, hoverModeLabel, hoverPreviewShape,
  nextHoverMode, tileImageSources,
} from './card-images.js';
import { choiceRequest } from '../protocol/types.js';
import { UNDERCITY_ROOMS } from '../engine/effects.js';
import { DAY_NIGHT_TOKEN, UNDERCITY_DUNGEON } from '../cards/card-data.js';
import { PLAYER_NAMES, commandOptionKey, TRIGGER_EVENT_LABELS } from './session.js';
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
  resolve_discover_choice: 'Discover (wybór)',
  resolve_explore_choice: 'Explore (wybór)',
  resolve_craft_exile: 'Craft (wybór wygnania)',
  resolve_hand_creature: 'Położenie stwora z ręki',
  resolve_legend_choice: 'Prawo legend (który zostaje?)',
  resolve_trigger_target: 'Cel triggera (wybór)',
  resolve_optional_trigger_choice: 'Efekt „you may"',
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
  resolve_land_type_choice: 'Wybór typu landa',
  resolve_pay_or_sacrifice: 'Zapłata albo poświęcenie',
  resolve_optional_pay_choice: 'Dobrowolna dopłata',
  resolve_moonlit_choice: 'Moonlit (wybór efektu)',
  resolve_damage_target: 'Cel obrażeń',
  resolve_reveal_order: 'Kolejność kart na wierzchu',
  resolve_discard_choice: 'Odrzucenie karty',
  resolve_sacrifice_choice: 'Poświęcenie stwora',
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
  artifact: 'artefakt', artifact_or_creature: 'artefakt lub stwór',
  artifact_or_enchantment: 'artefakt lub enchantment',
  artifact_you_control: 'twój artefakt', land: 'ląd', land_you_control: 'twój ląd',
  enchantment: 'enchantment', nonland_permanent: 'permanent niebędący lądem',
  other_nonland_permanent: 'inny permanent niebędący lądem',
  nonartifact_nonblack_creature: 'stwór niebędący artefaktem ani czarnym',
  creature_you_control: 'twój stwór', creature_opponent_controls: 'stwór przeciwnika',
  creature_with_subtypes: 'stwór z podtypem', creature_with_power_at_least: 'stwór o sile ≥',
  creature_card_in_graveyard: 'karta-stwór w grobie', creature_card_in_opponent_graveyard: 'karta-stwór w grobie przeciwnika',
  card_in_graveyard: 'karta w grobie', permanent_card_in_graveyard: 'karta-permanent w grobie',
  instant_or_sorcery_card_in_graveyard: 'instant/sorcery w grobie',
  noncreature_spell_on_stack: 'czar niebędący stworem na stosie',
  spell_on_stack: 'czar na stosie', opponent: 'przeciwnik',
});
const targetTypeLabel = (type) => TARGET_TYPE_LABELS[type] ?? type;

/** Opis efektów czaru do wiersza karty („Obrażenia 2, cel: stworek"). */
export function describeSpellEffects(spell) {
  if (!spell) return '';
  const parts = (spell.effects ?? []).map((effect) => {
    if (effect.type === 'damage') return `Obrażenia ${effect.amount}`;
    if (effect.type === 'pump') return `+${effect.power}/+${effect.toughness} do końca tury`;
    if (effect.type === 'create_token') {
      // amount > 1: „N× token" (Gather the Townsfolk 2×, Howl 2×+, Undead Servant wg grobu).
      // Domyślny amount=1 (ETB tworzące jeden token, np. Crested Herdcaller 3/3) —
      // zostaje bez „N×" (zgodnie z dotychczasowym opisem).
      const count = Number.isFinite(effect.amount) && effect.amount > 1 ? `\u00d7${effect.amount} ` : '';
      // Fateful hour (CR 702.86, Gather the Townsfolk): gdy amountIfCondition
      // podaje inną liczbę tokenów dla niskiego życia, doklej „(X przy życiu ≤ N)".
      const fateful = Number.isFinite(effect.ifLifeAtMost) && Number.isFinite(effect.amountIfCondition)
        ? ` (${effect.amountIfCondition} przy \u017cyciu \u2264 ${effect.ifLifeAtMost})` : '';
      return `Stw\u00f3rz ${count}${effect.power ?? '?'}/${effect.toughness ?? '?'} ${effect.name ?? 'token'}${fateful}`;
    }
    return describeEffect(effect);
  });
  const target = (spell.targets ?? []).length ? `cel: ${targetTypeLabel(spell.targets[0].type)}` : '';
  return [parts.join(' + '), target].filter(Boolean).join(' \u00b7 ');
}

/**
 * Feature 2026-08-11: typy komend, które dostają „ptaszek wyciszenia"
 * (nie przerywaj auto-passu) w panelu „Twoje działania". Świadomie BEZ
 * generycznych akcji: pass, dobranie, ląd, deklaracje walki, resolve_*.
 */
export const OPTION_IGNORABLE_TYPES = Object.freeze([
  'cast_permanent', 'cast_spell', 'cast_cleave', 'cast_escape',
  'cast_adventure', 'cast_adventure_creature', 'activate_ability', 'plot_card',
]);

const ACTION_RANK = Object.freeze({
  resolve_mulligan_choice: -3, resolve_mulligan_bottom_choice: -3, resolve_backup: -2, resolve_scry: -1, resolve_surveil: -1, draw_card: 0, play_land: 1, tap_for_mana: 2, plot_card: 3, cast_permanent: 4, cast_spell: 5, cast_cleave: 5, activate_ability: 5,
  declare_attackers: 5, declare_blockers: 6, resolve_combat: 7, pass_priority: 8, concede: 9,
});

/**
 * Grupuje warianty, które są jednym wyborem użytkownika: cel czaru/zdolności,
 * wartość X, wybór atakującego dla ninjutsu albo decyzja scry/backup. Combat
 * pozostaje jawnie enumerowany, bo ma osobny model deklaracji w engine.
 */
function choiceRequestGroupKey(command) {
  if (command.type === 'cast_spell' && command.targets?.length) return `spell:${command.objectId}`;
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
    && (command.targets?.length || command.xValue != null || command.attackerId != null || command.tapCreatureId != null || command.tapOtherCreatureId != null || command.crewCreatureIds?.length)) {
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
  if (command.type === 'resolve_discover_choice') return 'resolve_discover_choice';
  if (command.type === 'resolve_explore_choice') return 'resolve_explore_choice';
  if (command.type === 'resolve_craft_exile') return 'resolve_craft_exile';
  if (command.type === 'resolve_hand_creature') return 'resolve_hand_creature';
  if (command.type === 'resolve_legend_choice') return 'resolve_legend_choice';
  if (command.type === 'resolve_redirect_choice') return 'resolve_redirect_choice';
  if (command.type === 'resolve_proliferate') return 'resolve_proliferate';
  if (command.type === 'resolve_modal_choice') return 'resolve_modal_choice';
  if (command.type === 'resolve_optional_trigger_choice') return 'resolve_optional_trigger_choice';
  if (command.type === 'resolve_discard_choice') return 'resolve_discard_choice';
  if (command.type === 'resolve_hand_top_choice') return 'resolve_hand_top_choice';
  if (command.type === 'resolve_land_type_choice') return 'resolve_land_type_choice';
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
  if (first.type === 'resolve_scry') return 'scry';
  if (first.type === 'resolve_surveil') return 'surveil';
  if (first.type === 'resolve_index_choice') return 'index';
  if (first.type === 'resolve_damage_assignment') return 'damage_assignment';
  if (first.type === 'resolve_clash_choice') return 'clash';
  if (first.type === 'resolve_room_target') return 'room-target';
  if (first.type === 'resolve_backup') return 'target';
  if (first.type === 'resolve_sacrifice_choice') return 'sacrifice';
  if (first.type === 'resolve_trigger_target') return 'target';
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
  if (first.type === 'resolve_discover_choice') return 'command';
  if (first.type === 'resolve_explore_choice') return 'command';
  if (first.type === 'resolve_craft_exile') return 'command';
  if (first.type === 'resolve_hand_creature') return 'target';
  if (first.type === 'resolve_legend_choice') return 'target';
  if (first.type === 'resolve_redirect_choice') return 'target';
  if (first.type === 'resolve_proliferate') return 'target';
  if (first.type === 'resolve_modal_choice') return 'command';
  if (first.type === 'resolve_optional_trigger_choice') return 'command';
  if (first.type === 'resolve_discard_choice') return 'target';
  if (first.type === 'resolve_hand_top_choice') return 'target';
  if (first.type === 'resolve_land_type_choice') return 'command';
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
    const first = entry.group.commands[0];
    const request = choiceRequest({
      id: `choice-${view.turn.number}-${view.turn.step}-${entry.group.index}-${entry.group.key}`,
      type: choiceRequestType(entry.group.commands),
      options: entry.group.commands,
    });
    return { request, first };
  });
}

/** Polskie nazwy keywordów do pola reguł. */
const KEYWORD_LABELS = Object.freeze({
  flying: 'Latanie', vigilance: 'Czujność', transform: 'Transform', reach: 'Zasięg',
  haste: 'Pośpiech', menace: 'Postrach', lifelink: 'Dotykanie życia', deathtouch: 'Dotykanie śmierci',
  trample: 'Zadeptywanie', first_strike: 'Pierwsze uderzenie', hexproof: 'Hexproof (niecelowalność)',
});

// A (2026-08-11): czytelne nazwy liczników pokazywanych na kartach na stole.
const COUNTER_LABELS = Object.freeze({
  '+1/+1': '+1/+1', '-1/-1': '-1/-1', oil: 'oil', charge: 'charge', lore: 'lore',
  flying: 'flying', deathtouch: 'deathtouch', lifelink: 'lifelink', finality: 'finality',
});

/** Opis dynamicznej wartości amount (string zamiast liczby). */
const DYNAMIC_AMOUNT_LABELS = Object.freeze({
  artifacts_you_control: 'za każdy twój artefakt',
  cards_named_in_graveyard: 'za każdą kartę o tej nazwie w grobie',
  lands_with_subtype_you_control: 'za każdy land tego podtypu',
  mana_from_treasure_spent: 'za wydaną manę ze Skarbów',
  commander_casts: 'za rzuty commandera',
  source_power: 'moc źródła',
});
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

/** Czytelny opis pojedynczego efektu (fallback dla nieznanych typów — polska nazwa). */
function describeEffect(e) {
  // M73d (A): puste efekty (effect: {} w cyclyng/static/level-up) to nie
  // „efekt (undefined)" — pomijamy (audyt żywym testerem).
  if (!e || typeof e.type !== 'string' || e.type === '') return '';
  const generic = {
    pump: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} do końca tury`,
    create_token: () => {
      const count = Number.isFinite(e.amount) && e.amount > 1 ? `×${e.amount} ` : '';
      const dynamicNote = typeof e.amount === 'string' ? ` (${dynamicAmount(e.amount)})` : '';
      return `stwórz ${count}token ${e.name ?? ''}${dynamicNote}`;
    },
    damage: () => `${dynamicAmount(e.amount)} obrażeń`,
    gain_life: () => `zyskaj ${e.amount} życia`,
    gain_life_target: () => `cel zyskuje ${e.amount} życia`,
    remove_counter: () => `usuń licznik ${e.counter}`,
    add_counter: () => `połóż licznik ${e.counter}`,
    exile_permanent: () => 'wygnij artefakt/enchantment',
    tap_permanent: () => 'tap',
    lock_untap: () => 'blokada odkręcania (póki źródło zatapnięte)',
    surveil: () => `surveil ${e.amount ?? 1}`,
    clash: () => 'clash',
    take_initiative: () => 'obejmij inicjatywę',
    draw_cards: () => `dobierz ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')}`,
    lose_life: () => `utrata ${e.amount ?? 1} życia`,
    pay_mana: () => `zapłać ${e.amount} many`,
    pay_life: () => `zapłać ${e.amount} życia`,
    return_permanent_from_graveyard: () => `wróć nonland permanent z grobu${e.finalityCounter ? ' z finality' : ''}`,
    transform: () => 'transform (obróć kartę)',
    scry: () => `scry ${e.amount ?? 1}`,
    sacrifice_permanent: () => 'poświęć ten permanent',
    grant_keywords_until_end_of_turn: () => `zdobądź ${(e.keywords ?? []).map((k) => KEYWORD_LABELS[k] ?? k).join(', ')} do końca tury`,
    // M73c: pełna mapa pozostałych typów — koniec „efekt." i surowych slugów.
    add_mana: () => 'dodaj manę',
    add_flying_counter_to_face_down_you_control: () => 'połóż licznik flying na zakrytych stworach',
    amass: () => 'amass (stwórz/rozrośnij Armię)',
    animate_linked: () => 'animuj do końca tury',
    animate_permanent_until_end_of_turn: () => 'animuj do końca tury',
    become_basic_land_type: () => 'stań się podstawowym lądem',
    bounce_permanent: () => 'wróć na rękę właściciela',
    buff_creatures_you_control: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} dla twoich stworów do końca tury`,
    buff_land_creatures: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} dla land creatures do końca tury`,
    buff_opponents_creatures: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} dla stworów przeciwnika do końca tury`,
    cant_be_blocked: () => 'nie może być blokowany',
    cant_be_regenerated_this_turn: () => 'nie może być regenerowany',
    cant_block: () => 'nie może blokować',
    cloak: () => 'cloak (wierzch biblioteki twarzą w dół jako 2/2)',
    control_to_owners_all_creatures: () => 'kontrola stworów wraca do właścicieli',
    counter_spell: () => 'skontruj czar',
    fireball_resolve: () => 'X obrażeń podzielone po równo między cele',
    craft_transform: () => 'craft — transform',
    damage_defending_player: () => `${dynamicAmount(e.amount)} obrażeń obrońcy`,
    damage: () => `${dynamicAmount(e.amount)} obrażeń`,
    damage_each_opponent: () => e.amountFrom === 'manaSpent'
      ? `obrażenia każdemu przeciwnikowi (wydana mana)` : `${e.amount} obrażeń każdemu przeciwnikowi`,
    damage_enchanted_permanent_controller: () => `${e.amount} obrażeń kontrolerowi zaczarowanego`,
    damage_enchanted_player: () => `${e.amount} obrażeń zaczarowanemu graczowi`,
    damage_to_controller: () => `${e.amount} obrażeń kontrolerowi`,
    destroy_permanent: () => 'zniszcz',
    discard_cards: () => `odrzuć ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')}`,
    discard_each_opponent: () => 'każdy przeciwnik odrzuca kartę',
    discover: () => 'discover (odsłoń i rzuć za darmo)',
    draw_cards_both_players: () => `oboje dobierają ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')}`,
    draw_then_discard: () => 'dobierz, potem odrzuć',
    exalted_pump: () => `${signed(e.power ?? 1)}/${signed(e.toughness ?? 1)} do końca tury (exalted)`,
    exile_all: () => 'wygnij wszystkie (filtr)',
    exile_opponent_creature: () => 'wygnij stwora przeciwnika',
    exile_own_land: () => 'wygnij własny ląd',
    exile_target_creature: () => 'wygnij stwora',
    exile_return_transformed: () => 'wygnij, potem wróć przekształcone',
    explore: () => 'explore',
    ferocious_draw_discard: () => 'ferocious: dobierz, potem odrzuć',
    fertile_thicket_reveal: () => 'odsłoń wierzch biblioteki',
    goad: () => 'goad (musi atakować)',
    grant_abilities: () => 'nadaj zdolności do końca tury',
    graveyard_creatures_to_library_top_choice: () => 'karty z grobu na wierzch biblioteki',
    index_look: () => 'zobacz wierzch biblioteki (Index)',
    mill_cards: () => `mieli ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')} (do grobu)`,
    mill_from_bottom: () => `mieli ${e.amount ?? 1} ${polishPluralCount(e.amount ?? 1, 'kartę', 'karty', 'kart')} od spodu biblioteki`,
    opponent_hand_card_to_top: () => 'karta z ręki przeciwnika na wierzch biblioteki',
    player_sacrifices_creature: () => 'cel poświęca stwora',
    prevent_damage_this_turn: () => 'prewencja obrażeń do końca tury',
    prevent_next_damage: () => `prewencja kolejnych ${e.amount ?? 1} obrażeń`,
    proliferate: () => 'proliferate',
    pump_by_creature_count: () => `${signed(e.power ?? 1)}/${signed(e.toughness ?? 1)} za każdego stwora`,
    pump_enchanted_creature: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} do końca tury`,
    pump_food_result: () => `${signed(e.power ?? 0)}/${signed(e.toughness ?? 0)} do końca tury`,
    put_graveyard_card_on_bottom: () => 'karta z grobu na spód biblioteki',
    put_graveyard_card_on_top: () => 'karta z grobu na wierzch biblioteki',
    put_graveyard_card_onto_battlefield: () => 'karta z grobu na bitwisko',
    put_multicolored_creature_from_hand: () => 'wielokolorowy stwór z ręki na bitwisko',
    reanimate_under_your_control: () => 'reanimacja pod twoją kontrolą',
    redirect_spell_target: () => 'przekieruj cel czaru',
    return_banished_to_hand: () => 'zwróć wygnane na rękę',
    return_creature_card_to_hand: () => 'stwór z grobu na rękę',
    return_exiled_to_battlefield: () => 'wygnane wraca na bitwisko',
    return_to_battlefield_tapped: () => 'wróć na bitwisko zatapnięte',
    return_to_battlefield_under_control_at_upkeep: () => 'wróć na bitwisko na początku upkeep',
    return_with_counter: () => 'wróć na bitwisko z licznikiem',
    reveal_hand_choose_exile: () => 'odsłoń rękę, wybierz do wygnania',
    reveal_top_put_creature: () => 'odsłoń wierzch, stwór na bitwisko',
    reveal_top_to_bottom_order: () => 'odsłoń wierzch, ułóż w kolejności',
    sacrifice_each_other_creature: () => 'poświęć każde inne stworzenie',
    sacrifice_food_choice: () => 'poświęć Food (zyskaj 3 życia)',
    search_basic_land_morbid: () => 'szukaj basic landa (morbid)',
    search_library_to_battlefield: () => 'szukaj w bibliotece na bitwisko',
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
    venture_into_undercity: () => 'venture do lochu',
  };
  const fn = generic[e.type];
  if (fn) return fn();
  return `efekt (${e.type})`;
}

/** Czytelny opis zdolności aktywowanej (koszt + cele + efekty). */
/** Tekst kosztu zdolności: „{2}, {T}" (do opisów Cycling/Channel). */
function costTextOf(ability) {
  const cost = ability?.cost ?? {};
  const parts = [];
  if (cost.manaX) parts.push('{X}');
  else if (cost.mana != null) parts.push(`{${cost.mana}}`);
  if (cost.tap) parts.push('{T}');
  return parts.join(', ');
}

function describeAbility(ability, { withCost = true } = {}) {
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
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const parts = effects.filter((e) => e && typeof e.type === 'string' && e.type !== '').map(describeEffect);
  const target = (ability?.targets ?? [])[0];
  const targetText = target ? `cel: ${targetTypeLabel(target.type)}` : '';
  // B (2026-08-11): w etykiecie akcji „Aktywuj: X (koszt …)" koszt jest już
  // pokazany osobno (costPart) — zdublowany koszt w describeAbility mylił
  // („{2}: efekt" zamiast opisu). withCost:false pomija koszt (efekt + cel).
  const cost = ability?.cost ?? {};
  const costText = [
    cost.manaX ? '{X}' : (cost.mana ? `{${cost.mana}}` : ''),
    cost.tap ? '{T}' : '',
  ].filter(Boolean).join(', ');
  const head = withCost ? costText : '';
  return [head, targetText, parts.join(' + ')].filter(Boolean).join(': ');
}

/** Czytelny opis zdolności triggerowanej (np. „Gdy ta karta umrze: zyskaj 2 życia”). */
function describeTriggered(ability) {
  const trigger = ability?.trigger ?? {};
  // M73d (A2): trigger modalny (Etherwrought Page — 3 tryby) nie ma efektów —
  // pokazujemy tryby zamiast pustego „: .".
  if (Array.isArray(ability?.modes) && ability.modes.length > 0) {
    const names = ability.modes.map((m) => m.name ?? 'tryb').join(' / ');
    return `wybierz tryb: ${names}`;
  }
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const parts = effects.filter((e) => e && typeof e.type === 'string' && e.type !== '').map(describeEffect).join(', ');
  if (trigger.event === 'dies') return `Gdy ta karta umrze: ${parts}.`;
  if (trigger.event === 'combat_damage_to_player') return `Gdy zada obrażenia graczowi: ${parts}.`;
  if (trigger.event === 'enter_battlefield' && trigger.sacrificeIfUnpaid) return `Gdy wejdzie na bitwisko: zapłać {${trigger.payMana ?? 0}} albo ją poświęć (płatność automatyczna).`;
  if (trigger.event === 'enter_battlefield') return `Gdy wejdzie na bitwisko: ${parts}.`;
  if (trigger.event === 'attacks') return `Gdy atakuje: ${parts}.`;
  if (trigger.event === 'bat_attacks') return `Gdy nietoperz, który kontrolujesz, atakuje: ${parts}.`;
  if (trigger.event === 'upkeep') return `Na początku upkeep (${trigger.condition?.noSpellsLastTurn ? 'gdy wcześniej nie rzucano czarów' : 'gdy rzucono 2+ czary'}): ${parts}.`;
  // M73d Gold: użyj TRIGGER_EVENT_LABELS z session.js dla spójnego tłumaczenia
  // surowych nazw zdarzeń triggerów (np. you_cast_noncreature_spell → "rzucenie czaru
  // niebędącego stworem"). Fallback na surową nazwę, gdy brak tłumaczenia.
  const eventLabel = TRIGGER_EVENT_LABELS[trigger.event] ?? trigger.event;
  return `Trigger ${eventLabel}: ${parts}.`;
}

/** Tekst reguł do pola karty: keywordy, efekty czaru lub opis zdolności. */
function rulesText(info) {
  if (info.faceDown) return '';
  const keywordLine = (info.keywords ?? []).map((kw) => KEYWORD_LABELS[kw] ?? kw).join(' ');
  const abilityLine = info.abilities && info.abilities.length
    ? info.abilities.map((a) => {
      if (a.type === 'triggered') return describeTriggered(a);
      if (a.keyword === 'ninjutsu') return `Ninjutsu {${a.cost?.mana ?? '?'}}: wróć nieblokowanego atakującego, wejdź zatapnięta i atakująca`;
      if (a.keyword === 'megamorph') return `Megamorph {${a.cost?.mana ?? '?'}}: obróć twarzą do góry i połóż +1/+1`;
      if (a.keyword === 'morph') return `Morph {${a.cost?.mana ?? '?'}}: obróć twarzą do góry`;
      return describeAbility(a);
    }).join('  ·  ')
    : '';
  const spellLine = info.spell ? describeSpellEffects(info.spell) : '';
  const plotLine = info.plot ? `Plot {${info.plot.cost ?? '?'}}: wygnaj z ręki, później rzuć bez kosztu` : '';
  const morphLine = info.morph && info.morph.megamorphCost != null
    ? `Megamorph {${info.morph.megamorphCost}}: możesz zagrać twarzą w dół jako 2/2 za {${info.morph.cost}}, potem obrócić za koszt megamorph (+1/+1)`
    : (info.morph && info.morph.morphCost != null
      ? `Morph {${info.morph.morphCost}}: możesz zagrać twarzą w dół jako 2/2 za {${info.morph.cost}}, potem obrócić za koszt morph`
      : '');
  const landLine = info.kind === 'land' ? 'T: dodaj 1 manę' : '';
  return [keywordLine, spellLine, plotLine, abilityLine, morphLine, landLine].filter(Boolean).join(' · ');
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
  resolve_delirium_target: 'Delirium — cel obrażeń',
  resolve_mentor_target: 'Mentor — kto dostaje licznik?',
  resolve_graveyard_top_choice: 'Karta z grobu na wierzch biblioteki',
  resolve_hand_creature: 'Stwór do położenia obok kosztu',
  resolve_legend_choice: 'Prawo legend — który zostaje?',
  resolve_redirect_choice: 'Przekierowanie obrażeń',
  resolve_proliferate: 'Proliferate — cel licznika',
  resolve_discard_choice: 'Karta do odrzucenia',
  resolve_hand_top_choice: 'Karta z ręki na wierzch biblioteki',
  resolve_damage_target: 'Cel obrażeń',
  resolve_sacrifice_choice: 'Poświęcenie stwora',
  resolve_devour_choice: 'Devour — poświęcenie stwora',
  resolve_food_choice: 'Food — poświęcić za wzmocnienie?',
  resolve_modal_choice: 'Tryb czaru („choose one")',
  resolve_discover_choice: 'Discover — rzucić czy wziąć do ręki?',
  resolve_endure_choice: 'Endure — liczniki czy token?',
  resolve_explore_choice: 'Explore — co z odsłoniętą kartą?',
  resolve_craft_exile: 'Craft — karta do wygnania',
  resolve_color_choice: 'Kolor (np. ochrona)',
  resolve_optional_trigger_choice: 'Efekt dobrowolny („you may")',
  resolve_land_type_choice: 'Typ landa',
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
    return `${escapeHtml(session.nameOf(view.pendingTriggerTarget.cardId))} — cel triggera`;
  }
  if (cmd?.type === 'resolve_modal_choice' && view?.pendingModalTrigger?.cardId) {
    return `${escapeHtml(session.nameOf(view.pendingModalTrigger.cardId))} — wybór trybu`;
  }
  if (!cmd || cmd.objectId == null) return null;
  const zones = ['hand', 'battlefield', 'stack', 'graveyard', 'library'];
  let object = null;
  for (const zone of zones) {
    object = (view?.zones?.[zone] ?? []).find((o) => o.id === cmd.objectId) ?? null;
    if (object) break;
  }
  if (!object) return null;
  const name = escapeHtml(session.nameOf(object.cardId));
  if (cmd.type === 'cast_permanent' && cmd.targets?.length) {
    if (cmd.bestow) return `Bestow: ${name}`;
    if (object.aura) return `Aura: ${name}`;
    return `Cel dla: ${name}`;
  }
  if (cmd.type === 'cast_spell' && cmd.targets?.length) return `Cel czaru: ${name}`;
  if (cmd.type === 'cast_cleave' && cmd.targets?.length) return `Cel czaru (Cleave): ${name}`;
  if (cmd.type === 'activate_ability' && cmd.targets?.length) return `Cel zdolności: ${name}`;
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
  const count = (request?.options ?? []).length;
  return `${choiceGroupTitle(request, session, view)} (${optionsCountLabel(count)})`;
}

export function commandLabel(cmd, session, view) {
  const obj = (id) => view.zones.hand.find((o) => o.id === id)
    ?? view.zones.battlefield.find((o) => o.id === id)
    ?? view.zones.stack.find((o) => o.id === id)
    ?? view.zones.graveyard.find((o) => o.id === id)
    ?? view.zones.library.find((o) => o.id === id);
  const playerNameOf = (id) => PLAYER_NAMES[id] ?? view.players?.find((p) => p.id === id)?.name ?? id;
  const nameOfObjectId = (id) => {
    const player = view.players?.find((p) => p.id === id);
    if (player) return escapeHtml(player.name ?? id);
    const object = obj(id);
    // Face-down (morph, CR 708.2): „morph" zamiast „?" w etykietach celów
    // (audyt żywym testerem M73c — „Rzuć: Expunge → cel: ?").
    const base = object
      ? (object.faceDown ? 'morph' : session.nameOf(object.cardId))
      : session.nameOfObject(id);
    // E (2026-08-11): permanent na bitwisku, który mogą mieć OBAJ gracze
    // (np. stwór na stole) — do nazwy w modalach wyboru dopisujemy kontrolera,
    // żeby było wiadomo, czyja to karta. Skip, gdy kontroler nieznany.
    if (object && object.zone === 'battlefield' && object.controllerId != null && view.players?.length > 1) {
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
    const parts = [];
    if (cost.tap) parts.push('{T}');
    if (cost.manaX) parts.push('{X}');
    const colors = cost.colors ?? [];
    const generic = Math.max(0, (cost.mana ?? 0) - colors.length);
    if (generic > 0) parts.push(`{${generic}}`);
    for (const c of colors) parts.push(`{${c}}`);
    return manaCostHtml(parts.join(''));
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
      return `Rzuć: ${nameOfObjectId(cmd.objectId)}${modeName} (koszt ${costOfCard(cardForMode)})${targets ? ` → cel: ${targets}` : ''}`;
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
      const card = obj(cmd.objectId);
      const esc = card?.spell?.escape?.cost != null ? manaCostHtml(`{${card.spell.escape.cost}}`) : '?';
      const exiled = (cmd.escapeExileIds ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const exilePart = exiled ? ` — wygnaj: ${exiled}` : '';
      return `Ucieczka: ${nameOfObjectId(cmd.objectId)} (koszt ${esc})${exilePart}`;
    }
    case 'cast_adventure': {
      const card = obj(cmd.objectId);
      const adv = card?.adventure ?? {};
      const advCost = manaCostHtml(`${adv.cost != null ? `{${adv.cost}}` : ''}${(adv.colors ?? []).map((c) => `{${c}}`).join('')}`);
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
        // registry) — rodzaj (morph/megamorph) czytamy z object.morph.
        const flipKind = object?.morph?.megamorphCost != null ? 'megamorph' : 'morph';
        const flipCost = object?.morph?.megamorphCost ?? object?.morph?.morphCost;
        const flipColors = object?.morph?.colors ?? [];
        const costHtml = manaCostHtml(`${flipCost != null ? `{${flipCost}}` : ''}${flipColors.map((c) => `{${c}}`).join('')}`);
        return `Obróć twarzą do góry: ${nameOfObjectId(cmd.objectId)} (${flipKind} ${costHtml})`;
      }
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const xPart = cmd.xValue != null ? ` (X=${cmd.xValue})` : '';
      const costPart = ability ? ` (koszt ${abilityCostHtml(ability)})` : '';
      const tapPart = cmd.tapCreatureId ? ` — tapnij ${nameOfObjectId(cmd.tapCreatureId)}` : (cmd.tapOtherCreatureId ? ` — tapnij ${nameOfObjectId(cmd.tapOtherCreatureId)}` : '');
      const crewPart = cmd.crewCreatureIds?.length ? ` — załoga: ${cmd.crewCreatureIds.map((id) => nameOfObjectId(id)).join(', ')}` : '';
      return `Aktywuj: ${nameOfObjectId(cmd.objectId)}${costPart} — ${describeAbility(ability, { withCost: false })}${xPart}${targets ? ` → cel: ${targets}` : ''}${tapPart}${crewPart}`;
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
      return cmd.targetId ? `Połóż na bitwisko: ${nameOfObjectId(cmd.targetId)}` : 'Nie kładź stwora (you may)';
    }
    case 'resolve_legend_choice': {
      // Prawo legend (CR 704.5j): wybraną kopię zostawiamy, reszta idzie do grobu.
      return `Prawo legend: zostaw ${nameOfObjectId(cmd.keepId)}, pozostałe kopie do grobu`;
    }
    case 'resolve_mulligan_choice': {
      if (cmd.keep) return 'Mulligan: Zatrzymaj tę rękę (keep — 7 kart)';
      const already = session.state?.mulliganCounts?.[cmd.playerId] ?? 0;
      const next = already + 1;
      const suffix = next === 1 ? ' (odłożysz 1 kartę na spód)' : ` (odłożysz ${next} karty na spód)`;
      return `Mulligan: Weź mulligana — nowa ręka 7 kart${suffix}`;
    }
    case 'resolve_mulligan_bottom_choice': {
      const ids = Array.isArray(cmd.cardIds) ? cmd.cardIds : [];
      if (ids.length === 0) return 'Mulligan — nie odkładaj kart na spód (biblioteka pusta)';
      const names = ids.map((id) => nameOfObjectId(id)).join(', ');
      const n = ids.length;
      return `Mulligan — odłóż na spód (${n}): ${names}`;
    }
    case 'resolve_reveal_order': {
      // Stomping Slabs — ułóż odsłonięte karty na spodzie biblioteki.
      const cards = (cmd.order ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return `Stomping Slabs: ułóż na spodzie (${cards})`;
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
      return mode?.name ? `${source}Tryb: ${mode.name}` : `${source}Wybierz tryb ${(cmd.modeIndex ?? 0) + 1}`;
    }
    case 'resolve_trigger_target': {
      // Cel wyzwalonej zdolności (uwagi B/C 2026-08-10: było surowe
      // „resolve_trigger_target" dwa razy — bez źródła i bez celu).
      const source = view.pendingTriggerTarget?.cardId
        ? `${escapeHtml(session.nameOf(view.pendingTriggerTarget.cardId))} — ` : '';
      if (cmd.targetId == null) return `${source}bez celu (odmowa — „up to one"/„you may")`;
      const target = nameOfObjectId(cmd.targetId);
      return `${source}cel triggera: ${target}`;
    }
    case 'resolve_redirect_choice': {
      // Willbender — zmiana celu czaru na stosie.
      const pending = view.pendingRedirectChoice;
      const what = pending?.spellCardId ? session.nameOf(pending.spellCardId) : 'czaru';
      return `Willbender: zmień cel ${what} na ${nameOfObjectId(cmd.targetId)}`;
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
function cardInfo(session, object) {
  const cardId = object.cardId;
  const faceDown = Boolean(object.faceDown);
  const details = faceDown ? {} : (session.cardDetails(cardId) || {});
  const colors = faceDown ? [] : (session.colorsOf(cardId) || details.colors || []);
  const kind = inferKind(object, details);
  // Załączona aura to na bitwisku „Enchantment — Aura", a nie stwór;
  // załączony equipment pozostaje „Artifact — Equipment".
  const attachedAura = Boolean(object.attachedTo) && (object.kind === 'aura' || object.bestow || object.aura);
  const attachedEquipment = Boolean(object.attachedTo) && !attachedAura;
  return {
    objectId: object.id,
    cardId: faceDown ? null : cardId,
    isToken: Boolean(cardId && cardId.startsWith('token_')),
    // Face-down permanent (morph/megamorph): 2/2 bez nazwy, kolorów i kosztu.
    name: faceDown ? 'Face-down creature' : (object.name || session.nameOf(cardId)),
    colors,
    kind,
    types: faceDown ? ['Creature'] : (attachedAura ? ['Enchantment', 'Aura'] : (details.types || [])),
    subtypes: faceDown ? [] : (attachedAura ? [] : (details.subtypes || [])),
    attachedAura,
    attachedEquipment,
    keywords: faceDown ? [] : (object.keywords?.length ? object.keywords : (details.keywords || [])),
    manaCost: faceDown ? null : (details.manaCost ?? object.manaCost ?? null),
    power: object.power ?? details.power,
    toughness: object.toughness ?? details.toughness,
    livePower: object.power ?? details.power,
    liveToughness: object.toughness ?? details.toughness,
    powerMod: object.powerModifier,
    toughMod: object.toughnessModifier,
    tapped: Boolean(object.tapped),
    summoningSickness: Boolean(object.summoningSickness),
    goaded: Boolean(object.goaded),
    damage: object.damage || 0,
    // A (2026-08-11): liczniki (np. +1/+1, oil, charge, lore) pokazane na karcie.
    counters: object.counters ?? {},
    spell: details.spell || object.spell,
    abilities: faceDown ? [] : (details.abilities || []),
    morph: details.morph || null,
    plot: details.plot || null,
    attachedTo: object.attachedTo ?? null,
    hostName: object.attachedTo ? (session.nameOfObject?.(object.attachedTo) ?? '') : '',
    // F (2026-08-11): karta-gospodarz pokazuje przypięte do niej aury/equipmenty
    // („zaczarowana: Moonlit Meditation", „wyposażona: …"). Scan bitwiska w widoku.
    attachments: object.zone === 'battlefield' && object.id
      ? (session.view()?.zones?.battlefield ?? []).filter((o) => o.attachedTo === object.id && o.id !== object.id)
          .map((o) => ({ name: o.cardId ? (session.nameOf(o.cardId) || o.cardId) : o.cardId, kind: (o.aura || o.bestow) ? 'aura' : 'equip' }))
      : [],
    faceDown,
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
function buildCardVisual(parent, info, { size = '', zoom = false } = {}) {
  const sizeClass = size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : '';
  const visual = div(parent, `cardvis${sizeClass}`);
  const face = buildFace(visual, info, { size });
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
function buildFace(parent, info, { size = '' } = {}) {
  const sizeClass = size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : '';
  const face = div(parent, `face c-${colorKey(info.colors, info.kind)}${info.isToken ? ' token' : ''}${sizeClass}`);
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
  // Znaczniki stanu (tylko bitwisko)
  if (info.isBattlefield) {
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
    if (info.damage > 0) flags.push(`obrażenia ${info.damage}`);
    // M73d (J): choroba przywołania dotyczy tylko stworów (CR 302.6) —
    // artefakty/enchantmenty nie dostają badge (audyt żywym testerem).
    if (info.summoningSickness && (info.kind === 'creature' || (info.types ?? []).includes('Creature'))) flags.push('choroba');
    // F (2026-08-11): karta-gospodarz pokazuje przypięte do niej aury/equipmenty.
    for (const att of info.attachments ?? []) {
      flags.push(att.kind === 'aura' ? `zaczarowana: ${att.name}` : `wyposażona: ${att.name}`);
    }
    // A (2026-08-11): liczniki na karcie (np. „+1/+1 ×2", „oil ×3", „charge ×5").
    for (const [name, count] of Object.entries(info.counters ?? {})) {
      if (count > 0) flags.push(`${COUNTER_LABELS[name] ?? name} ×${count}`);
    }
    if (flags.length) {
      const badges = div(face, 'fbadges');
      for (const f of flags) {
        const cls = f.startsWith('obrażenia') ? ' dmg' : (f.includes('×') ? ' counter' : ' sick');
        div(badges, 'fbadge' + cls, f);
      }
    }
  }
  // P/T (stworki)
  if (info.kind === 'creature' && info.livePower != null && info.liveToughness != null) {
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
  const visual = buildCardVisual(wrap, info, { size: opts.size || '' });
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
function buildStateOverlay(visual, info) {
  const flags = [];
  if (info.isBattlefield) {
    if (info.attachedAura) flags.push(['aura', 'aura']);
    if (info.attachedEquipment) flags.push(['equip', 'wyposaża']);
    if (info.goaded) flags.push(['goad', 'goad']);
    if (info.damage > 0) flags.push(['dmg', `−${info.damage}`]);
    if (info.summoningSickness && (info.kind === 'creature' || (info.types ?? []).includes('Creature'))) flags.push(['sick', 'choroba']);
    // A (2026-08-11): liczniki na nakładce ilustracji.
    for (const [name, count] of Object.entries(info.counters ?? {})) {
      if (count > 0) flags.push(['counter', `${COUNTER_LABELS[name] ?? name}×${count}`]);
    }
    // F (2026-08-11): przypięte aury/equipmenty na nakładce gospodarza.
    for (const att of info.attachments ?? []) {
      flags.push(['att', att.kind === 'aura' ? `aura:${att.name}` : `equip:${att.name}`]);
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
  const visual = buildCardVisual(el, info, { size: 'sm' });
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
  const face = buildFace(host, info, { size: 'lg' });
  const candidates = hoverImageSources(artOf(info), { hoverMode });
  if (!candidates.length) return host;
  const img = document.createElement('img');
  img.className = 'hover-img';
  img.alt = info.faceDown ? 'Karta zakryta' : info.name;
  img.decoding = 'async';
  img.style.width = `${shape.width}px`;
  img.style.maxHeight = `${shape.height}px`;
  img.style.objectFit = shape.fit;
  host.appendChild(img);
  attachImageWithFallback(img, candidates, face);
  div(host, 'hover-mode', `${hoverModeLabel(hoverMode)} · scroll zmienia tor`);
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
  const face = buildFace(host, info, { size: 'lg' });
  const candidates = hoverImageSources(artOf(info), { hoverMode: 'scryfall' });
  if (candidates.length) {
    const img = document.createElement('img');
    img.className = 'card-img';
    img.alt = info.faceDown ? 'Karta zakryta' : info.name;
    img.decoding = 'async';
    host.appendChild(img);
    attachImageWithFallback(img, candidates, face);
  }
  // Pozycja w karuzeli strefy („2 / 7") — swipe w lewo/prawo przechodzi po
  // kartach strefy, więc gracz widzi, gdzie jest i ile ich zostało.
  if (positionText) div(host, 'fullscreen-position', positionText);
  div(host, 'fullscreen-hint', 'Dotknij ✕ lub w dowolnym miejscu, żeby zamknąć · przesuń w lewo/prawo, by zmienić kartę');
  return host;
}

/**
 * Treść modala „Ruch przeciwnika" (M18): miniaturki WSZYSTKICH zagranych
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
        }, { size: 'sm', zoom: true });
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
    div(row, `bot-move-line${entry.cardId ? ' key' : ''}`, entry.text);
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
export function renderTableView({ els, session, play, onCardClick, onChoiceRequest = null, onCardDoubleClick = null, onStackClick = null, hoverMode = 'scryfall', onHoverModeChange = null, onUndercityClick = null, ignoredOptionKeys = null, onToggleIgnoredOption = null }) {
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
      currentHoverMode = nextHoverMode(currentHoverMode, (e && e.deltaY < 0) ? -1 : 1);
      if (onHoverModeChange) onHoverModeChange(currentHoverMode);
      hover.start(info, e);
    },
  };

  // --- Baner końca gry -------------------------------------------------
  if (view.status !== 'active') {
    const winner = view.players.find((p) => p.id === view.winnerId);
    div(els.banner, 'gameover', `Koniec gry — wygrywa: ${winner?.name ?? '?'} (seed ${session.state.seed})`);
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
      const targets = (spell.targets ?? []).map((id) => session.nameOfObject(id)).join(', ');
      // Face-down czar (morph/megamorph, CR 708.2): tożsamość ukryta przed
      // przeciwnikiem — zamiast „?" (sugerującego błąd) pokazujemy „morph".
      const spellName = spell.faceDown ? 'morph' : session.nameOf(spell.cardId);
      const label = spell.trigger
        ? `Trigger: ${spell.faceDown ? 'morph' : session.nameOf(spell.cardId)} (${TRIGGER_EVENT_LABELS[spell.triggerEvent] ?? spell.triggerEvent ?? 'zdolność'})`
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
  if (els.actionsCount) els.actionsCount.textContent = commands.length ? `${commands.length}` : '';
  if (view.status === 'active' && commands.length <= 1) {
    div(els.actions, 'zone-empty', 'Brak akcji — sesja przewija okna z samym passem. To nie powinno się zdarzyć; zgłoś w PR.');
  }
  const actionEntries = onChoiceRequest ? buildChoiceRequestEntries(commands, view) : commands.map((command) => ({ command }));
  for (const entry of actionEntries) {
    const cmd = entry.command ?? entry.first;
    const button = document.createElement('button');
    button.className = 'action';
    if (cmd.type === 'pass_priority') button.className += ' primary';
    if (cmd.type === 'concede') button.className += ' danger';
    if (entry.request) {
      button.className += ' choice-request-trigger';
      // Pełna etykieta grupy (opis CO wybieramy + odmieniona liczba opcji) —
      // prefiks „Wybierz:" ustala choiceGroupLabel (uwaga A, 2026-08-10).
      button.innerHTML = `<span class="action-label">${choiceGroupLabel(entry.request, session, view)}</span>`;
      button.addEventListener('click', () => onChoiceRequest(entry.request));
    } else {
      // Etykieta wyłącznie tekstem (prefiksy są kontraktem testu); ikona przez CSS.
      // action-label: jeden inline-blok w flexie — bez „kolumn" (uwaga D).
      button.innerHTML = `<span class="action-label">${commandLabel(cmd, session, view)}</span>`;
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
    if (onToggleIgnoredOption && !entry.request && OPTION_IGNORABLE_TYPES.includes(cmd.type)) {
      const key = commandOptionKey(cmd);
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'action-ignore';
      toggle.checked = Boolean(ignoredOptionKeys && ignoredOptionKeys.has(key));
      toggle.title = 'Zaznacz: ta opcja nie przerywa auto-passu';
      toggle.addEventListener('click', (e) => e?.stopPropagation?.());
      toggle.addEventListener('change', () => onToggleIgnoredOption(key));
      button.appendChild(toggle);
    }
    els.actions.appendChild(button);
  }

  // --- Log -------------------------------------------------------------
  const entries = session.log.slice(-80).reverse();
  for (const entry of entries) {
    const kind = entry.kind === 'event' && /^—.*—$/.test(entry.text) ? 'step' : entry.kind;
    div(els.log, `log-${kind}`, entry.text);
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
  renderDayNight(els, session, view);

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
export function renderDayNight(els, session, view) {
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
  const info = div(els.daynight, 'daynight-info');
  div(info, 'daynight-status', designation === 'night' ? 'Noc' : 'Dzień');
  div(info, 'daynight-note', designation === 'night'
    ? 'Wilkołaki daybound są na nightbound stronach. Rzut czaru w turze gracza po wejściu daybounda robi noc; brak czarów aktywnego w poprzedniej turze robi dzień w jego upkeep.'
    : 'Wilkołaki daybound są na daybound stronach. Rzut czaru w turze gracza po wejściu daybounda robi noc.');
}

export function renderUndercity(els, session, view, { onClick = null } = {}) {
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
      tile(row, cardInfo(session, object), {
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
