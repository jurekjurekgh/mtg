import {
  IMAGE_MODE, cardImageSources, hoverImageSources, hoverModeLabel, hoverPreviewShape,
  nextHoverMode, tileImageSources,
} from './card-images.js';

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
  cast_spell: 'Rzucenie czaru',
  activate_ability: 'Aktywacja zdolności',
  resolve_combat: 'Rozstrzygnięcie walki',
  resolve_scry: 'Scry',
  resolve_backup: 'Backup (wybór celu)',
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

/** Opis efektów czaru do wiersza karty („Obrażenia 2, cel: stworek”). */
export function describeSpellEffects(spell) {
  if (!spell) return '';
  const parts = (spell.effects ?? []).map((effect) => {
    if (effect.type === 'damage') return `Obrażenia ${effect.amount}`;
    if (effect.type === 'pump') return `+${effect.power}/+${effect.toughness} do końca tury`;
    if (effect.type === 'create_token') return `Stwórz ${effect.power}/${effect.toughness} ${effect.name ?? 'token'}`;
    return effect.type;
  });
  const target = (spell.targets ?? []).length ? `cel: ${spell.targets[0].type === 'creature' ? 'stworek' : spell.targets[0].type}` : '';
  return [parts.join(' + '), target].filter(Boolean).join(' · ');
}

const ACTION_RANK = Object.freeze({
  resolve_backup: -2, resolve_scry: -1, draw_card: 0, play_land: 1, tap_for_mana: 2, cast_permanent: 3, cast_spell: 4, activate_ability: 4,
  declare_attackers: 5, declare_blockers: 6, resolve_combat: 7, pass_priority: 8, concede: 9,
});

/** Polskie nazwy keywordów do pola reguł. */
const KEYWORD_LABELS = Object.freeze({
  flying: 'Latanie', vigilance: 'Czujność', transform: 'Transform', reach: 'Zasięg',
  haste: 'Pośpiech', menace: 'Postrach', lifelink: 'Dotykanie życia', deathtouch: 'Dotykanie śmierci',
  trample: 'Zadeptywanie', first_strike: 'Pierwsze uderzenie',
});

/** Czytelny opis pojedynczego efektu. */
function describeEffect(e) {
  if (e.type === 'pump') return `+${e.power ?? 0}/+${e.toughness ?? 0} do końca tury`;
  if (e.type === 'create_token') return `stwórz token ${e.name ?? ''}`;
  if (e.type === 'damage') return `${e.amount} obrażeń`;
  if (e.type === 'gain_life') return `zyskaj ${e.amount} życia`;
  if (e.type === 'remove_counter') return `usuń licznik ${e.counter}`;
  if (e.type === 'add_counter') return `połóż licznik ${e.counter}`;
  if (e.type === 'exile_permanent') return 'wygnij artefakt/enchantment';
  if (e.type === 'tap_permanent') return 'tap';
  if (e.type === 'lock_untap') return 'blokada odkręcania (póki źródło zatapnięte)';
  if (e.type === 'pay_mana') return `zapłać ${e.amount} many`;
  if (e.type === 'pay_life') return `zapłać ${e.amount} życia`;
  if (e.type === 'return_permanent_from_graveyard') return `wróć nonland permanent z grobu${e.finalityCounter ? ' z finality' : ''}`;
  if (e.type === 'transform') return 'transform (obróć kartę)';
  if (e.type === 'scry') return `Scry ${e.amount ?? 1} (podejrzyj wierzch biblioteki, możesz odłożyć na spód)`;
  if (e.type === 'sacrifice_permanent') return 'poświęć ten permanent';
  return 'efekt';
}

/** Czytelny opis zdolności aktywowanej (koszt + cele + efekty). */
function describeAbility(ability) {
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const parts = effects.filter(Boolean).map(describeEffect);
  const target = (ability?.targets ?? [])[0];
  const targetText = target?.type === 'creature' ? 'cel: stwór' : (target ? `cel: ${target.type}` : '');
  const cost = ability?.cost ?? {};
  const costText = [
    cost.manaX ? '{X}' : (cost.mana ? `{${cost.mana}}` : ''),
    cost.tap ? '{T}' : '',
  ].filter(Boolean).join(', ');
  return [costText, targetText, parts.join(' + ')].filter(Boolean).join(': ');
}

