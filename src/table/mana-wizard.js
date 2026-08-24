import { getSourceForObject } from '../engine/mana-sources.js';
import { escapeHtml, manaSymbolsHtml } from './mana-icons.js';
import { parseManaCost } from '../engine/mana-cost.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';

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
  const sources = land.map((s) => ({
    id: s.id, cardId: s.cardId, colors: s.colors, amount: s.amount ?? 1,
    kind: 'land',
    command: { type: 'tap_for_mana', playerId, objectId: s.id },
  }));
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
    const netGain = (info.amount ?? 0) - (info.manaCost ?? 0);
    if (netGain <= 0) continue; // net niepozytywny — nie opłaca się tapować
    seen.add(cmd.objectId);
    sources.push({
      id: cmd.objectId, cardId: info.cardId, colors: info.colors ?? [], amount: netGain,
      kind: 'ability',
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
]);

const WIZARD_CAST_TYPES = new Set(['cast_permanent', 'cast_spell', 'cast_cleave', 'cast_escape', 'cast_adventure', 'cast_adventure_creature']);

/**
 * Wymagania kolorów z piper kolorowych karty bazowej (colored + hybrid +
 * phyrexian po odjęciu symboli opłaconych życiem). Spójne z hasColorForObject
 * w engine — cleave/escape/bestow NIE zmieniają wymagań kolorów: alternatywny
 * koszt to liczba całkowita, a kolory zawsze liczy się z bazowego
 * MANA_COSTS[cardId] (uproszczenie engine, patrz castCleave/castEscape).
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
 * Tryby kosztu alternatywnego (E.3a cz. B): całkowity koszt to LICZBA z
 * deskryptora — BEZ obniżek CR 601.2f (castCleave/castEscape/castAuraSpell z
 * bestow nie wołają reduceGenericCost). Wymagania kolorów z karty bazowej.
 * Morph (CR 702.36) jest bezbarwny → puste wymagania (kreator otworzy się
 * tylko przy ≥2 profilach źródeł; zazwyczaj 1 wariant → auto-tap M34).
 *
 * `opts.effectiveGeneric`: jednostki generyczne po obniżkach (Etherium
 * Sculptor, Metalcraft — z pełnego stanu, bo widok nie niesie zdolności; CR
 * 601.2f). Dotyczy tylko zwykłego rzutu (nie kosztów alternatywnych).
 * `opts.escapeCost`: całkowity koszt escape — widok GROBÓW nie niesie
 * spell.escape (obiekt grobu ma tylko id/cardId/controllerId), więc main.js
 * czyta go z session.state.
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
  if (!WIZARD_CAST_TYPES.has(cmd.type)) return null;
  const allCards = Object.values(view?.zones ?? {}).flat();
  const object = allCards.find((o) => o.id === cmd.objectId);
  if (!object) return null;
  const costStr = MANA_COSTS[object.cardId];
  if (!costStr) return null;
  const parsed = parseManaCost(costStr);
  if (!parsed) return null;

  // --- Tryby kosztu alternatywnego (liczba całkowita, bez obniżek) ---
  if (cmd.type === 'cast_cleave') {
    const totalNeeded = object.spell?.cleave?.manaCost;
    if (!Number.isInteger(totalNeeded)) return null;
    const requirements = baseColorRequirements(parsed);
    return buildDescriptor(object, totalNeeded, requirements, `Cleave (${totalNeeded})`, totalNeeded - requirements.length);
  }
  if (cmd.type === 'cast_escape') {
    const totalNeeded = Number.isInteger(opts.escapeCost) ? opts.escapeCost : null;
    if (totalNeeded == null) return null;
    const requirements = baseColorRequirements(parsed);
    return buildDescriptor(object, totalNeeded, requirements, `Escape (${totalNeeded})`, totalNeeded - requirements.length);
  }
  if (cmd.type === 'cast_permanent' && cmd.bestow) {
    const totalNeeded = object.bestow?.cost;
    if (!Number.isInteger(totalNeeded)) return null;
    const requirements = baseColorRequirements(parsed);
    return buildDescriptor(object, totalNeeded, requirements, `Bestow (${totalNeeded})`, totalNeeded - requirements.length);
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
  if (cmd.type === 'cast_permanent' && cmd.kicked) {
    // Kicker (CR 702.33): zwykły koszt + dodatkowy koszt kickera (liczba
    // bez obniżek), pipy kickera dokładają się do wymagań kolorów.
    const kicker = object.kicker;
    if (!kicker || !Number.isInteger(kicker.cost)) return null;
    const requirements = [...baseColorRequirements(parsed), ...(kicker.colors ?? []).map((color) => [color])];
    const generic = Number.isInteger(opts.effectiveGeneric) && opts.effectiveGeneric >= 0
      ? Math.min(parsed.generic, opts.effectiveGeneric)
      : parsed.generic;
    const totalNeeded = generic + requirements.length + kicker.cost - (kicker.colors?.length ?? 0);
    return buildDescriptor(object, totalNeeded, requirements, `${costStr} + kicker (${kicker.cost})`, totalNeeded - requirements.length);
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
 * Czy zbiór źródeł pokrywa wymagania kolorów — każde wymaganie dopasowane do
 * innego źródła (maksymalne dopasowanie, deterministyczne: wymagania od
 * najbardziej restrykcyjnych). Zwraca liczbę POKRYTYCH wymagań.
 */
