import { getSourceForObject } from '../engine/mana-sources.js';
import { castsWithoutPayingMana } from '../engine/impulse-window.js';
import { escapeHtml, manaSymbolsHtml, xCostSymbols } from './mana-icons.js';
import { parseManaCost, totalManaNeeded } from '../engine/mana-cost.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { renderPickerRow } from './picker.js';

/**
 * Sekwencyjny kreator płatności many (E.3a, zgłoszenie właściciela 2026-08-06):
 * „jeśli jest kilka sposobów pozyskania many, engine daje opcje na kolejne
 * many po jednej i dolicza do potrzebnej sumy (tapnij x/y/z)” — zamiast
 * pytania o KOMBINACJĘ źródeł gracz tapuje JEDNO źródło na krok, a po zebraniu
 * sumy rzut odpala się automatycznie.
 *
 * Moduł jest czysty obliczeniowo (bez DOM poza renderem na końcu), żeby
 * pokryć go testami headless. Silnik i protokół ZOSTAJĄ bez zmian: kreator
 * wydaje legalne komendy `tap_for_mana` (lądy) i `activate_ability` (nie-lądowe
 * zdolności many — E.3a cz. A), a wycenę jednoznaczności prowadzi
 * deterministyczny solver (ten sam porządek decyzji co testy replay).
 *
 * Zakres (komentarz do planu E.3a):
 * - TRYBY KOSZTU (E.3a cz. B): kreator rozpoznaje cast_cleave, cast_escape
 *   oraz cast_permanent w wariantach bestow/morph. Całkowity koszt alternatywny
 *   to liczba z deskryptora (bez obniżek CR 601.2f), a wymagania kolorów z
 *   bazowego MANA_COSTS[cardId] (spójnie z hasColorForObject). Morph jest
 *   bezbarwny → puste wymagania. Koszt z {X} zostaje na auto-tapie (brak
 *   rzutów-czarów z {X} w katalogu).
 * - ŹRÓDŁA NIE-LĄDOWE (E.3a cz. A): kreator oferuje oprócz landów też
 *   nietapnięte permanenty z aktywną zdolnością many (Apprentice Wizard,
 *   Seer's Lantern, Dragonbroods' Relic, Scorned Villager/Moonscarred, token
 *   Treasure). Gracz tapuje je jak landy; kreator wysyła activate_ability.
 *   Net zysk = produkcja − koszt aktywacji (Apprentice {U},{T}:+{C}{C}{C} → 2).
 */

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** Etykieta zbioru kolorów źródła: „{U}{R}”, „dowolny kolor”, „bezbarwna”. */
export function sourceColorsLabel(colors) {
  if (!colors || colors.length === 0) return 'bezbarwna';
  if (colors.length >= 5) return 'dowolny kolor';
  return manaSymbolsHtml(colors.map((c) => `{${c}}`).join(''));
}

/**
 * Czy obiekt widoku jest nietapniętym LĄDOWYM źródłem many gracza
 * (tap_for_mana wymaga typu Land — dokładnie te same kryteria co silnik).
 */
function isUntappedLandSource(object, playerId) {
  if (!object || object.controllerId !== playerId || object.tapped) return false;
  const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
  if (!isLand) return false;
  const src = getSourceForObject(object);
  return !!src && (src.amount ?? 1) > 0;
}

/** Nietapnięte lądowe źródła many gracza z widoku sesji (kolejność pola bitwy). */
export function untappedLandSourcesOf(view, playerId) {
  const out = [];
  for (const object of view?.zones?.battlefield ?? []) {
    if (!isUntappedLandSource(object, playerId)) continue;
    const src = getSourceForObject(object);
    out.push({ id: object.id, cardId: object.cardId, colors: src.colors ?? [], amount: src.amount ?? 1 });
  }
  return out;
}

/** Składanka tekstowa kosztu aktywacji zdolności many (HTML robi manaSymbolsHtml). */
function activationCostSymbols({ generic, colors }) {
  const gen = Math.max(0, generic ?? 0);
  const pips = Array.isArray(colors) ? colors : [];
  if (gen === 0 && pips.length === 0) return '';
  return `${gen > 0 ? `{${gen}}` : ''}${pips.map((c) => `{${c}}`).join('')}`;
}

/**
 * Czy zdolność aktywowana produkuje manę (efekt add_mana). Generyczna — nie
 * zna nazw kart; deskryptor effect może być obiektem albo listą.
 */
function isManaAbility(ability) {
  if (!ability || ability.type !== 'activated') return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  return effects.some((e) => e?.type === 'add_mana');
}

/**
 * Połączona lista DOSTĘPNYCH źródeł many gracza (E.3a cz. A): nietapnięte
 * lądy (komenda tap_for_mana) + nie-lądowe permanenty z aktywną zdolnością
 * many (komenda activate_ability). Każde źródło niesie `command` do wysłania
 * przy tapnięciu oraz `amount` = NET zysk many (produkcja − koszt aktywacji,
 * np. Apprentice Wizard {U},{T}:+{C}{C}{C} → 2).
 *
 * `abilityInfo(objectId, abilityIndex)` to zwrotna z pełnego stanu (widok
 * pola bitwy nie niesie deskryptorów zdolności) zwracająca {cardId, colors,
 * amount, manaCost, isLand} dla zdolności many albo null. main.js dostarcza
 * ją z session.state; bez niej lista obejmuje tylko lądy (zachowanie wstecz).
 */
