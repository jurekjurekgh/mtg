import { getSourceForObject } from '../engine/mana-sources.js';
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
 * wydaje legalne komendy `tap_for_mana`, a wycenę jednoznaczności prowadzi
 * deterministyczny solver (ten sam porządek decyzji co testy replay).
 *
 * Zakres świadomie węższy niż silnik (komentarz do planu E.3a):
 * - kreator pilnuje tapowania LĄDOWYCH źródeł (land + land creature) —
 *   przypadek ze zgłoszenia: kombinacje kolorów / nonbasic landy; zdolności
 *   many na innych permanentach (dorki, relikty) gracz aktywuje jak dotąd
 *   PRZED rzutem (ich koszt jest osobną decyzją strategiczną);
 * - rzuty bez rozpoznawalnego kosztu kolorów (morph, escape, cleave, {X},
 *   bestow) zostają na auto-tapie M34 — kreator nie przeszkadza tam, gdzie
 *   nie ma kolorowych wariantów płatności.
 */

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** Etykieta zbioru kolorów źródła: „{U}{R}”, „dowolny kolor”, „bezbarwna”. */
export function sourceColorsLabel(colors) {
  if (!colors || colors.length === 0) return 'bezbarwna';
  if (colors.length >= 5) return 'dowolny kolor';
  return colors.map((c) => `{${c}}`).join('');
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

/** Nietapnięte lądowe źródła many gracza z widoku sesji (kolejność bitwiska). */
export function untappedLandSourcesOf(view, playerId) {
  const out = [];
  for (const object of view?.zones?.battlefield ?? []) {
    if (!isUntappedLandSource(object, playerId)) continue;
    const src = getSourceForObject(object);
    out.push({ id: object.id, cardId: object.cardId, colors: src.colors ?? [], amount: src.amount ?? 1 });
  }
  return out;
}

/** Wszystkie (także tapnięte) lądowe źródła gracza — do taktu pokrycia kolorów. */
function landSourcesOf(view, playerId) {
  const out = [];
  for (const object of view?.zones?.battlefield ?? []) {
    if (!object || object.controllerId !== playerId) continue;
    const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
    if (!isLand) continue;
    const src = getSourceForObject(object);
    if (src && (src.amount ?? 1) > 0) out.push({ id: object.id, cardId: object.cardId, colors: src.colors ?? [], amount: src.amount ?? 1 });
  }
  return out;
}

/** Komendy rzucania, dla których kreator umie wycenić płatność. */
const WIZARD_CAST_TYPES = new Set(['cast_permanent', 'cast_spell']);

/**
 * Deskryptor płatności komendy rzutu: sparsowany koszt + wymagania kolorów
 * jako lista zbiorów dopuszczalnych kolorów (hybryda = kilka opcji).
 * Zwraca null, gdy kreator nie stosuje się do tej komendy (brak kosztu
 * kolorowego do decyzji, {X}, morph/faceDown — bezpieczny fallback na
 * dotychczasowy auto-tap M34).
 */
export function paymentDescriptorOf(cmd, view) {
  if (!cmd || !WIZARD_CAST_TYPES.has(cmd.type)) return null;
  if (cmd.faceDown || cmd.bestow || cmd.xValue != null) return null;
  const allCards = Object.values(view?.zones ?? {}).flat();
  const object = allCards.find((o) => o.id === cmd.objectId);
  if (!object) return null;
  const costStr = MANA_COSTS[object.cardId];
  if (!costStr || costStr.includes('{X}')) return null;
  const parsed = parseManaCost(costStr);
  if (!parsed) return null;
  const lifePaid = Math.max(0, Math.min(cmd.phyrexianPayWithLife ?? 0, parsed.phyrexian.length));
  const requirements = [
    ...parsed.colored.map((group) => [...group.colors]),
    ...parsed.hybrid.map((group) => [...group.colors]),
    ...parsed.phyrexian.slice(lifePaid).map((group) => [...group.colors]),
  ];
  const totalNeeded = parsed.generic + requirements.length;
  return {
    objectId: object.id,
    cardId: object.cardId,
    costStr,
    totalNeeded,
    requirements,
  };
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
 * Model widoku kreatora w danym kroku: co jeszcze potrzeba i jakie źródła
 * zostały nietapnięte. `tappedIds` to źródła tapnięte W TEJ sesji kreatora
 * (postęp liczymy z nich + pula, nie z losowych wcześniejszych tapów).
 */
export function wizardProgress(view, playerId, descriptor) {
  const player = (view.players ?? []).find((p) => p.id === playerId);
  const pool = player?.mana ?? 0;
  const untapped = untappedLandSourcesOf(view, playerId);
  const tapped = landSourcesOf(view, playerId).filter((s) => !untapped.some((u) => u.id === s.id));
  const remainingTotal = Math.max(0, descriptor.totalNeeded - pool);
  const covered = coveredRequirementCount(tapped, descriptor.requirements);
  return {
    pool,
    remainingTotal,
    requirements: descriptor.requirements.map((colors, i) => ({ colors, covered: i < covered })),
    coveredCount: covered,
    untappedSources: untapped,
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
  intro.textContent = `Płatność ${model.costStr} — tapuj źródła po jednym`;
  host.appendChild(intro);
  const progress = document.createElement('div');
  progress.className = 'mana-wizard-progress';
  const pending = model.requirements.filter((r) => !r.covered).map((r) => r.colors.map((c) => `{${c}}`).join('/'));
  const parts = [];
  if (model.remainingTotal > 0) parts.push(`pozostało ${model.remainingTotal} many`);
  if (pending.length > 0) parts.push(`kolory do pokrycia: ${pending.join(', ')}`);
  progress.textContent = parts.length > 0 ? parts.join(' · ') : 'Mana zebrana — rzucam…';
  host.appendChild(progress);
  const list = document.createElement('div');
  list.className = 'mana-wizard-sources choice-request-options';
  for (const source of model.untappedSources) {
    const button = document.createElement('button');
    button.className = 'action choice-request-option mana-wizard-source';
    button.type = 'button';
    button.textContent = `Tapnij: ${source.name} (${sourceColorsLabel(source.colors)})`;
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
