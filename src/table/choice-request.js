import { choiceResponse } from '../protocol/types.js';

function clearChoiceElement(element) {
  if (element) element.textContent = '';
}

function choiceNode(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  parent?.appendChild(element);
  return element;
}

/**
 * Renderuje protokołowy ChoiceRequest w modalnym panelu UI.
 * `labelForOption` pozostaje po stronie stołu, bo tylko sesja zna nazwy kart
 * i polskie etykiety komend. Odpowiedź jest walidowana przez protocol/types.js.
 */
/** Polskie nazwy typów wyboru w nagłówku modala. */
const CHOICE_TYPE_LABELS = Object.freeze({
  scry: 'Scry',
  surveil: 'Surveil — karty do grobu i kolejność na wierzchu',
  clash: 'Clash — wierzch albo spód biblioteki',
  'room-target': 'Cel pokoju lochu Undercity',
  sacrifice: 'Poświęć stwora (własnego wyboru)',
  phyrexian: 'Płatność phyrexian many ({W/P}: mana albo 2 życia)',
  target: 'Cel',
  value: 'Wartość X',
  command: 'Działanie',
});

export function renderChoiceRequest(host, request, { labelForOption, onResponse, introLabel }) {
  clearChoiceElement(host);
  // introLabel (choiceGroupTitle) — opis wyboru jak w panelu akcji (uwaga A);
  // bez niego fallback na mapę typów.
  choiceNode(host, 'div', 'choice-request-intro', introLabel ?? `Wybierz: ${CHOICE_TYPE_LABELS[request.type] ?? request.type}`);
  const options = choiceNode(host, 'div', 'choice-request-options');
  for (const option of request.options) {
    const button = choiceNode(options, 'button', 'action choice-request-option');
    button.type = 'button';
    // Etykiety opcji pochodzą z commandLabel i zawierają HTML (ikony many z
    // manaCostHtml; nazwy kart już escape'owane) — przez innerHTML, tak jak
    // przyciski panelu „Twoje działania". textContent pokazywał surowy
    // „<span class=\"ms-group\">…" (uwaga właściciela A2, 2026-08-10).
    if (labelForOption) button.innerHTML = `<span class="action-label">${labelForOption(option)}</span>`;
    else button.textContent = String(option);
    button.addEventListener('click', () => {
      const response = choiceResponse(request, option);
      onResponse?.(response);
    });
  }
  if (request.options.length === 0) {
    choiceNode(host, 'div', 'zone-empty', 'Brak dostępnych wariantów.');
  }
  return host;
}
// =============================================================================
// Sekwencyjny wizard scry/surveil (zgłoszenie właściciela 2026-08-06, pkt 4)
// =============================================================================

/**
 * Czy żądanie wyboru to komplet wariantów scry/surveil dla TEGO gracza — wtedy
 * zamiast listy wszystkich kombinacji pokazujemy wizard krok po kroku.
 * Zwraca 'scry' | 'surveil' | null. Bez zmiany protokołu: warstwa UI i tak
 * wysyła jedną pełną komendę resolve_* — składa ją dopiero na końcu kroków.
 */
export function lookWizardKindOf(request, view) {
  const options = request?.options ?? [];
  if (options.length === 0) return null;
  const type = options[0]?.type;
  if (!options.every((cmd) => cmd.type === type)) return null;
  // Index (APC): pojedyncza komenda resolve_index_choice (engine nie
  // enumeruje 5! permutacji) — wizard układa karty od góry (M65).
  if (type === 'resolve_index_choice') {
    const pending = view?.pendingIndex;
    if (!pending || pending.playerId !== view?.playerId || !Array.isArray(pending.cards) || pending.cards.length === 0) {
      return null;
    }
    return 'index';
  }
  if (type !== 'resolve_surveil' && type !== 'resolve_scry') return null;
  const pending = type === 'resolve_surveil' ? view?.pendingSurveil : view?.pendingScry;
  if (!pending || pending.playerId !== view?.playerId || !Array.isArray(pending.cards) || pending.cards.length === 0) {
    return null;
  }
  return type === 'resolve_surveil' ? 'surveil' : 'scry';
}