export function manaSourcesOf(view, playerId, abilityInfo, { excludeSourceId = null } = {}) {
  // M190/D (zgłoszenie właściciela, Basilisk Gate): gdy płacimy za zdolność,
  // której KOSZTEM jest tapnięcie źródła ({2}, {T}: …), to samo źródło nie
  // może sfinansować tej płatności — aktywacja i tak je tapuje (CR 602.2a),
  // więc mana nigdy nie powstanie. Wizard oferował ten wariant, gracz klikał,
  // tracił manę i zdolność „fizzlowała". Silnik znał już tę regułę
  // (producibleMana z excludeSourceId, M174/E) — brakowało jej w UI (L48:
  // oferta i walidacja muszą używać tego samego filtra).
  const excluded = excludeSourceId == null
    ? null
    : new Set(Array.isArray(excludeSourceId) ? excludeSourceId : [excludeSourceId]);
  const land = untappedLandSourcesOf(view, playerId).filter((s) => !excluded?.has(s.id));
  const sources = land.map((s) => {
    let colors = s.colors ?? [];
    let amount = s.amount ?? 1;
    // B (zgłoszenie właściciela 2026-09-10, Dismal Backwater): widok pola
    // bitwy NIE niesie deskryptorów zdolności, więc lądy opisywane
    // deskryptorem („{T}: Add {U} or {B}") wychodzą tu bezbarwne —
    // getSourceForObject na obiekcie WIDOKU nie widzi zdolności i wpada
    // w zachowawczy fallback. Silnik płacenia czyta pełny stan (rzut
    // działa), rozjazd jest cichy (L14/L41). Mostek `abilityInfo` (pełny
    // stan — ten sam, którego kreator używa dla źródeł nie-lądowych)
    // dostarcza kolory z index null = produkcja „za samo {T}”. Lądy
    // rzeczywiście bezbarwne (Basilisk Gate) zostają bezbarwne — pełny
    // stan też im kolorów nie przypisze.
    if (colors.length === 0 && typeof abilityInfo === 'function') {
      const full = abilityInfo(s.id, null);
      if (full && (full.colors?.length ?? 0) > 0) {
        colors = [...full.colors];
        amount = full.amount ?? amount;
      }
    }
    // D (Powerstone): lądowe źródła mogą mieć spendOnly z pełnego stanu.
    let spendOnly = null;
    if (typeof abilityInfo === 'function') {
      const full = abilityInfo(s.id, null);
      if (full?.spendOnly) spendOnly = full.spendOnly;
    }
    return {
      id: s.id, cardId: s.cardId, colors, amount,
      kind: 'land',
      spendOnly,
      command: { type: 'tap_for_mana', playerId, objectId: s.id },
    };
  });
  if (typeof abilityInfo !== 'function') return sources;
  const seen = new Set(land.map((s) => s.id));
  for (const cmd of view?.legalCommands ?? []) {
    if (cmd.type !== 'activate_ability') continue;
    if (cmd.objectId == null || cmd.abilityIndex == null) continue;
    if (excluded?.has(cmd.objectId)) continue;
    if ((cmd.targets ?? []).length > 0) continue; // zdolności many nie mają celu
    if (seen.has(cmd.objectId)) continue;
    const info = abilityInfo(cmd.objectId, cmd.abilityIndex);
    if (!info || info.isLand) continue; // lądy pokryte tap_for_mana
    // M311 (zgłoszenie właściciela, Apprentice Wizard „{U}, {T}: Add
    // {C}{C}{C}"): koszt aktywacji NIE jest netowany z produkcją TEGO źródła —
    // różne waluty (produkcja bezbarwna {C}, pip kosztu kolorowy {U}; CR
    // 107.4a) i różne momenty (koszt płaci spendMana z puli albo auto-tapu
    // INNYCH źródeł PRZED produkcją, CR 601.2h). Dawne „3 − 1 = 2" kłamało
    // w opisie (pula rośnie o 3) i w planie (nadmiarowa mana przeciekała do
    // puli poza planem). Źródło niesie PEŁNĄ produkcję + koszt osobno; solver
    // (countPaymentVariants) dolicza koszt do zapotrzebowania.
    const costColors = Array.isArray(info.costColors) ? info.costColors : [];
    const costMana = info.manaCost ?? 0;
    const activationGeneric = Math.max(0, costMana - costColors.length);
    const produkcja = info.amount ?? 0;
    if (produkcja <= 0) continue; // nic nie produkuje (jak dotąd)
    // A (Mana Cylix {1},{T}: dowolny kolor): konwerter WALUT (produkcja wnosi
    // kolory spoza kosztu) jest wyborem, nie stratą — netto-0 w SUMIE, ale
    // netto-dodatni w KOLORACH. Z listy wypada tylko czysta strata (netto ≤ 0
    // w sumie I produkcja ⊆ kosztu, np. hipotetyczne {1},{T}: Add {C}).
    const addsNewColors = (info.colors ?? []).some((c) => !costColors.includes(c));
    if (produkcja - activationGeneric <= 0 && !addsNewColors) continue;
    seen.add(cmd.objectId);
    sources.push({
      id: cmd.objectId, cardId: info.cardId, colors: info.colors ?? [], amount: produkcja,
      activationCost: costMana > 0
        ? { generic: activationGeneric, colors: [...costColors] }
        : null,
      kind: 'ability',
      spendOnly: info.spendOnly ?? null,
      command: { type: 'activate_ability', playerId, objectId: cmd.objectId, abilityIndex: cmd.abilityIndex },
    });
  }
  return sources;
}

/**
 * Komendy rzucania, dla których kreator umie wycenić płatność. Od E.3a cz. B
 * obejmuje też tryby kosztu alternatywnego: cast_cleave, cast_escape oraz
 * cast_permanent w wariantach bestow/morph.
 */
/**
 * M195/A: komendy DECYZJI, w których gracz płaci manę (nie rzuca czaru).
 * Każda z nich prowadzi do spendMana, więc podlega tej samej regule wyboru
 * źródeł co rzuty — inaczej silnik tapuje „pierwszy lepszy ląd".
 */
const PAYMENT_DECISION_TYPES = new Set([
  'resolve_pay_or_sacrifice',
  'resolve_optional_pay_choice',
  'resolve_counter_pay_choice',
  // M258/F3 (ward, CR 702.21): dopłata ward — spendMana, więc te same
  // reguły wyboru źródeł co pozostałe decyzje płatności.
  'resolve_ward_pay_choice',
]);

const WIZARD_CAST_TYPES = new Set(['cast_permanent', 'cast_spell', 'cast_cleave', 'cast_escape', 'cast_adventure', 'cast_adventure_creature']);

/**
 * M327 (audyt PR #102, F7): ODSŁONIĘCIE zakrycia. To jedyne nie-rzutowe
 * `spendMana` w silniku, które płaci PIPY KOLORU (CR 701.58b: cloak płaci
 * koszt many karty; 701.40b: manifest tak samo) — a mimo to kreator many ich
 * nie znał, więc źródła tapował silnik w swojej kolejności. Reguła właściciela
 * z M168/M195 jest ogólna: „zawsze kiedy płatność many jest niejednoznaczna
 * (więcej niż 1 kombinacja rodzajów źródeł) powinien być wizard".
 */
const FACE_UP_TURN_TYPES = new Set(['turn_cloak_face_up', 'turn_manifest_face_up']);

