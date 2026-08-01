import { IMAGE_MODE, cardImageSources } from './card-images.js';

/**
 * Renderowanie stołu: PlayerView + log sesji → DOM.
 *
 * Zasady granicy: moduł dostaje wyłącznie publiczny widok sesji
 * (session.view()) i nigdy nie mutuje stanu gry — akcje gracza wracają
 * do sesji przez callback `play(cmd)`. Teksty rysujemy przez textContent
 * (świadomie bez innerHTML, zob. audyt §7), żeby markup kart i komend
 * nigdy nie został zinterpretowany jako HTML.
 */

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

/** Czytelna nazwa bieżącego kroku tury. */
export function stepLabel(turn) {
  if (turn.step === 'main') return turn.phase === 'postcombat_main' ? 'Druga faza główna' : 'Faza główna';
  return STEP_LABELS[turn.step] ?? turn.step;
}

/** Opis efektów czaru do wiersza karty („Obrażenia 2, cel: stworek"). */
export function describeSpellEffects(spell) {
  if (!spell) return '';
  const parts = (spell.effects ?? []).map((effect) => {
    if (effect.type === 'damage') return `Obrażenia ${effect.amount}`;
    if (effect.type === 'pump') return `+${effect.power}/+${effect.toughness} do końca tury`;
    return effect.type;
  });
  const target = (spell.targets ?? []).length ? `cel: ${spell.targets[0].type === 'creature' ? 'stworek' : spell.targets[0].type}` : '';
  return [parts.join(' + '), target].filter(Boolean).join(' · ');
}

const ACTION_RANK = Object.freeze({
  draw_card: 0, play_land: 1, tap_for_mana: 2, cast_permanent: 3, cast_spell: 4,
  declare_attackers: 5, declare_blockers: 6, resolve_combat: 7, pass_priority: 8, concede: 9,
});