/**
 * Wizard decyzji scry/surveil: najpierw PEŁNA LISTA przeglądniętych kart
 * (zgłoszenie: „piszesz jakie karty wyciągnęło Surveil"), potem JEDNA decyzja
 * na kartę po kolei (grób/wierzch albo spód/wierzch) — NIE lista wszystkich
 * kombinacji. Surveil z ≥2 kartami zostającymi na wierzchu ma jeszcze krok
 * kolejności (klikane od góry). Po ostatnim kroku wywołuje onComplete:
 * surveil → { millIds, topOrder }, scry → { bottomIds }.
 */
export function renderLookWizard(host, { kind, cards, onComplete, onCancel }) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  const labels = kind === 'surveil'
    ? { intro: `Surveil ${list.length} — przeglądnięte karty:`, toBad: 'Na cmentarz', toGood: 'Na wierzch biblioteki', badMark: '→ cmentarz', goodMark: '→ wierzch' }
    : kind === 'index'
      ? { intro: `Index ${list.length} — karty na wierzchu biblioteki (ułóż w dowolnej kolejności):`, toBad: '', toGood: '', badMark: '', goodMark: '' }
      : { intro: `Scry ${list.length} — przeglądnięte karty:`, toBad: 'Na spód biblioteki', toGood: 'Zostaw na wierzchu', badMark: '→ spód', goodMark: '→ wierzch' };
  const badIds = []; // surveil: millIds · scry: bottomIds
  const keptIds = kind === 'index' ? list.map((card) => card.id) : []; // index: wszystkie zostają, liczy się kolejność
  const orderIds = []; // surveil/index: docelowa kolejność wierzchu (od góry)
  const decisions = new Map(); // id → 'bad' | 'top'

  const renderIntro = () => {
    choiceNode(host, 'div', 'choice-request-intro', labels.intro);
    const looked = choiceNode(host, 'div', 'look-wizard-cards');
    list.forEach((card, index) => {
      const mark = decisions.get(card.id);
      const suffix = mark === 'bad' ? ` ${labels.badMark}` : mark === 'top' ? ` ${labels.goodMark}` : '';
      choiceNode(looked, 'span', 'look-wizard-card', `${index + 1}. ${card.name}${suffix}`);
    });
  };
  const renderCancel = () => {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel?.());
  };
  const finish = () => {
    // topOrder musi być permutacją kart zostających na wierzchu — przy 0/1
    // karcie krok kolejności jest zbędny i trywialna permutacja wystarczy.
    if (kind === 'index') onComplete?.({ order: orderIds.length > 0 ? [...orderIds] : [...keptIds] });
    else if (kind === 'surveil') onComplete?.({ millIds: [...badIds], topOrder: orderIds.length > 0 ? [...orderIds] : [...keptIds] });
    else onComplete?.({ bottomIds: [...badIds] });
  };
  const stepOrder = () => {
    clearChoiceElement(host);
    renderIntro();
    choiceNode(host, 'div', 'choice-request-intro', kind === 'index'
      ? 'Ustaw nową kolejność od góry — wybieraj karty po kolei:'
      : 'Ułóż karty na wierzchu biblioteki (od góry) — wybieraj po kolei:');
    const options = choiceNode(host, 'div', 'choice-request-options');
    for (const id of keptIds.filter((kept) => !orderIds.includes(kept))) {
      const card = list.find((c) => c.id === id);
      const button = choiceNode(options, 'button', 'action choice-request-option', `Kolejna na wierzchu: ${card?.name ?? id}`);
      button.type = 'button';
      button.addEventListener('click', () => {
        orderIds.push(id);
        if (orderIds.length === keptIds.length) finish();
        else stepOrder();
      });
    }
    renderCancel();
  };
  const stepCard = (index) => {
    clearChoiceElement(host);
    renderIntro();
    const card = list[index];
    choiceNode(host, 'div', 'look-wizard-current', `Karta ${index + 1} z ${list.length}: ${card.name}`);
    const options = choiceNode(host, 'div', 'choice-request-options');
    const bad = choiceNode(options, 'button', 'action choice-request-option', labels.toBad);
    bad.type = 'button';
    bad.addEventListener('click', () => {
      decisions.set(card.id, 'bad');
      badIds.push(card.id);
      next(index);
    });
    const good = choiceNode(options, 'button', 'action choice-request-option', labels.toGood);
    good.type = 'button';
    good.addEventListener('click', () => {
      decisions.set(card.id, 'top');
      keptIds.push(card.id);
      next(index);
    });
    renderCancel();
  };
  const next = (index) => {
    if (index + 1 < list.length) { stepCard(index + 1); return; }
    // Surveil: reszta na wierzchu „in any order" — przy ≥2 pytamy o kolejność.
    if (kind === 'surveil' && keptIds.length >= 2) stepOrder();
    else finish();
  };

  clearChoiceElement(host);
  if (kind === 'index') {
    renderIntro();
    stepOrder();
    return;
  }
  if (list.length === 0) {
    choiceNode(host, 'div', 'zone-empty', 'Brak kart do decyzji.');
    return host;
  }
  stepCard(0);
  return host;
}