/**
 * Rodzina typów komend, dla których kreator zna płatność (strażnik m327/C):
 * każdy `cmd.type` w silniku, którego handler woła `spendMana` z pipami
 * koloru, musi się tu znaleźć — inaczej stół tapuje źródła za gracza.
 */
export const WIZARD_PAYMENT_COMMAND_TYPES = new Set([
  ...WIZARD_CAST_TYPES, ...FACE_UP_TURN_TYPES, ...PAYMENT_DECISION_TYPES, 'activate_ability',
]);

/**
 * Wymagania kolorów z pipów kolorowych karty bazowej (colored + hybrid +
 * phyrexian po odjęciu symboli opłaconych życiem). Spójne z hasColorForObject
 * w engine. Dotyczy WYŁĄCZNIE rzutów za koszt wydrukowany (także z kickerem,
 * X, manifest/cloak) — koszty alternatywne (cleave, escape, bestow, surge,
 * przygoda) niosą własne pipy (CR 118.9) i czytają je z deskryptora.
 */
function baseColorRequirements(parsed, lifePaid = 0) {
  return [
    ...parsed.colored.map((group) => [...group.colors]),
    ...parsed.hybrid.map((group) => [...group.colors]),
    ...parsed.phyrexian.slice(lifePaid).map((group) => [...group.colors]),
  ];
}

/** Składa deskryptor płatności (wspólny kształt dla wszystkich trybów). */
function buildDescriptor(object, totalNeeded, requirements, costStr, effectiveGeneric) {
  return {
    objectId: object.id,
    cardId: object.cardId,
    costStr,
    effectiveGeneric,
    totalNeeded,
    requirements,
  };
}

/**
 * Deskryptor płatności komendy rzutu: całkowity koszt + wymagania kolorów
 * (lista zbiorów dopuszczalnych kolorów; hybryda = kilka opcji). Zwraca null,
 * gdy kreator nie stosuje się do komendy (brak kosztu, nieznany tryb, {X}).
 *
 * Tryby kosztu alternatywnego: koszt z deskryptora. Bestow/surge używają
 * własnych pipów i opts.alternativeCost po obniżkach CR601.2f (silnik).
 * Pozostałe warianty zachowują własne ścieżki kosztu opisane poniżej.
 * Morph (CR 702.37a) jest bezbarwny → puste wymagania (kreator otworzy się
 * tylko przy ≥2 profilach źródeł; zazwyczaj 1 wariant → auto-tap M34).
 *
 * `opts.effectiveGeneric`: jednostki generyczne po obniżkach (Etherium
 * Sculptor, Metalcraft — z pełnego stanu, bo widok nie niesie zdolności; CR
 * 601.2f). Dotyczy tylko zwykłego rzutu (nie kosztów alternatywnych).
 * `opts.alternativeCost`: koszt bestow/surge po obniżkach z silnika.
 * `opts.escapeCost` / `opts.escapeColors`: całkowity koszt escape po obniżkach
 * i jego pipy — widok GROBÓW nie niesie spell.escape (obiekt grobu ma tylko
 * id/cardId/controllerId), więc main.js czyta je z session.state.
 */