export function coveredRequirementCount(sources, requirements) {
  if (requirements.length === 0) return 0;
  // Wymagania od najbardziej restrykcyjnych (mniej opcji najpierw) — kolejność
  // deterministyczna (ADR 0005), a wynik (maks. dopasowanie) nie zależy od niej.
  const order = requirements
    .map((colors, index) => ({ colors, index }))
    .sort((a, b) => a.colors.length - b.colors.length);
  const covers = order.map(({ colors }) =>
    sources.map((src, i) => (colors.some((c) => src.colors.includes(c)) ? i : -1)).filter((i) => i >= 0));
  const used = new Array(sources.length).fill(false);
  const walk = (pos) => {
    if (pos >= order.length) return 0;
    let best = walk(pos + 1); // pomiń wymaganie
    for (const i of covers[pos]) {
      if (used[i]) continue;
      used[i] = true;
      best = Math.max(best, 1 + walk(pos + 1));
      used[i] = false;
    }
    return best;
  };
  return walk(0);
}

/**
 * Solver jednoznaczności płatności (E.3a): liczy RÓŻNE warianty tapowania —
 * minimalne co do wielkości zbiory źródeł, które pokrywają sumę i WSZYSTKIE
 * wymagania kolorów (zbiór to multizbiór PROFILI: kolory+amount, bez id —
 * dwie Wyspy to ten sam profil). Przecięcie na 2: odpowiedź to 0/1/„2+”.
 *
 * 1 = płatność jednoznaczna (auto-tap M34), 2 = jest wybór (kreator),
 * 0 = nieopłacalne w ogóle (nie powinno się zdarzyć dla oferty z PlayerView).
 */
export function countPaymentVariants(sources, poolMana, totalNeeded, requirements, cap = 2) {
  const need = totalNeeded - Math.max(0, poolMana);
  if (need <= 0 && requirements.length === 0) return 1;
  if (need <= 0) {
    // Suma z puli, ale kolory muszą pokryć nietapnięte źródła — sprawdź,
    // czy pokrycie jest jednoznaczne co do profilu.
    if (coveredRequirementCount(sources, requirements) >= requirements.length) return 1;
    return 0;
  }
  const usable = sources.filter((s) => (s.amount ?? 1) > 0);
  const variants = new Set();
  const maxAmount = Math.max(0, ...usable.map((s) => s.amount ?? 1));
  const minSize = Math.max(1, Math.ceil(need / Math.max(1, maxAmount)));
  const subset = [];
  const walk = (start, size, sumAmount) => {
    if (variants.size >= cap) return;
    if (size >= minSize && sumAmount >= need) {
      if (coveredRequirementCount(subset, requirements) >= requirements.length) {
        const key = subset
          .map((s) => `${[...s.colors].sort().join('')}#${s.amount ?? 1}`)
          .sort()
          .join('|');
        variants.add(key);
        if (variants.size >= cap) return;
      }
      // Dłuższe zbiory nie są minimalne — nie rozgałęziamy w głąb.
      if (size >= need) return;
    }
    if (size >= need) return;
    for (let i = start; i < usable.length; i += 1) {
      subset.push(usable[i]);
      walk(i + 1, size + 1, sumAmount + (usable[i].amount ?? 1));
      subset.pop();
      if (variants.size >= cap) return;
    }
  };
  walk(0, 0, 0);
  return variants.size;
}

/**
 * M202/O (uwaga właściciela, Horizon Spellbomb): czy w ogóle otwierać kreator
 * many dla tej płatności.
 *
 * Zgłoszenie: „Kliknąłem że korzystam z tej dobrowolnej opłaty. Mam na stole
 * tylko jeden niezatapowany las, mimo to dostałem mana wizard do zapłacenia G.
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
export function shouldOpenManaWizard({ sources, poolMana, totalNeeded, requirements }) {
  // `countPaymentVariants` liczy RÓŻNE KSZTAŁTY płatności (deduplikacja po
  // profilu źródła „kolory#ilość”), więc dwa identyczne lasy to JEDEN kształt,
  // a jedno źródło przy koszcie, którego pula nie pokrywa, daje 0 albo 1 —
  // w obu przypadkach wyboru nie ma i kreator jest zbędny.
  const variants = countPaymentVariants(sources, poolMana, totalNeeded, requirements);
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
export function wizardProgress(view, playerId, descriptor, sources, poolUnits = []) {
  const player = (view.players ?? []).find((p) => p.id === playerId);
  const pool = player?.mana ?? 0;
  const offered = Array.isArray(sources) ? sources : untappedLandSourcesOf(view, playerId);
  const remainingTotal = Math.max(0, descriptor.totalNeeded - pool);
  // KOLOROWA PULA (cz. 8): pokrycie kolorow z jednostek many W PULI (poolUnits
  // z expandManaPool(player.manaPool) - main.js czyta z sesji). Pula odzwierciedla
  // KOLORY tapnietych zrodel (MtG: tapniecie Wyspy dodaje {U}), wiec check jest
  // poprawny BEZ recznego sledzenia co-Gracz-tapnal (usuniety bandaz committed).
  // Castability (untapped) sprawdza engine w hasColor PRZED tapnieciem.
  const covered = coveredRequirementCount(poolUnits.map((colors) => ({ colors })), descriptor.requirements);
  return {
    pool,
    remainingTotal,
    requirements: descriptor.requirements.map((colors, i) => ({ colors, covered: i < covered })),
    coveredCount: covered,
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
  const list = document.createElement('div');
  list.className = 'mana-wizard-sources choice-request-options';
  for (const source of model.untappedSources) {
    const button = document.createElement('button');
    button.className = 'action choice-request-option mana-wizard-source';
    button.type = 'button';
    const gain = source.amount !== 1 ? ` +${source.amount}` : '';
    button.innerHTML = `Tapnij: ${escapeHtml(source.name)} (${sourceColorsLabel(source.colors)}${gain})`;
    button.addEventListener('click', () => onTapSource?.(source.id));
    list.appendChild(button);
  }
  if (model.untappedSources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zone-empty';
    empty.textContent = 'Brak nietapniętych źródeł many.';
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