// =============================================================================
// M66 (B/R): wizardy walki — atakujący/blokujący (przełączniki, NIE kombinacje)
// oraz rozdzielanie obrażeń (steppery przy blokerach).
// =============================================================================

/** Pomocnik: nazwa obiektu z widoku (battlefield/hand) albo id. */
function objectName(view, session, id) {
  const zones = [view.zones.battlefield, view.zones.hand, view.zones.stack, view.zones.graveyard, view.zones.library];
  for (const zone of zones) {
    const object = (zone ?? []).find((o) => o.id === id);
    if (object) return session.nameOf(object.cardId);
  }
  return session.nameOfObject ? session.nameOfObject(id) : String(id);
}

/** Czy stwór ma statyczną zdolność (np. cantAttackAlone) wg widoku. */
function viewCreatureHasStatic(view, id, field) {
  const object = (view.zones.battlefield ?? []).find((o) => o.id === id);
  return Boolean(object && (object.abilities ?? []).some((a) => a.type === 'static' && a[field] === true));
}

/**
 * Wizard deklaracji ataku/bloków: zamiast listy WSZYSTKICH kombinacji
 * (2^n atakujących, iloczyn przy blokach) — przełącznik tak/nie przy każdym
 * zdolnym stworze + „Zatwierdź". Finalną komendę buduje się z zaznaczonych.
 */