export function paymentDescriptorOf(cmd, view, opts = {}) {
  if (!cmd) return null;
  // M168/C2 (uwaga właściciela): KAŻDA płatność z wyborem — także
  // activate_ability (Incubator {2}, Guidestone Compass {1}, forecast
  // Piercing Rays). Koszt z deskryptora zdolności (main przekazuje go
  // w opts.ability, bo widok nie niesie abilities obiektów). xValue
  // zostaje poza kreatorem (koszt zmienny).
  if (cmd.type === 'activate_ability') {
    const ability = opts.ability ?? null;
    const manaCost = ability?.cost?.mana;
    if (!Number.isInteger(manaCost) || manaCost <= 0) return null;
    if (cmd.xValue != null) return null;
    const allCards = Object.values(view?.zones ?? {}).flat();
    const object = allCards.find((o) => o.id === cmd.objectId);
    if (!object) return null;
    const requirements = (ability.cost?.colors ?? []).map((color) => [color]);
    const generic = Math.max(0, manaCost - requirements.length);
    const costStr = `{${generic}}${(ability.cost?.colors ?? []).map((c) => `{${c}}`).join('')}`;
    return buildDescriptor(object, manaCost, requirements, costStr, generic);
  }
  // M195/A (uwaga właściciela, Rupture Spire): DECYZJE PŁATNICZE też mają
  // kreator. „Zapłać {1} albo poświęć" wybierało pierwszy lepszy ląd, bo ta
  // ścieżka szła prosto do silnika (auto-tap wg jego kolejności), a kreator
  // znał tylko rzuty i aktywacje. Reguła właściciela jest ogólna: „zawsze
  // kiedy płatność many jest niejednoznaczna (więcej niż 1 kombinacja
  // rodzajów źródeł) powinien być wizard".
  //
  // Koszt bierzemy z KOMENDY (`cost`), nie z MANA_COSTS — to koszt decyzji,
  // nie karty. Wymagania kolorów są puste: te decyzje mówią „zapłać {N}"
  // (mana dowolnego rodzaju), więc o wyborze źródeł decyduje gracz.
  if (PAYMENT_DECISION_TYPES.has(cmd.type)) {
    if (cmd.pay !== true) return null;          // wariant bez płacenia
    const cost = cmd.cost ?? cmd.amount ?? 0;
    if (!Number.isInteger(cost) || cost <= 0) return null;
    const allDecisionCards = Object.values(view?.zones ?? {}).flat();
    const source = allDecisionCards.find((o) => o.id === (cmd.sourceId ?? cmd.targetId))
      ?? { id: cmd.sourceId ?? cmd.targetId ?? null, cardId: null };
    return buildDescriptor(source, cost, [], `{${cost}}`, cost);
  }
  if (FACE_UP_TURN_TYPES.has(cmd.type)) {
    const allTurnCards = Object.values(view?.zones ?? {}).flat();
    const object = allTurnCards.find((o) => o.id === cmd.objectId);
    if (!object || !object.faceDown) return null;
    // Koszt specjalnej akcji = koszt many KARTY (nie zakrycia, które ma wartość 0),
    // więc czytamy go z kosztu karty bazowej — ta sama tablica co przy rzucie.
    const costStr = MANA_COSTS[object.cardId];
    if (!costStr) return null;
    if (/\{[XYZ]\}/.test(costStr)) return null; // koszt zmienny: poza kreatorem (jak wyżej)
    const parsed = parseManaCost(costStr);
    if (!parsed) return null;
    const printed = totalManaNeeded(parsed);
    // Silnik płaci `cloakTurnUpCost` / `manifestTurnUpCost` (pełny stan), a
    // widok tych pól nie niesie — main.js podaje je jak `escapeCost`. Każda
    // rozbieżność zamyka kreator: przy błędnym koszcie gracz dostałby
    // odrzuconą komendę, a to gorsze niż auto-tap.
    if (opts.turnUpCost != null && opts.turnUpCost !== printed) return null;
    const totalNeeded = Number.isInteger(opts.turnUpCost) ? opts.turnUpCost : printed;
    if (!Number.isInteger(totalNeeded)) return null;
    // Koszt {0} nie ma tu osobnego wyjątku: suchy koszt bez pipów daje jeden
    // kształt płatności, a bramka M202/O (`shouldOpenManaWizard`) i tak zamyka
    // kreator — nie dokładamy warunku, którego nikt nie sprawdza (ADR 0017).
    const requirements = baseColorRequirements(parsed);
    const label = `${cmd.type === 'turn_manifest_face_up' ? 'Manifest' : 'Cloak'} (${totalNeeded})`;
    return buildDescriptor(object, totalNeeded, requirements, label, Math.max(0, totalNeeded - requirements.length));
  }
  if (!WIZARD_CAST_TYPES.has(cmd.type)) return null;
  const allCards = Object.values(view?.zones ?? {}).flat();
  const object = allCards.find((o) => o.id === cmd.objectId);
  if (!object) return null;
  // H2 (zgłoszenie właściciela 2026-09-19b): rzut z wygnania BEZ KOSZTU MANY
  // (plot albo darmowy impuls) nie ma czego rozkładać na źródła — kreator
  // płatności jest tu nie tylko zbędny, ale szkodliwy: żądał pełnego kosztu,
  // więc gracz tapował lądy i „płacił" za rzut, który silnik rozlicza jako
  // darmowy (mana z puli przepadała). Zero kreatora = zero płatności.
  // Reguła jest wspólna z etykietą oferty (jedno źródło, klasa L102/1).
  if (castsWithoutPayingMana(object)) return null;
  const costStr = MANA_COSTS[object.cardId];
  if (!costStr) return null;
  const parsed = parseManaCost(costStr);
  if (!parsed) return null;

  // --- Tryby kosztu alternatywnego (liczba całkowita, bez obniżek) ---
  // Etap F (CR 118.9): koszt alternatywny ZASTĘPUJE koszt many — wymagania
  // kolorów to pipy kosztu cleave/escape, nie wydruku karty (jedno źródło
  // z legalCleaveCasts/castEscape w silniku — L48). Kwota po obniżkach
  // przychodzi z pełnego stanu (`opts.alternativeCost` / `opts.escapeCost`).
  if (cmd.type === 'cast_cleave') {
    const cleave = object.spell?.cleave;
    if (!Number.isInteger(cleave?.manaCost)) return null;
    const requirements = (cleave.colors ?? []).map((color) => [color]);
    const totalNeeded = Number.isInteger(opts.alternativeCost)
      ? Math.max(requirements.length, opts.alternativeCost) : cleave.manaCost;
    return buildDescriptor(object, totalNeeded, requirements, `Cleave (${totalNeeded})`, totalNeeded - requirements.length);
  }
  if (cmd.type === 'cast_escape') {
    const totalNeeded = Number.isInteger(opts.escapeCost) ? opts.escapeCost : null;
    if (totalNeeded == null) return null;
    // Bez pipów z pełnego stanu kreator się zamyka (auto-tap) — zgadywanie
    // kolorów z wydruku to dokładnie błąd, który tu usuwamy.
    if (!Array.isArray(opts.escapeColors)) return null;
    const requirements = opts.escapeColors.map((color) => [color]);
    if (requirements.length > totalNeeded) return null;
    return buildDescriptor(object, totalNeeded, requirements, `Escape (${totalNeeded})`, totalNeeded - requirements.length);
  }
  // Bestow istnieje tylko na ścieżce permanentów; surge (CR 702.117) także na
  // instantach/sorcerych — oba kształty rzutu muszą mieć własny koszt
  // w deskryptorze (Batch 58/B1: Boulder Salvo {1}{R}, nie {4}{R}).
  if ((cmd.type === 'cast_permanent' || cmd.type === 'cast_spell') && (cmd.surgeCast || cmd.bestow)) {
    const alternative = cmd.surgeCast ? object.surge : object.bestow;
    if (!alternative || !Number.isInteger(alternative.cost)) return null;
    const requirements = (alternative.colors ?? []).map(c => [c]);
    const totalNeeded = Number.isInteger(opts.alternativeCost)
      ? Math.max(requirements.length, opts.alternativeCost) : alternative.cost;
    return buildDescriptor(object, totalNeeded, requirements,
      `${cmd.surgeCast ? 'Surge' : 'Bestow'} (${totalNeeded})`, totalNeeded - requirements.length);
  }
  if (cmd.type === 'cast_permanent' && cmd.faceDown) {
    const totalNeeded = object.morph?.cost;
    if (!Number.isInteger(totalNeeded)) return null;
    return buildDescriptor(object, totalNeeded, [], `Morph (${totalNeeded})`, totalNeeded);
  }
  if (cmd.type === 'cast_adventure') {
    // Adventure (CR 715): koszt przygody to liczba z deskryptora (bez
    // obniżek), pipy kolorów z deskryptora przygody (Gray Slaad: {1}{B}).
    const adventure = object.adventure;
    if (!adventure || !Number.isInteger(adventure.cost)) return null;
    const requirements = (adventure.colors ?? []).map((color) => [color]);
    return buildDescriptor(object, adventure.cost, requirements, `Przygoda (${adventure.cost})`, adventure.cost - requirements.length);
  }
  if (cmd.type === 'cast_adventure_creature') {
    // Strona-stwór karty z przygodą (z exile): zwykły koszt many karty.
    const totalNeeded = Number.isInteger(object.manaCost) ? object.manaCost : null;
    if (totalNeeded == null) return null;
    const requirements = baseColorRequirements(parsed);
    return buildDescriptor(object, totalNeeded, requirements, costStr, totalNeeded - requirements.length);
  }
  if ((cmd.type === 'cast_permanent' || cmd.type === 'cast_spell') && cmd.kicked) {
    // Kicker (CR 702.33): zwykły koszt + dodatkowy koszt kickera (liczba
    // bez obniżek), pipy kickera dokładają się do wymagań kolorów.
    // Audyt PR #93: ścieżka czarów (castSpell) rozlicza kickera tak samo jak
    // permanentów, więc i liczenie w wizardzie musi obejmować `cast_spell`.
    const kicker = object.kicker;
    if (!kicker || !Number.isInteger(kicker.cost)) return null;
    const requirements = [...baseColorRequirements(parsed), ...(kicker.colors ?? []).map((color) => [color])];
    const generic = Number.isInteger(opts.effectiveGeneric) && opts.effectiveGeneric >= 0
      ? Math.min(parsed.generic, opts.effectiveGeneric)
      : parsed.generic;
    const totalNeeded = generic + requirements.length + kicker.cost - (kicker.colors?.length ?? 0);
    return buildDescriptor(object, totalNeeded, requirements, `${costStr} + kicker (${kicker.cost})`, totalNeeded - requirements.length);
  }

  // J (uwaga właściciela 2026-09-23c, Epic Experiment): czar z {X} MA kreatora
  // płatności — X wybiera modal (stepper), a koszt zależy od wybranej wartości.
  // Wcześniej `xValue != null` zamykało kreator („koszt zmienny"), więc płatność
  // szła auto-tapem bez wyboru źródeł. Część bezbarwna = generic + X (pipy
  // z wydruku bez zmian), a etykieta pokazuje X w miejscu liczby — jedno źródło
  // z tytułem oferty (L41).
  if ((cmd.type === 'cast_spell' || cmd.type === 'cast_permanent')
    && cmd.xValue != null && !cmd.kicked) {
    const requirements = baseColorRequirements(parsed);
    const xGeneric = parsed.generic + cmd.xValue;
    const totalNeeded = xGeneric + requirements.length;
    return buildDescriptor(object, totalNeeded, requirements,
      `${xCostSymbols(costStr)} (X=${cmd.xValue})`, xGeneric);
  }

  // --- Zwykły rzut: cast_spell / cast_permanent (phyrexian + obniżki) ---
  // faceDown/bestow na cast_spell to komendy bez sensu (morph/bestow to
  // warianty cast_permanent; xValue należy do activate_ability) — defencyjnie
  // poza kreatorem. Koszt z {X} (zmienny) też poza kreatorem.
  if (cmd.faceDown || cmd.bestow || cmd.xValue != null || costStr.includes('{X}')) return null;
  const lifePaid = Math.max(0, Math.min(cmd.phyrexianPayWithLife ?? 0, parsed.phyrexian.length));
  const requirements = baseColorRequirements(parsed, lifePaid);
  const generic = Number.isInteger(opts.effectiveGeneric) && opts.effectiveGeneric >= 0
    ? Math.min(parsed.generic, opts.effectiveGeneric)
    : parsed.generic;
  const totalNeeded = generic + requirements.length;
  return buildDescriptor(object, totalNeeded, requirements, costStr, generic);
}