/** Czytelny opis zdolności triggerowanej (np. „Gdy ta karta umrze: zyskaj 2 życia”). */
function describeTriggered(ability) {
  const trigger = ability?.trigger ?? {};
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const parts = effects.filter(Boolean).map(describeEffect).join(', ');
  if (trigger.event === 'dies') return `Gdy ta karta umrze: ${parts}.`;
  if (trigger.event === 'combat_damage_to_player') return `Gdy zada obrażenia graczowi: ${parts}.`;
  if (trigger.event === 'enter_battlefield' && trigger.sacrificeIfUnpaid) return `Gdy wejdzie na bitwisko: zapłać {${trigger.payMana ?? 0}} albo ją poświęć (płatność automatyczna).`;
  if (trigger.event === 'enter_battlefield') return `Gdy wejdzie na bitwisko: ${parts}.`;
  if (trigger.event === 'attacks') return `Gdy atakuje: ${parts}.`;
  if (trigger.event === 'bat_attacks') return `Gdy nietoperz, który kontrolujesz, atakuje: ${parts}.`;
  if (trigger.event === 'upkeep') return `Na początku upkeep (${trigger.condition?.noSpellsLastTurn ? 'gdy wcześniej nie rzucano czarów' : 'gdy rzucono 2+ czary'}): ${parts}.`;
  return `Trigger ${trigger.event}: ${parts}.`;
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
      return describeAbility(a);
    }).join('  ·  ')
    : '';
  const spellLine = info.spell ? describeSpellEffects(info.spell) : '';
  const morphLine = info.morph && info.morph.megamorphCost != null
    ? `Megamorph {${info.morph.megamorphCost}}: możesz zagrać twarzą w dół jako 2/2 za {${info.morph.cost}}, potem obrócić za koszt megamorph (+1/+1)`
    : '';
  const landLine = info.kind === 'land' ? 'T: dodaj 1 manę' : '';
  return [keywordLine, spellLine, abilityLine, morphLine, landLine].filter(Boolean).join(' · ');
}