export function renderCombatWizard(host, { kind, view, session, options, onComplete, onCancel }) {
  clearChoiceElement(host);
  const isAttackers = kind === 'attackers';
  // Unikalni kandydaci: suma id ze wszystkich oferowanych wariantów.
  const candidateIds = [];
  const seenIds = new Set();
  const pushId = (id) => { if (!seenIds.has(id)) { seenIds.add(id); candidateIds.push(id); } };
  if (isAttackers) {
    for (const cmd of options) for (const id of cmd.attackerIds ?? []) pushId(id);
  } else {
    for (const cmd of options) {
      for (const [attackerId, blockerIds] of Object.entries(cmd.assignments ?? {})) {
        pushId(attackerId);
        for (const id of blockerIds) pushId(id);
      }
    }
  }
  // Obowiązkowi (goad / must-attack): obecni w KAŻDYM wariancie.
  const inEvery = (id) => options.every((cmd) => (isAttackers
    ? (cmd.attackerIds ?? []).includes(id)
    : Object.keys(cmd.assignments ?? {}).includes(id)));
  const mandatory = new Set(candidateIds.filter(inEvery));

  const selected = new Set(mandatory);
  const blockedBy = new Map(); // atakujący → wybrani blokerzy (dla bloków)
  if (!isAttackers) {
    // Domyślnie zaznaczamy „bez bloków".
    for (const [attackerId] of Object.entries(options[0]?.assignments ?? {})) blockedBy.set(attackerId, []);
  }

  const intro = isAttackers
    ? 'Wybierz atakujących (zaznacz stwory, które mają atakować):'
    : 'Wybierz blokujących (przełączniki przy każdym atakującym):';
  choiceNode(host, 'div', 'choice-request-intro', intro);
  const list = choiceNode(host, 'div', 'combat-wizard-list');

  const renderRow = (id, checked, disabled, label, onChange) => {
    const row = choiceNode(list, 'label', 'combat-wizard-row');
    const input = choiceNode(row, 'input', 'combat-wizard-toggle');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = Boolean(disabled);
    input.addEventListener('change', () => onChange(input.checked));
    choiceNode(row, 'span', 'combat-wizard-name', label);
    return row;
  };

  const renderAttackerBlockers = (attackerId) => {
    const attackerLabel = objectName(view, session, attackerId);
    const wrapper = choiceNode(list, 'div', 'combat-wizard-attacker');
    choiceNode(wrapper, 'div', 'combat-wizard-sub', `${attackerLabel} — blokujący:`);
    const cand = [];
    const seen = new Set();
    for (const cmd of options) {
      for (const id of cmd.assignments?.[attackerId] ?? []) {
        if (!seen.has(id)) { seen.add(id); cand.push(id); }
      }
    }
    const current = blockedBy.get(attackerId) ?? [];
    for (const blockerId of cand) {
      const label = objectName(view, session, blockerId);
      renderRow(blockerId, current.includes(blockerId), false, label, (checked) => {
        const listIds = (blockedBy.get(attackerId) ?? []).filter((id) => id !== blockerId);
        if (checked) listIds.push(blockerId);
        blockedBy.set(attackerId, listIds);
      });
    }
    return wrapper;
  };

  if (isAttackers) {
    for (const id of candidateIds) {
      const label = objectName(view, session, id);
      renderRow(id, mandatory.has(id), mandatory.has(id), label, (checked) => {
        if (checked) selected.add(id); else selected.delete(id);
      });
    }
  } else {
    const attackerIds = [];
    const seen = new Set();
    for (const cmd of options) for (const id of Object.keys(cmd.assignments ?? {})) {
      if (!seen.has(id)) { seen.add(id); attackerIds.push(id); }
    }
    for (const attackerId of attackerIds) renderAttackerBlockers(attackerId);
  }

  const actions = choiceNode(host, 'div', 'choice-request-options');
  const confirm = choiceNode(actions, 'button', 'action choice-request-option combat-wizard-confirm',
    isAttackers ? 'Zatwierdź atak' : 'Zatwierdź bloki');
  confirm.type = 'button';
  confirm.addEventListener('click', () => {
    if (isAttackers) {
      const ids = candidateIds.filter((id) => selected.has(id));
      // „Can't attack alone" (Ember Beast): pojedynczy taki atakujący jest
      // nielegalny — nie wysyłamy, tylko podpowiadamy.
      const alone = ids.length === 1 && viewCreatureHasStatic(view, ids[0], 'cantAttackAlone');
      if (alone) {
        const hint = choiceNode(host, 'div', 'zone-empty', 'Ten stwór nie może atakować sam (can’t attack alone).');
        hint.className = 'zone-empty combat-wizard-error';
        return;
      }
      onComplete?.({ type: 'declare_attackers', playerId: view.playerId, attackerIds: ids });
    } else {
      // Walidacja w wizardzie: menace 0 albo >= 2; cantBlockAlone z partnerem.
      const assignments = {};
      for (const [attackerId, blockerIds] of blockedBy) {
        const attacker = (view.zones.battlefield ?? []).find((o) => o.id === attackerId);
        const menace = Boolean(attacker && (attacker.keywords ?? []).includes('menace'));
        if (menace && blockerIds.length === 1) {
          const hint = choiceNode(host, 'div', 'zone-empty', 'Atakujący z menace wymaga 0 albo co najmniej 2 blokujących.');
          hint.className = 'zone-empty combat-wizard-error';
          return;
        }
        const aloneBlock = blockerIds.length === 1 && viewCreatureHasStatic(view, blockerIds[0], 'cantBlockAlone');
        if (aloneBlock) {
          const hint = choiceNode(host, 'div', 'zone-empty', 'Ten stwór nie może blokować sam (can’t block alone).');
          hint.className = 'zone-empty combat-wizard-error';
          return;
        }
        assignments[attackerId] = blockerIds;
      }
      onComplete?.({ type: 'declare_blockers', playerId: view.playerId, assignments });
    }
  });
  const clear = choiceNode(actions, 'button', 'ghost-btn combat-wizard-clear', isAttackers ? 'Bez ataku' : 'Bez bloków');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    if (isAttackers) { for (const id of candidateIds) if (!mandatory.has(id)) selected.delete(id); }
    else { for (const key of blockedBy.keys()) blockedBy.set(key, []); }
    // prosty re-render całego wizarda
    const pendingHost = host;
    renderCombatWizard(pendingHost, { kind, view, session, options, onComplete, onCancel });
  });
  if (onCancel) {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
  }
  return host;
}