/**
 * KTÓRE grupy wymagań pokrywa zbiór źródeł — każde wymaganie dopasowane do
 * innego źródła (maksymalne dopasowanie, deterministyczne: wymagania od
 * najbardziej restrykcyjnych, pierwsze maksymalne dopasowanie wygrywa —
 * ADR 0005). Zwraca ZBIÓR INDEKSÓW pokrytych grup.
 *
 * Liczba pokrytych grup mówi ILE, ale nie KTÓRE — a prowadzenie płatności
 * potrzebuje tej drugiej informacji (uwaga G z gry, 2026-09-23c: pula {U}{B}
 * przy koszcie {1}{B}{G} → kreator liczył `requirements.slice(covered)` i
 * żądał koloru, który już miał w puli, chowając źródła koloru realnie
 * brakującego; lista robiła się pusta „mimo 4 many").
 */
export function coveredRequirementIndexes(sources, requirements) {
  if (requirements.length === 0) return new Set();
  // Wymagania od najbardziej restrykcyjnych (mniej opcji najpierw) — kolejność
  // deterministyczna (ADR 0005), a wynik (maks. dopasowanie) nie zależy od niej.
  const order = requirements
    .map((colors, index) => ({ colors, index }))
    .sort((a, b) => a.colors.length - b.colors.length);
  const covers = order.map(({ colors }) =>
    sources.map((src, i) => (colors.some((c) => src.colors.includes(c)) ? i : -1)).filter((i) => i >= 0));
  const used = new Array(sources.length).fill(false);
  let best = new Set();
  const chosen = new Set();
  const walk = (pos) => {
    if (pos >= order.length) {
      if (chosen.size > best.size) best = new Set(chosen);
      return;
    }
    walk(pos + 1); // pomiń wymaganie
    for (const i of covers[pos]) {
      if (used[i]) continue;
      used[i] = true;
      chosen.add(order[pos].index);
      walk(pos + 1);
      chosen.delete(order[pos].index);
      used[i] = false;
    }
  };
  walk(0);
  return best;
}

/** Liczba pokrytych grup wymagań (delegat do `coveredRequirementIndexes`). */
export function coveredRequirementCount(sources, requirements) {
  return coveredRequirementIndexes(sources, requirements).size;
}