/** Etykieta przycisku akcji — po polsku, z nazwami kart i celów. */
export function commandLabel(cmd, session, view) {
  const obj = (id) => view.zones.hand.find((o) => o.id === id)
    ?? view.zones.battlefield.find((o) => o.id === id)
    ?? view.zones.stack.find((o) => o.id === id);
  const nameOfObjectId = (id) => {
    const object = obj(id);
    return object ? session.nameOf(object.cardId) : session.nameOfObject(id);
  };
  switch (cmd.type) {
    case 'draw_card': return 'Dobierz kartę';
    case 'pass_priority': return 'Dalej (pass)';
    case 'concede': return 'Poddaj partię';
    case 'play_land': return `Zagraj ląd: ${nameOfObjectId(cmd.objectId)}`;
    case 'tap_for_mana': return `Przygotuj manę: ${nameOfObjectId(cmd.objectId)}`;
    case 'cast_permanent': {
      const card = obj(cmd.objectId);
      return `Zagraj: ${nameOfObjectId(cmd.objectId)} (koszt ${card?.manaCost ?? '?'})`;
    }
    case 'cast_spell': {
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return `Rzuć: ${nameOfObjectId(cmd.objectId)}${targets ? ` → cel: ${targets}` : ''}`;
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
    default: return cmd.type;
  }
}

function line(parent, className, text) {
  const el = document.createElement('div');
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function clear(el) {
  el.textContent = '';
}

/** Prostokąt karty/permanenta widzianego na stole. */
function permanentChip(parent, object, session, { enemy, onInspect }) {
  const chip = line(parent, 'chip', '');
  const colors = session.colorsOf(object.cardId);
  if (colors?.length) chip.className += ` color-${colors[0]}`;
  if (object.kind === 'land') chip.className += ' land';
  if (object.tapped) chip.className += ' tapped';
  if (enemy) chip.className += ' enemy';
  line(chip, 'chip-name', session.nameOf(object.cardId));
  if (object.kind === 'creature') {
    const mod = (object.powerModifier || object.toughnessModifier)
      ? ` (${object.powerModifier >= 0 ? '+' : ''}${object.powerModifier}/${object.toughnessModifier >= 0 ? '+' : ''}${object.toughnessModifier})`
      : '';
    line(chip, 'chip-stats', `${object.power}/${object.toughness}${mod}`);
  }
  const flags = [];
  if (object.tapped) flags.push('⤾ zatapnięty');
  if (object.damage > 0) flags.push(`obrażenia ${object.damage}`);
  if (object.summoningSickness) flags.push('choroba przyzwania');
  if (flags.length) line(chip, 'chip-flags', flags.join(' · '));
  if (onInspect) chip.addEventListener('click', () => onInspect(object.cardId));
  return chip;
}

function graveyardChip(parent, object, session, onInspect) {
  const chip = line(parent, 'chip', '');
  const colors = session.colorsOf(object.cardId);
  if (colors?.length) chip.className += ` color-${colors[0]}`;
  line(chip, 'chip-name', session.nameOf(object.cardId));
  if (onInspect) chip.addEventListener('click', () => onInspect(object.cardId));
  return chip;
}

export function renderCardPreview(el, details, { imageMode = IMAGE_MODE.localFirst } = {}) {
  clear(el);
  if (!details) {
    line(el, 'zone-empty', 'Dotknij karty, żeby zobaczyć jej pełny opis.');
    return;
  }
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
  el.appendChild(img);
  line(el, 'preview-name', details.name);
  line(el, 'preview-line', `${details.types?.join(' ')} · zestaw ${details.set} · kolory: ${(details.colors ?? []).join(', ') || 'brak'}`);
  if (details.manaCost != null) line(el, 'preview-line', `Koszt many: ${details.manaCost}`);
  if (details.power != null) line(el, 'preview-stats', `Siła/Wytrzymałość: ${details.power}/${details.toughness}`);
  if (details.spell) line(el, 'preview-line', describeSpellEffects(details.spell));
  if (details.plan) line(el, 'preview-line', `Plan: ${details.plan}`);
}

function handChip(parent, object, session, onInspect) {
  const chip = line(parent, 'chip', '');
  const colors = session.colorsOf(object.cardId);
  if (colors?.length) chip.className += ` color-${colors[0]}`;
  if (object.kind === 'land') chip.className += ' land';
  line(chip, 'chip-name', session.nameOf(object.cardId));
  const typeLabel = object.kind === 'land' ? 'Ląd' : object.kind === 'creature' ? 'Stworek' : 'Czar';
  const cost = object.manaCost == null ? '' : ` · koszt ${object.manaCost}`;
  line(chip, 'chip-flags', `${typeLabel}${cost}`);
  if (object.kind === 'creature') line(chip, 'chip-stats', `${object.power}/${object.toughness}`);
  if (object.kind === 'spell') line(chip, 'chip-flags', describeSpellEffects(object.spell));
  if (onInspect) chip.addEventListener('click', () => onInspect(object.cardId));
  return chip;
}

/**
 * Przerysowuje cały stół z aktualnego widoku sesji.
 * @param {{ els: object, session: object, play: (cmd: object) => void }} args
 *   els: mapa elementów DOM (banner, status, stackZone, bfEnemy, bfOwn, hand, actions, log).
 */
export function renderTableView({ els, session, play, onInspect }) {
  const view = session.view();
  for (const el of Object.values(els)) clear(el);

  // --- Baner końca gry -------------------------------------------------
  if (view.status !== 'active') {
    const winner = view.players.find((p) => p.id === view.winnerId);
    line(els.banner, 'gameover', `Koniec gry — wygrywa: ${winner?.name ?? '?'} (seed ${session.state.seed})`);
  }

  // --- Pasek statusu ---------------------------------------------------
  const me = view.players.find((p) => p.id === view.playerId);
  const foe = view.players.find((p) => p.id !== view.playerId);
  const active = view.players.find((p) => p.id === view.turn.activePlayerId);
  line(els.status, 'status-turn', view.status === 'active'
    ? `Tura ${view.turn.number} · ${active?.name} · ${stepLabel(view.turn)}`
    : `Partia zakończona po ${view.turn.number} turach`);
  const foeHand = view.zones.hand.filter((o) => o.hidden).length;
  const ownLibrary = view.zones.library.filter((o) => o.controllerId === me?.id).length;
  const foeLibrary = view.zones.library.length - ownLibrary;
  line(els.status, 'status-row',
    `${me?.name}: ❤ ${me?.life} · mana ${me?.mana} · ręka ${view.zones.hand.length - foeHand} · biblioteka ${ownLibrary}`);
  line(els.status, 'status-row',
    `${foe?.name}: ❤ ${foe?.life} · ręka ${foeHand} · biblioteka ${foeLibrary}`);

  // --- Stos ------------------------------------------------------------
  if (view.zones.stack.length === 0) {
    line(els.stackZone, 'zone-empty', 'Stos pusty');
  } else {
    for (const spell of view.zones.stack) {
      const caster = view.players.find((p) => p.id === spell.controllerId);
      const targets = (spell.targets ?? []).map((id) => session.nameOfObject(id)).join(', ');
      line(els.stackZone, 'stack-item',
        `${session.nameOf(spell.cardId)} (rzuca: ${caster?.name})${targets ? ` → cel: ${targets}` : ''}`);
    }
  }

  // --- Bitwisko --------------------------------------------------------
  renderBattlefield(els.bfEnemy, view, session, foe?.id, true, onInspect);
  renderBattlefield(els.bfOwn, view, session, me?.id, false, onInspect);

  // --- Groby (strefa publiczna — inspektor stref) ----------------------
  renderGraveyard(els.graveEnemy, view, session, foe?.id, onInspect);
  renderGraveyard(els.graveOwn, view, session, me?.id, onInspect);

  // --- Ręka gracza -----------------------------------------------------
  const ownHand = view.zones.hand.filter((o) => !o.hidden);
  if (ownHand.length === 0) line(els.hand, 'zone-empty', 'Ręka pusta');
  for (const object of ownHand) handChip(els.hand, object, session, onInspect);

  // --- Akcje -----------------------------------------------------------
  const commands = view.legalCommands.slice().sort((a, b) => (ACTION_RANK[a.type] ?? 99) - (ACTION_RANK[b.type] ?? 99));
  if (view.status === 'active' && commands.length <= 1) {
    line(els.actions, 'zone-empty', 'Brak akcji — sesja przewija okna z samym passem. To nie powinno się zdarzyć; zgłoś w PR.');
  }
  for (const cmd of commands) {
    const button = document.createElement('button');
    button.className = 'action';
    if (cmd.type === 'pass_priority') button.className += ' primary';
    if (cmd.type === 'concede') button.className += ' danger';
    button.textContent = commandLabel(cmd, session, view);
    if (cmd.type === 'concede') {
      button.addEventListener('click', () => { if (window.confirm('Na pewno poddać partię?')) play(cmd); });
    } else {
      button.addEventListener('click', () => play(cmd));
    }
    els.actions.appendChild(button);
  }

  // --- Log -------------------------------------------------------------
  const entries = session.log.slice(-80).reverse();
  for (const entry of entries) line(els.log, `log-${entry.kind}`, entry.text);
}

function renderBattlefield(zone, view, session, controllerId, enemy, onInspect) {
  const mine = view.zones.battlefield.filter((o) => o.controllerId === controllerId);
  if (mine.length === 0) {
    line(zone, 'zone-empty', enemy ? 'Przeciwnik nie ma permanentów' : 'Nie masz permanentów');
    return;
  }
  const lands = mine.filter((o) => o.kind === 'land');
  const creatures = mine.filter((o) => o.kind !== 'land');
  if (creatures.length) line(zone, 'zone-label', 'Stworki:');
  for (const object of creatures) permanentChip(zone, object, session, { enemy, onInspect });
  if (lands.length) line(zone, 'zone-label', `Lądy (${lands.length}):`);
  for (const object of lands) permanentChip(zone, object, session, { enemy, onInspect });
}

function renderGraveyard(zone, view, session, controllerId, onInspect) {
  const pile = view.zones.graveyard.filter((o) => o.controllerId === controllerId);
  if (pile.length === 0) {
    line(zone, 'zone-empty', 'Grób pusty');
    return;
  }
  for (const object of pile) graveyardChip(zone, object, session, onInspect);
}