/**
 * Wizard rozdzielania obrażeń combat (CR 510.1c/d): steppery +/− przy każdym
 * blokerze (kolejność deklaracji), reguła „>= lethal przed następnym" pilnowana
 * na żywo. Trample: niewykorzystana moc idzie na gracza (pokazana).
 */
export function renderDamageWizard(host, { view, session, pending, defaultCommand, onComplete, onCancel }) {
  clearChoiceElement(host);
  choiceNode(host, 'div', 'choice-request-intro', 'Rozdziel obrażenia bojowe — przydziel moc atakujących blokującym:');
  const list = choiceNode(host, 'div', 'damage-wizard-list');
  const state = { entries: [], amounts: new Map() }; // amounts: `${attackerId}:${blockerId}` → n

  for (const entry of pending.entries) {
    const wrapper = choiceNode(list, 'div', 'damage-wizard-attacker');
    const trample = entry.trample ? ', trample' : '';
    choiceNode(wrapper, 'div', 'damage-wizard-head',
      `${session.nameOf(entry.attackerCardId)} (moc ${entry.power}${trample})`);
    const rows = choiceNode(wrapper, 'div', 'damage-wizard-blockers');
    const amounts = entry.blockers.map(() => 0);
    const remainingEl = choiceNode(wrapper, 'div', 'damage-wizard-remaining',
      entry.trample ? `do gracza: ${entry.power}` : '');
    const key = entry.attackerId;

    const sum = () => amounts.reduce((a, b) => a + b, 0);
    const canIncrease = (idx) => sum() < entry.power
      && (idx === 0 || amounts[idx - 1] >= entry.blockers[idx - 1].lethal);
    const render = () => {
      // odśwież liczniki w wierszach
      for (let idx = 0; idx < entry.blockers.length; idx += 1) {
        const b = entry.blockers[idx];
        const el = state.amounts.get(`${key}:${b.id}`);
        if (el) el.textContent = String(amounts[idx]);
      }
      remainingEl.textContent = entry.trample ? `do gracza: ${entry.power - sum()}` : '';
    };
    entry.blockers.forEach((b, idx) => {
      const row = choiceNode(rows, 'div', 'damage-wizard-row');
      choiceNode(row, 'span', 'damage-wizard-name',
        `${session.nameOf(b.cardId)} (wytrz. ${b.toughness}${b.damage ? `, obrażenia ${b.damage}` : ''}, lethal ${b.lethal})`);
      const minus = choiceNode(row, 'button', 'ghost-btn damage-wizard-minus', '−1');
      minus.type = 'button';
      const amountEl = choiceNode(row, 'span', 'damage-wizard-amount', '0');
      state.amounts.set(`${key}:${b.id}`, amountEl);
      const plus = choiceNode(row, 'button', 'ghost-btn damage-wizard-plus', '+1');
      plus.type = 'button';
      minus.addEventListener('click', () => {
        if (amounts[idx] <= 0) return;
        amounts[idx] -= 1;
        // Jeśli ten bloker spadł poniżej lethal, późniejsi nie mogą mieć
        // obrażeń (reguła kolejności CR 510.1d).
        if (amounts[idx] < b.lethal) {
          for (let j = idx + 1; j < amounts.length; j += 1) amounts[j] = 0;
        }
        render();
      });
      plus.addEventListener('click', () => {
        if (!canIncrease(idx)) return;
        amounts[idx] += 1;
        render();
      });
    });
    state.entries.push({ attackerId: key, blockers: entry.blockers, amounts });
  }

  const actions = choiceNode(host, 'div', 'choice-request-options');
  const confirm = choiceNode(actions, 'button', 'action choice-request-option damage-wizard-confirm', 'Zatwierdź przydział');
  confirm.type = 'button';
  confirm.addEventListener('click', () => {
    const assignments = {};
    for (const e of state.entries) {
      assignments[e.attackerId] = e.blockers.map((b, idx) => ({ blockerId: b.id, amount: e.amounts[idx] }));
    }
    onComplete?.({ type: 'resolve_damage_assignment', playerId: view.playerId, assignments });
  });
  if (defaultCommand) {
    const def = choiceNode(actions, 'button', 'action choice-request-option damage-wizard-default', 'Domyślnie (lethal-first)');
    def.type = 'button';
    def.addEventListener('click', () => onComplete?.(defaultCommand));
  }
  if (onCancel) {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
  }
  return host;
}