/**
 * Solver jednoznaczności płatności (E.3a): liczy RÓŻNE warianty tapowania —
 * minimalne co do zawierania zbiory źródeł, które razem z AKTUALNĄ PULĄ
 * pokrywają sumę i WSZYSTKIE wymagania kolorów (zbiór to multizbiór PROFILI:
 * rodzaj+kolory+amount+koszt, bez id — dwie Wyspy to ten sam profil).
 * Przecięcie na `cap` (domyślnie 2): odpowiedź to 0/1/„2+”.
 *
 * 1 = płatność jednoznaczna (auto-tap M34), 2 = jest wybór (kreator),
 * 0 = nieopłacalne w ogóle (nie powinno się zdarzyć dla oferty z PlayerView).
 *
 * Model ZUNIFIKOWANY (znalezisko B, Esper Stormblade {W/B}{U}): płatność to
 * pula (STAŁA — kolory many już wyprodukowanej są przesądzone) + tapnięty
 * podzbiór źródeł. Stąd solver bierze jednostki puli (`poolUnits` —
 * expandManaPool, te same co wizardProgress), nie tylko jej rozmiar:
 * - pula {U,W} przy {W/B}{U} pokrywa wszystko (pusty podzbiór wystarcza) → 1;
 * - pula {U} wymaga DOTAPOWANIA hybrydy (Plains albo Swamp) → 2 (kreator);
 * - pula {G,G} (zła waluta) wymaga dotapowania WSZYSTKICH kolorów → 2.
 * Wcześniej solver widział tylko liczbę many: gałąź need<=0 zwracała 1 bez
 * liczenia, a odcięcie `size>=need` ucinało zbiory wymuszone kolorami
 * (0 wariantów) — w obu przypadkach silnik cicho tapował pierwsze źródło
 * w kolejności stołu i gracz tracił wybór hybrydy.
 *
 * MINIMALNOŚĆ jest dokładna (nie odcięciem rozmiaru): zbiór liczy się tylko,
 * gdy ŻADEN jego podzbiór właściwy nie wystarcza (nad-tapnięcia nigdy nie są
 * wymagane — auto-tap płaci minimalnie). Dla źródeł bez kosztów pokrycie jest
 * monotoniczne, więc wystarcza test podzbiorów (n−1); z kosztami aktywacji
 * (M311 — koszt rośnie ze zbiorem) skan pełny, memoizowany (L48 z silnikiem:
 * koszty płacą pula/INNE źródła, nigdy produkcja własna).
 */
export function countPaymentVariants(sources, poolMana, totalNeeded, requirements, cap = 2, poolUnits = []) {
  const usable = sources.filter((s) => (s.amount ?? 1) > 0);
  const poolObjs = poolUnits.map((colors) => ({ colors }));
  const variants = new Set();
  // Memo pokrycia po kanonicznym kluczu (sortowane id) — te same podzbiory
  // wracają w teście minimalności i w różnych gałęziach DFS (ADR 0005:
  // kolejność wejściowa źródeł, determinizm zachowany).
  const coverMemo = new Map();
  const sufficient = (subset) => {
    const key = subset.map((s) => s.id).sort().join(',');
    let hit = coverMemo.get(key);
    if (hit === undefined) {
      // M311: źródła-zdolności z kosztem aktywacji doliczają go do
      // zapotrzebowania (CR 601.2h — koszt płaci pula/inne źródła PRZED
      // produkcją): generic do sumy, pipy kolorowe jako DODATKOWE wymagania.
      const costGeneric = subset.reduce((acc, s) => acc + (s.activationCost?.generic ?? 0), 0);
      const costPips = subset.flatMap((s) => s.activationCost?.colors ?? []);
      const allReqs = costPips.length > 0 ? [...requirements, ...costPips.map((c) => [c])] : requirements;
      const net = subset.reduce((acc, s) => acc + (s.amount ?? 1), 0) - costGeneric;
      hit = (poolMana + net >= totalNeeded)
        && coveredRequirementCount(poolObjs.concat(subset), allReqs) >= allReqs.length;
      coverMemo.set(key, hit);
    }
    return hit;
  };
  const isMinimal = (subset) => {
    // Bez kosztów pokrycie jest monotoniczne (więcej źródeł = więcej many
    // i kolorów przy tych samych wymaganiach) — pokrywający podzbiór właściwy
    // zawiera się w jakimś (n−1), więc test (n−1) jest dokładny.
    if (!subset.some((s) => s.activationCost != null)) {
      for (let skip = 0; skip < subset.length; skip += 1) {
        if (sufficient(subset.filter((_, i) => i !== skip))) return false;
      }
      return true;
    }
    const n = subset.length;
    for (let mask = 0; mask < (1 << n) - 1; mask += 1) {
      const sub = subset.filter((_, i) => (mask >> i) & 1);
      if (sub.length === n) continue;
      if (sufficient(sub)) return false;
    }
    return true;
  };
  // Zgłoszenie właściciela A (2026-09-10): klucz wariantu niesie też RODZAJ
  // źródła. Forest i Scorned Villager produkują identyczne {G}, ale to nie
  // jest ten sam wybór — tapnięty STWÓR nie zaatakuje ani nie zablokuje
  // w tej turze, więc przy tym samym profilu many gracz ma dwie realne
  // decyzje i kreator musi się otworzyć. Dwa LĄDY o tym samym profilu
  // zostają jednym kształtem (są zamienne).
  const variantKey = (subset) => subset
    .map((s) => `${s.kind ?? 'land'}:${[...s.colors].sort().join('')}#${s.amount ?? 1}#`
      + (s.activationCost ? `${s.activationCost.generic}:${[...(s.activationCost.colors ?? [])].sort().join('')}` : '-'))
    .sort()
    .join('|');
  // Pula sama wystarcza (suma + kolory) → dokładnie 1 wariant („zapłać
  // z puli, niczego nie tapuj"); każdy niepusty zbiór jest wtedy nieminimalny.
  if (sufficient([])) return 1;
  const subset = [];
  const walk = (start) => {
    for (let i = start; i < usable.length; i += 1) {
      if (variants.size >= cap) return;
      subset.push(usable[i]);
      if (sufficient(subset)) {
        // Pokrywający zbiór odcina gałąź: każdy nadzbiór zawiera pokrywający
        // podzbiór właściwy, więc jest nieminimalny z definicji.
        if (isMinimal(subset)) variants.add(variantKey(subset));
      } else {
        walk(i + 1);
      }
      subset.pop();
      if (variants.size >= cap) return;
    }
  };
  walk(0);
  return variants.size;
}

/**
 * M202/O (uwaga właściciela, Horizon Spellbomb): czy w ogóle otwierać kreator
 * many dla tej płatności.
 *
 * Zgłoszenie: „Kliknąłem że korzystam z tej dobrowolnej opłaty. Mam na stole
 * tylko jeden nietapowany las, mimo to dostałem mana wizard do zapłacenia G.
 * Mógłby to sam zapłacić bez wizarda skoro nie było innych opcji zapłacenia.”
 *
 * Dotąd decydował wyłącznie `countPaymentVariants`, który liczy RÓŻNE KSZTAŁTY
 * płatności (deduplikacja po profilu źródła `kolory#ilość`), więc równoważne
 * wybory nie są osobnymi wariantami. To za mało: gdy jest JEDNO użyteczne
 * źródło, a pula sama nie pokrywa kosztu (w tym kolorów), wyboru nie ma
 * w ogóle — kreator tylko klika się „dalej” zamiast zapłacić.
 *
 * Reguła: kreator otwieramy WYŁĄCZNIE, gdy istnieją co najmniej dwa różne
 * kształty płatności. Funkcja jest wydzieleniem dotychczasowej reguły z
 * main.js do postaci testowalnej — zachowanie bez zmian, ale teraz przypięte
 * testami (wcześniej reguła była inline i nie miała żadnego testu).
 */