/** Etykieta przycisku akcji — po polsku, z nazwami kart i celów.
 *  UWAGA: prefiksy („Dobierz kartę\", „Zagraj ląd\", „Rzuć:\"…) są częścią
 *  kontraktu testu UI — ikony dodajemy wyłącznie przez CSS (::before). */
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
      if (cmd.bestow) {
        const host = nameOfObjectId(cmd.targets?.[0]);
        return `Zagraj za bestow: ${nameOfObjectId(cmd.objectId)} (koszt ${card?.bestow?.cost ?? '?'}) → zaczaruj ${host}`;
      }
      if (cmd.targets?.length && card?.aura) {
        const host = nameOfObjectId(cmd.targets[0]);
        return `Zagraj aurę: ${nameOfObjectId(cmd.objectId)} (koszt ${card?.manaCost ?? '?'}) → zaczaruj ${host}`;
      }
      if (cmd.faceDown) return `Zagraj: ${nameOfObjectId(cmd.objectId)} twarzą w dół (2/2, koszt ${card?.morph?.cost ?? '?'})`;
      return `Zagraj: ${nameOfObjectId(cmd.objectId)} (koszt ${card?.manaCost ?? '?'})`;
    }
    case 'cast_spell': {
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      return `Rzuć: ${nameOfObjectId(cmd.objectId)}${targets ? ` → cel: ${targets}` : ''}`;
    }
    case 'activate_ability': {
      const object = obj(cmd.objectId);
      const ability = (object && object.cardId ? session.abilitiesOf(object.cardId) : [])[cmd.abilityIndex];
      if (ability?.keyword === 'ninjutsu') {
        const attacker = cmd.attackerId ? view.zones.battlefield.find((o) => o.id === cmd.attackerId) : null;
        return `Ninjutsu: ${nameOfObjectId(cmd.objectId)} (wróć ${attacker ? session.nameOf(attacker.cardId) : cmd.attackerId})`;
      }
      if (ability?.keyword === 'cycling') {
        const kinds = Object.keys(ability.cycling ?? {}).flatMap((guard) => ability.cycling[guard] ?? []);
        return `Cycling: ${nameOfObjectId(cmd.objectId)} (koszt ${ability.cost?.mana ?? '?'}) → szukaj: ${kinds.join(' lub ')}`;
      }
      if (ability?.keyword === 'equip') {
        const target = nameOfObjectId(cmd.targets?.[0]);
        return `Wyposaż: ${nameOfObjectId(cmd.objectId)} → ${target} (koszt ${ability.cost?.mana ?? '?'})`;
      }
      if (object?.faceDown) return `Obróć twarzą do góry: ${nameOfObjectId(cmd.objectId)} (megamorph)`;
      const targets = (cmd.targets ?? []).map((id) => nameOfObjectId(id)).join(', ');
      const xPart = cmd.xValue != null ? ` (X=${cmd.xValue})` : '';
      return `Aktywuj: ${nameOfObjectId(cmd.objectId)} — ${describeAbility(ability)}${xPart}${targets ? ` → cel: ${targets}` : ''}`;
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
    default: return cmd.type;
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
    damage: object.damage || 0,
    spell: details.spell || object.spell,
    abilities: faceDown ? [] : (details.abilities || []),
    morph: details.morph || null,
    attachedTo: object.attachedTo ?? null,
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
    if (info.attachedAura) flags.push('aura załączona');
    if (info.attachedEquipment) flags.push('wyposaża');
    if (info.damage > 0) flags.push(`obrażenia ${info.damage}`);
    if (info.summoningSickness) flags.push('choroba');
    if (flags.length) {
      const badges = div(face, 'fbadges');
      for (const f of flags) {
        div(badges, 'fbadge' + (f.startsWith('obrażenia') ? ' dmg' : ' sick'), f);
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
  if (opts.onCardClick) wrap.addEventListener('click', () => opts.onCardClick(info.objectId, info.cardId));
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
    if (info.damage > 0) flags.push(['dmg', `−${info.damage}`]);
    if (info.summoningSickness) flags.push(['sick', 'choroba']);
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
 *   onCardClick: (objectId: string, cardId: string) => void }} args
 */
export function renderTableView({ els, session, play, onCardClick, hoverMode = 'scryfall', onHoverModeChange = null }) {
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
      div(els.stackZone, 'stack-item',
        `${session.nameOf(spell.cardId)} (rzuca: ${caster?.name})${targets ? ` → cel: ${targets}` : ''}`);
    }
  }

  // --- Bitwiska (wróg u góry, Ty na dole) ------------------------------
  renderBattlefield(els.bfEnemy, view, session, foe?.id, true, onCardClick, hover);
  renderBattlefield(els.bfOwn, view, session, me?.id, false, onCardClick, hover);

  // --- Groby i exile (warstwa inspektora stref) ------------------------
  renderZonePile(els.graveOwn, view, session, me?.id, onCardClick, hover);
  renderZonePile(els.graveEnemy, view, session, foe?.id, onCardClick, hover);
  renderExile(els.exileZone, view, session, onCardClick, hover);

  // --- Ręka gracza -----------------------------------------------------
  const ownHandObjects = view.zones.hand.filter((o) => !o.hidden);
  if (ownHandObjects.length === 0) div(els.hand, 'zone-empty', 'Ręka pusta');
  for (const object of ownHandObjects) {
    tile(els.hand, cardInfo(session, object), { session, size: 'sm', onCardClick, hover });
  }

  // --- Akcje -----------------------------------------------------------
  const commands = view.legalCommands.slice().sort((a, b) => (ACTION_RANK[a.type] ?? 99) - (ACTION_RANK[b.type] ?? 99));
  if (els.actionsCount) els.actionsCount.textContent = commands.length ? `${commands.length}` : '';
  if (view.status === 'active' && commands.length <= 1) {
    div(els.actions, 'zone-empty', 'Brak akcji — sesja przewija okna z samym passem. To nie powinno się zdarzyć; zgłoś w PR.');
  }
  for (const cmd of commands) {
    const button = document.createElement('button');
    button.className = 'action';
    if (cmd.type === 'pass_priority') button.className += ' primary';
    if (cmd.type === 'concede') button.className += ' danger';
    // Etykieta wyłącznie tekstem (prefiksy są kontraktem testu); ikona przez CSS.
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
}

function renderBattlefield(host, view, session, controllerId, enemy, onCardClick, hover) {
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
        session, onCardClick, hover, extraClass: enemy ? 'enemy' : '',
      });
    }
  }
}

function renderZonePile(host, view, session, controllerId, onCardClick, hover) {
  const pile = view.zones.graveyard.filter((o) => o.controllerId === controllerId);
  if (pile.length === 0) {
    div(host, 'zone-empty', 'Grób pusty');
    return;
  }
  for (const object of pile) tile(host, cardInfo(session, object), { session, onCardClick, hover });
}

function renderExile(host, view, session, onCardClick, hover) {
  const pile = view.zones.exile || [];
  if (!pile.length) {
    div(host, 'zone-empty', 'Exile pusty');
    return;
  }
  for (const object of pile) tile(host, cardInfo(session, object), { session, onCardClick, hover });
}