export function shouldOpenManaWizard({ sources, poolMana, totalNeeded, requirements, poolUnits = [] }) {
  // `countPaymentVariants` liczy RÓŻNE KSZTAŁTY płatności (deduplikacja po
  // profilu źródła „rodzaj:kolory#ilość#koszt”), więc dwa identyczne lasy to
  // JEDEN kształt. `poolUnits` (jednostki kolorowej puli, te same co czyta
  // wizardProgress) są częścią płatności: pula {U} przy hybrydzie {W/B}
  // zostawia wybór Plains/Swamp graczowi (znalezisko B) — bez nich solver
  // nie widziałby, że kolory trzeba dopiero dotapować.
  const variants = countPaymentVariants(sources, poolMana, totalNeeded, requirements, 2, poolUnits);
  return variants >= 2;
}

/**
 * Model widoku kreatora w danym kroku: co jeszcze potrzeba i jakie źródła
 * zostały dostępne. Postęp many liczymy z RZECZYWISTEJ puli (po każdej
 * komendzie tap_for_mana/activate_ability pula rośnie o net zysk źródła).
 *
 * Kolorowa pula many: pokrycie kolorów liczymy z jednostek many W PULI
 * (`poolUnits` z `expandManaPool(player.manaPool)`, main.js czyta z sesji).
 * Pula odzwierciedla KOLORY tapniętych źródeł (MtG: tapnięcie Wyspy dodaje {U}),
 * więc check jest poprawny bez ręcznego śledzenia „co tapnięto". Castability
 * (czy z UŻYTECZNYCH, untapped źródeł da się wyprodukować kolory) sprawdza
 * engine w `hasColor` — PRZED tapnięciem (to jestMtG-check, o który chodziło).
 *
 * `sources`: dostępne (nietapnięte) źródła z manaSourcesOf — opcjonalne; bez
 * niego kreator pokazuje tylko nietapnięte lądy (zachowanie wstecz dla testów).
 */
/**
 * Prowadzenie płatności (zgłoszenie G właściciela, 2026-09-20): „kreator many
 * kazał mi tapnąć 4 lądy do czaru za 2”. Kreator NIE MOŻE prosić o tapnięcie
 * źródła, które do NICZEGO się nie przyda — a tak było, gdy suma była już
 * zebrana, a brakowało koloru: lista pokazywała kolejne lądy w kolejności
 * stołu (Wyspa, Góra, Las, Bagno), więc gracz tapował Las „na zapas”, a płatność
 * dopinała się dopiero na Bagnie (4 tapnięcia do kosztu {1}{B}).
 *
 * Reguła (dwie części, obie testowalne):
 * 1. KOLEJNOŚĆ: źródła dające brakujący kolor idą PIERWSZE — pierwszy wiersz
 *    kreatora jest zawsze krokiem, który realnie przybliża płatność (gracz
 *    tapujący „po kolei z góry” nie marnuje tapnięć).
 * 2. ZAKRES: gdy pula pokrywa już CZĘŚĆ BEZBARWNĄ kosztu (`genericMet`), a
 *    brakuje koloru, zostają WYŁĄCZNIE źródła dające brakujący kolor — źródło
 *    bez tego koloru dodałoby manę, której płatność już nie potrzebuje
 *    (marnowanie zasobów). Pusta lista jest wtedy prawdą (nic nie pomoże) —
 *    kreator mówi to wprost.
 *
 *    Uwaga z gry (2026-09-23c): filtr czekał na CAŁĄ sumę (`pool ≥ totalNeeded`),
 *    więc przy koszcie {1}{B}{G} po tapnięciu źródła {U}{B} kreator dalej
 *    proponował lądy bez {G} — gracz tapował je na darmo, a płatność „nie
 *    domykała się". Zostają tylko kolorowe pipy ⇒ filtr włącza się od razu.
 *
 * `missingColors` to spłaszczone grupy NIEpokrytych wymagań (grupa hybrydowa
 * {U/G} daje ['U','G'] — kolor wystarcza którykolwiek).
 */
export function guideManaSources(sources, missingColors, genericMet) {
  const missing = Array.isArray(missingColors) ? missingColors : [];
  const covers = (src) => (src.colors ?? []).some((c) => missing.includes(c));
  // Sortowanie jest STABILNE (JS sort), więc w obrębie grupy zostaje porządek
  // stołu — kreator nie przestawia źródeł bez powodu.
  const ordered = [...(sources ?? [])].sort((a, b) => Number(covers(b)) - Number(covers(a)));
  // Brak wymagań kolorów (koszt bezbarwny) → filtr nie ma czego zawężać, a
  // każdy nietapnięty ląd nadal dolicza manę do sumy.
  if (!genericMet || missing.length === 0) return ordered;
  const pomocne = ordered.filter(covers);
  return pomocne.length > 0 ? pomocne : [];
}

export function wizardProgress(view, playerId, descriptor, sources, poolUnits = []) {
  const player = (view.players ?? []).find((p) => p.id === playerId);
  const pool = player?.mana ?? 0;
  const offeredRaw = Array.isArray(sources) ? sources : untappedLandSourcesOf(view, playerId);
  const remainingTotal = Math.max(0, descriptor.totalNeeded - pool);
  // KOLOROWA PULA (cz. 8): pokrycie kolorow z jednostek many W PULI (poolUnits
  // z expandManaPool(player.manaPool) - main.js czyta z sesji). Pula odzwierciedla
  // KOLORY tapnietych zrodel (MtG: tapniecie Wyspy dodaje {U}), wiec check jest
  // poprawny BEZ recznego sledzenia co-Gracz-tapnal (usuniety bandaz committed).
  // Castability (untapped) sprawdza engine w hasColor PRZED tapnieciem.
  const coveredIndexes = coveredRequirementIndexes(poolUnits.map((colors) => ({ colors })), descriptor.requirements);
  const covered = coveredIndexes.size;
  // A/G (zgłoszenie właściciela): kreator prowadzi płatność — kolejność
  // „najpierw brakujące kolory" + filtr źródeł, które nic już nie wnoszą.
  // Brakujące KOLORY czytamy z indeksów pokrytych grup (nie z `slice(covered)`
  // — patrz `coveredRequirementIndexes`).
  const missingColors = descriptor.requirements
    .filter((_, index) => !coveredIndexes.has(index))
    .flatMap((colors) => colors ?? []);
  // Część BEZBARWNA kosztu = suma − liczba grup pipów (każdy pip zużywa jedną
  // manę). Gdy pula ją pokrywa, zostają tylko kolorowe pipy → filtr zakresu
  // włącza się od razu (uwaga G z gry, 2026-09-23c).
  // F (zgłoszenie 2026-09-25g): mana zużyta na pipy NIE liczy się do sumy
  // generycznej (dawniej `pool >= genericNeeded` liczyło ją PODWÓJNIE —
  // przy {1}{W}{U} po tapnięciu Wyspy pula {U} „zamykała" {1}, choć
  // pokrywała pip {U}, i kreator zostawiał tylko W-landy). Świadkowie:
  // `zgloszenie-f-mana-wizard-filtr-po-pipie.test.js` (F1–F5).
  const genericNeeded = Math.max(0, descriptor.totalNeeded - descriptor.requirements.length);
  const genericMet = (pool - covered) >= genericNeeded;
  const offered = guideManaSources(offeredRaw, missingColors, genericMet)
    .map((src) => ({ ...src, coversMissing: missingColors.some((c) => (src.colors ?? []).includes(c)) }));
  return {
    pool,
    remainingTotal,
    requirements: descriptor.requirements.map((colors, index) => ({ colors, covered: coveredIndexes.has(index) })),
    coveredCount: covered,
    missingColors,
    // Ile nietapniętych źródeł było PRZED filtrem — komunikat pustej listy
    // odróżnia „nie ma czym tapnąć" od „nic nie daje brakującego koloru".
    availableCount: offeredRaw.length,
    untappedSources: offered,
    done: remainingTotal <= 0 && covered >= descriptor.requirements.length,
  };
}

/**
 * Rysuje kreator płatności (modal): koszt, postęp (ile zostało do sumy i
 * które kolory są jeszcze niepokryte), przyciski PO JEDNEMU źródle oraz
 * Anuluj. Teksty wędrują przez textContent (kontrakt render.js).
 */
export function renderManaWizard(host, model, { onTapSource, onCancel }) {
  host.textContent = '';
  const intro = document.createElement('div');
  intro.className = 'choice-request-intro';
  intro.innerHTML = `Płatność ${manaSymbolsHtml(model.costStr)} — tapuj źródła po jednym`;
  host.appendChild(intro);
  const progress = document.createElement('div');
  progress.className = 'mana-wizard-progress';
  const pending = model.requirements.filter((r) => !r.covered).map((r) => r.colors.map((c) => `{${c}}`).join('/'));
  const parts = [];
  if (model.remainingTotal > 0) parts.push(`pozostało ${model.remainingTotal} many`);
  if (pending.length > 0) parts.push(`kolory do pokrycia: ${manaSymbolsHtml(pending.join(', '))}`);
  progress.innerHTML = parts.length > 0 ? parts.join(' · ') : 'Mana zebrana — rzucam…';
  host.appendChild(progress);
  // G (zgłoszenie właściciela 2026-09-20): źródło DOMYKAJĄCE brakujący kolor
  // jest wypisane wprost („— pokrywa {B}”), a wiersze z pustą listą źródeł
  // mówią WPROST, że żadne dostępne źródło nie daje brakującego koloru —
  // gracz nie tapuje na oślep kolejnych lądów.
  const missingLabel = (colors) => manaSymbolsHtml((colors ?? []).map((c) => `{${c}}`).join(''));
  const list = document.createElement('div');
  list.className = 'mana-wizard-sources choice-request-options';
  for (const source of model.untappedSources) {
    const gain = source.amount !== 1 ? ` +${source.amount}` : '';
    // M311: koszt aktywacji zdolności many pokazywany WPROST („koszt aktywacji
    // {U}") — nie jest wliczony w gain (pełna produkcja), bo płaci go pula/
    // inne źródła (CR 601.2h), nie produkcja tego źródła.
    const cost = source.activationCost
      ? ` — koszt aktywacji ${manaSymbolsHtml(activationCostSymbols(source.activationCost))}`
      : '';
    const covers = source.coversMissing ? ` — pokrywa ${missingLabel((source.colors ?? []).filter((c) => (model.missingColors ?? []).includes(c)))}` : '';
    // M292: wiersz rysuje TEN SAM komponent co kreatory wyboru i steppery
    // (`src/table/picker.js`, `kind: 'button'`) — wspólne 44 px celu dotyku i
    // wspólna etykieta, zero osobnej funkcji wizualizującej dla tego ekranu.
    // `html` jest tu dozwolone tylko dlatego, że markup powstaje w tym pliku
    // (ikony many z `mana-icons.js`), a nazwa źródła idzie przez `escapeHtml`.
    renderPickerRow(list, {
      kind: 'button',
      id: source.id,
      html: `Tapnij: ${escapeHtml(source.name)} (${sourceColorsLabel(source.colors)}${gain})${cost}${covers}`,
      rowClassName: 'action choice-request-option mana-wizard-source',
      onActivate: (sourceId) => onTapSource?.(sourceId),
    });
  }
  if (model.untappedSources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zone-empty';
    // G: przy niepokrytym kolorze pusta lista znaczy „żadne z dostępnych
    // źródeł nie daje tego koloru” — komunikat musi to nazwać, żeby gracz
    // wiedział, że ma Anulować, a nie szukać dalej. Warunek nie wymaga już
    // zebranej sumy: filtr zakresu włącza się, gdy zostają same kolorowe pipy
    // (`availableCount` odróżnia to od braku nietapniętych źródeł w ogóle).
    const brakKoloru = (model.missingColors ?? []).length > 0
      && (model.availableCount ?? model.untappedSources.length) > 0;
    empty.textContent = brakKoloru
      ? `Żadne dostępne źródło nie daje ${(model.missingColors ?? []).join(', ')} — Anuluj płatność.`
      : 'Brak nietapniętych źródeł many.';
    list.appendChild(empty);
  }
  host.appendChild(list);
  const cancel = document.createElement('button');
  cancel.className = 'ghost-btn mana-wizard-cancel';
  cancel.type = 'button';
  cancel.textContent = 'Anuluj płatność';
  cancel.addEventListener('click', () => onCancel?.());
  host.appendChild(cancel);
  return host;
}
