import { event } from '../protocol/types.js';

/**
 * Załączniki — aury (bestow i czyste) oraz equipmenty (CR 301.5, 303.4,
 * 702.6, 702.103).
 *
 * Model:
 * - AURA (bestow albo czysta): na polu bitwy z `attachedTo` = zaczarowany stwór
 *   i `kind: 'aura'` — dopóki jest załączona, NIE jest stworem; `baseKind`
 *   pamięta pierwotny kind (bestow: 'creature', czysta aura: 'enchantment').
 * - EQUIPMENT: artefakt (`kind: 'artifact'`) z `attachedTo` — załączenie nie
 *   zmienia jego kind; może wisieć na polu bitwy odłączony.
 * - Zaczarowany/wyposażony stwór dostaje buff z deskryptora źródła
 *   (bestow/aura/equipment: pump + keywordy) — patrz attachmentGrant i
 *   permanents.effective*; buff liczony uproszczoną warstwą CR 613.
 * - Utrata gospodarza (zginał, wygnany, odszedł):
 *   bestow    → odłącza się i zostaje na polu bitwy jako stwór (CR 702.103b);
 *   equipment → odłącza się i zostaje na polu bitwy (CR 704.5n);
 *   czysta aura → trafia do grobu (CR 704.5m — aura bez legalnego
 *   zaczarowanego obiektu jest niszczona).
 * - Gdy gospodarz przestaje być stworem na polu bitwy (SBA po każdej komendzie):
 *   identyczne polityki jak przy utracie gospodarza.
 * - „enchant creature" obejmuje KAŻDEGO stwora na polu bitwy (deskryptor nie
 *   ogranicza kontrolera); equip celuje wyłącznie we własne stwory (CR 702.6a
 *   — „target creature you control", pilnowane w abilities.js).
 */

function patchAttachmentObject(state, object, patch) {
  const updated = Object.freeze({ ...object, ...patch });
  state.objects.set(object.id, updated);
  return updated;
}

/** Deskryptor buffu załączonego obiektu (z którejkolwiek rodziny). */
export function attachmentGrant(object) {
  const descriptor = object?.bestow ?? object?.aura ?? object?.equipment ?? null;
  if (!descriptor) return { power: 0, toughness: 0, keywords: [] };
  const result = {
    power: descriptor.pump?.power ?? 0,
    toughness: descriptor.pump?.toughness ?? 0,
    keywords: [...(descriptor.keywords ?? [])],
    subtypes: [...(descriptor.subtypes ?? [])],
  };
  // Conditional keywords (Hunter's Blowgun): different keywords based on
  // a condition evaluated at read time (state required). Only included when
  // non-empty to preserve backward compatibility with existing tests.
  if (descriptor.conditionalKeywords && descriptor.conditionalKeywords.length > 0) {
    result.conditionalKeywords = [...descriptor.conditionalKeywords];
  }
  // Protection from color (Benevolent Blessing): aura z chosenColor nadaje
  // gospodarzowi ochronę przed tym kolorem.
  if (descriptor.chosenColor) {
    result.protectionFromColors = [descriptor.chosenColor];
  }
  return result;
}

/** Wszystkie załączniki przypięte do danego obiektu (aury + equipmenty). */
export function attachmentsAttachedTo(state, hostId) {
  const attachments = [];
  for (const object of state.objects.values()) {
    if (object.zone === 'battlefield' && object.attachedTo === hostId) attachments.push(object);
  }
  return attachments;
}

/** Aury załączone do danego obiektu (podzbiór attachmentsAttachedTo). */
export function aurasAttachedTo(state, hostId) {
  return attachmentsAttachedTo(state, hostId).filter((object) => object.kind === 'aura');
}

/** Czy obiekt jest załączoną aurą (nie jest wtedy stworem/enchantmentem). */
export function isAttachedAura(object) {
  return object?.kind === 'aura' && typeof object.attachedTo === 'string';
}

/** Czy obiekt jest załączonym equipmentem (pozostaje artefaktem). */
export function isAttachedEquipment(object) {
  return Boolean(object?.equipment) && typeof object?.attachedTo === 'string' && object.zone === 'battlefield';
}

/**
 * Legalność gospodarza dla załącznika (CR 303.4, 702.6, Batch 23 — Feedback:
 * „Enchant enchantment"). Deskryptor aury (`enchant` / `enchantType`) określa
 * dozwoloną klasę gospodarza:
 * - `enchantment`            → enchantment na polu bitwy (Feedback);
 * - `artifact_or_creature`   → artefakt LUB stwór (panoply, np. Hammerhand);
 * - brak / `creature`        → stwór (zwykłe aury i bestow);
 * - equipment               → stwór (CR 702.6a).
 * Wspólne źródło prawdy dla oferty (resources.legalAuraCasts), walidacji
 * rzutu (resources.castAuraSpell), rozstrzygnięcia (spells.resolveAuraSpell)
 * i SBA „aura bez legalnego zaczarowanego obiektu" (removeIllegalAttachments)
 * — bez tego Feedback dałoby się oferować, ale nie rzucić (SBA niszczyłby aurę).
 */
export function isLegalAuraHost(attachment, host) {
  if (!host || host.zone !== 'battlefield') return false;
  const descriptor = attachment?.aura ?? attachment?.bestow ?? attachment?.equipment ?? null;
  const enchantKind = descriptor?.enchant ?? descriptor?.enchantType ?? 'creature';
  if (enchantKind === 'enchantment') {
    return host.kind === 'enchantment' || (host.types ?? []).includes('Enchantment');
  }
  if (enchantKind === 'artifact_or_creature') {
    return host.kind === 'creature' || host.kind === 'artifact' || (host.types ?? []).includes('Artifact');
  }
  // Chronic Flooding (RTR): „Enchant land" — gospodarzem jest LAND.
  if (enchantKind === 'land') {
    return host.kind === 'land' || (host.types ?? []).includes('Land');
  }
  if (enchantKind === 'creature_or_land') {
    const isLand = host.kind === 'land' || (host.types ?? []).includes('Land');
    return host.kind === 'creature' || isLand;
  }
  // M154 (Batch 38): „Enchant creature or Vehicle" (Silken Strength) —
  // stwór LUB Vehicle (artefakt z podtypem Vehicle; przed crew to nie stwór).
  if (enchantKind === 'creature_or_vehicle') {
    const isVehicle = (host.subtypes ?? []).includes('Vehicle');
    return host.kind === 'creature' || isVehicle;
  }
  // Zwykła aura / bestow / equipment — wyłącznie stwory.
  return host.kind === 'creature';
}

/** Zaczarowany/wyposażony stwór (gospodarz załącznika) albo null. */
export function enchantedObject(state, attachment) {
  if (typeof attachment?.attachedTo !== 'string') return null;
  return state.objects.get(attachment.attachedTo) ?? null;
}

function emitAttached(state, attachment, hostId, via) {
  state.events.push(event('object_attached', {
    objectId: attachment.id, hostId, cardId: attachment.cardId,
    controllerId: attachment.controllerId,
    hostCardId: state.objects.get(hostId)?.cardId ?? null,
    via,
  }));
}

/**
 * Załącza aurę do stwora przy wejściu na pole bitwy (rozstrzygnięcie czaru
 * aury — bestow albo czystej). Załączona aura przestaje być stworem;
 * obrażenia i liczniki z czasu bycia stworem zerujemy (CR 702.103a).
 */
export function attachAuraToCreature(state, auraId, hostId) {
  const aura = state.objects.get(auraId);
  const host = state.objects.get(hostId);
  if (!aura || aura.zone !== 'battlefield' || (!aura.bestow && !aura.aura)) {
    throw new Error('Załączyć można tylko aurę na polu bitwy');
  }
  if (auraId === hostId) throw new Error('Aura nie może zaczarować samej siebie');
  if (!isLegalAuraHost(aura, host)) throw new Error(`Aura nie ma legalnego gospodarza na polu bitwy (${aura.aura?.enchant ?? aura.aura?.enchantType ?? 'creature'})`);
  const updated = patchAttachmentObject(state, aura, {
    attachedTo: hostId,
    baseKind: aura.baseKind ?? aura.kind,
    kind: 'aura',
    powerModifier: 0, toughnessModifier: 0, damage: 0,
    counters: {},
    summoningSickness: true, // po odłączeniu (bestow) jako stwór obowiązuje choroba atakowa
  });
  emitAttached(state, updated, hostId, updated.bestow ? 'bestow' : 'aura');
  return updated;
}

/**
 * Załącza equipment do stwora (rozstrzygnięcie equip, CR 702.6): equipment
 * pozostaje artefaktem; był załączony gdzie indziej — przechodzi na nowego
 * gospodarza (re-equip w obrębie własnych stworów).
 */
export function attachEquipmentToCreature(state, equipmentId, hostId) {
  const equipment = state.objects.get(equipmentId);
  const host = state.objects.get(hostId);
  if (!equipment || equipment.zone !== 'battlefield' || !equipment.equipment) {
    throw new Error('Equip działa tylko na equipment na polu bitwy');
  }
  if (equipmentId === hostId) throw new Error('Equipment nie może wyposażyć samego siebie');
  if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') throw new Error('Wyposażyć można tylko stwora na polu bitwy');
  // M110 (CR 702.16c): permanent z ochroną przed jakością equipmentu nie może
  // być nim wyposażony (ochrona kolorowa ma tę bramkę w SBA/ofercie equipu).
  if (isProtectedFromSource(state, host, equipment)) {
    throw new Error('Chroniony stwór nie może zostać wyposażony tym equipmentem');
  }
  const updated = patchAttachmentObject(state, equipment, { attachedTo: hostId });
  emitAttached(state, updated, hostId, 'equip');
  return updated;
}

/**
 * Polityka „co z załącznikiem, który stracił gospodarza" (utrata obiektu
 * z pola bitwy albo gospodarz przestał być stworem).
 */
function detachOrphanedAttachment(state, attachment, hostId, events) {
  if (attachment.bestow) {
    // Bestow (CR 702.103b): aura odłącza się i znów jest stworem — zostaje.
    const updated = patchAttachmentObject(state, attachment, {
      attachedTo: null,
      kind: attachment.baseKind ?? 'creature',
      baseKind: null,
    });
    const e = event('object_detached', {
      objectId: attachment.id, fromHostId: hostId, cardId: updated.cardId,
      controllerId: updated.controllerId, becameKind: updated.kind,
    });
    state.events.push(e); events.push(e);
    return;
  }
  if (attachment.equipment) {
    // Equipment (CR 704.5n): odłącza się i ZOSTAJE na polu bitwy.
    const updated = patchAttachmentObject(state, attachment, { attachedTo: null });
    const e = event('object_detached', {
      objectId: attachment.id, fromHostId: hostId, cardId: updated.cardId,
      controllerId: updated.controllerId, becameKind: updated.kind,
    });
    state.events.push(e); events.push(e);
    return;
  }
  // Czysta aura (CR 704.5m): bez legalnego zaczarowanego obiektu trafia
  // do grobu właściciela. Ruch zrealizowany wprost (bez moveObjectDirectly,
  // żeby nie tworzyć cyklu attachments → objects → attachments).
  // Root cause (Batch 24, ujawnione przez Feedback na aury Hobble): aura
  // opuszczająca pole bitwy musi NAJPIERW odczepić WŁASNE załączniki — inaczej
  // Feedback (aura na enchantment) wisiałby na usuniętym obiekcie
  // („załącznik wskazuje nieistniejącego gospodarza"). To samo robi
  // moveObjectDirectly dla zwykłych ruchów; tu ruch jest ręczny.
  detachAttachmentsFromHost(state, attachment.id);
  const graveId = `grave-${state.objectSequence++}`;
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== attachment.id);
  state.zones.graveyard.push(graveId);
  const moved = Object.freeze({
    ...attachment, id: graveId, zone: 'graveyard',
    damage: 0, powerModifier: 0, toughnessModifier: 0, chosenTargets: null,
    counters: {}, faceDown: false,
    attachedTo: null,
    kind: attachment.baseKind ?? 'enchantment',
    baseKind: null,
  });
  state.objects.delete(attachment.id);
  state.objects.set(graveId, moved);
  const e = event('permanent_put_into_graveyard', {
    fromId: attachment.id, toId: graveId, cardId: moved.cardId,
    controllerId: moved.controllerId, reason: 'aura_without_legal_host',
  });
  state.events.push(e); events.push(e);
}

/**
 * Odłącza wszystkie załączniki wskazujące dany obiekt (gospodarz opuszcza
 * pole bitwy). Wywoływane z moveObjectDirectly — attachedTo nigdy nie wskazuje
 * obiektu spoza pola bitwy (pilnuje tego inwariant). Zwraca zdarzenia.
 */
export function detachAttachmentsFromHost(state, hostId) {
  const events = [];
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield' || object.attachedTo !== hostId) continue;
    detachOrphanedAttachment(state, object, hostId, events);
  }
  return events;
}

/**
 * SBA 704.5m/704.5n/303.4c: załącznik, którego gospodarz przestał być
 * dopuszczalny (przestał być stworem na polu bitwy), jest rozłączany zgodnie
 * z polityką rodziny (bestow→stwór, equipment→zostaje, czysta aura→grób).
 * Gospodarz opuszczający pole bitwy jest obsłużony w samej zmianie strefy
 * (detachAttachmentsFromHost).
 */
/**
 * Protection from colors (CR 702.16): lista kolorów, przed którymi obiekt
 * jest chroniony — z pól obiektu (protectionFromColors) i z załączników
 * (aura z chosenColor). Nie modyfikuje zamrożonego obiektu.
 * Zdefiniowane tu (nie w permanents.js) żeby uniknąć cyklu importów.
 */
export function effectiveProtectionFromColors(state, object) {
  if (!state || !object || object.zone !== 'battlefield') return [];
  const colors = new Set(object.protectionFromColors ?? []);
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const grant = attachmentGrant(attachment);
    for (const color of grant.protectionFromColors ?? []) colors.add(color);
  }
  return colors.size > 0 ? [...colors] : [];
}

/**
 * M109/M110: ochrona przed JAKOŚCIĄ (CR 702.16 — „protection from [quality]").
 * Kolorowa ochrona ma własną, starszą ścieżkę (protectionFromColors);
 * tutaj żyją jakości opisane deskryptorem: rodzaj obiektu (`kind`), podtyp
 * (`subtype`) i zaprzeczony podtyp (`notSubtype` — Spare from Evil:
 * „non-Human creatures"). Deskryptor jest generyczny, bez nazw kart (ADR 0002).
 */
export function effectiveProtectionQualities(state, object) {
  if (!state || !object || object.zone !== 'battlefield') return [];
  const out = [];
  for (const grant of state.untilEndOfTurnProtections ?? []) {
    if (Array.isArray(grant.objectIds) && !grant.objectIds.includes(object.id)) continue;
    if (grant.quality) out.push(grant.quality);
  }
  return out;
}

/** Czy ŹRÓDŁO ma jakość, przed którą chroni deskryptor (CR 702.16b–e). */
export function sourceHasProtectionQuality(quality, source) {
  if (!quality || !source) return false;
  if (quality.kind === 'creature') {
    const isCreature = source.kind === 'creature' || (source.types ?? []).includes('Creature');
    if (!isCreature) return false;
  }
  if (quality.subtype && !(source.subtypes ?? []).includes(quality.subtype)) return false;
  if (quality.notSubtype && (source.subtypes ?? []).includes(quality.notSubtype)) return false;
  if (Array.isArray(quality.colors) && !quality.colors.some((c) => (source.colors ?? []).includes(c))) return false;
  return true;
}

/** Czy `target` jest chroniony przed `source` jakością (nie kolorem). */
export function isProtectedFromSource(state, target, source) {
  const qualities = effectiveProtectionQualities(state, target);
  if (qualities.length === 0) return false;
  return qualities.some((quality) => sourceHasProtectionQuality(quality, source));
}

export function removeIllegalAttachments(state) {
  const events = [];
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield' || object.attachedTo == null) continue;
    const host = state.objects.get(object.attachedTo);
    const hostLegal = isLegalAuraHost(object, host);
    if (!hostLegal) {
      detachOrphanedAttachment(state, object, object.attachedTo, events);
      continue;
    }
    // Protection (CR 702.16b): aura/equipment of the protected color
    // should be detached. General rule: ALL attachments of the protected
    // color fall off.
    // M141/C (Benevolent Blessing — Oracle: "This effect doesn't remove
    // Auras and Equipment you control that are already attached to it."):
    // aura z flagą keepOwnAttachmentsOnProtection nie zdejmuje własnych
    // (tego samego kontrolera co gospodarz) załączników tego koloru,
    // które już były przypięte. Generycznie po deskryptorze, nie po nazwie
    // karty (ADR 0002). Wyjątek dotyczy wyłącznie ochrony od koloru
    // (chosenColor) tej aury — inne źródła ochrony (np. Spare from Evil)
    // zachowują ogólne zachowanie.
    const protColors = effectiveProtectionFromColors(state, host);
    if (protColors.length > 0) {
      const attachColors = object.colors ?? [];
      const matchingColors = attachColors.filter(c => protColors.includes(c));
      if (matchingColors.length > 0) {
        // Czy któraś z chronionych barw pochodzi z aury z flagą keepOwn,
        // przypiętej do tego samego gospodarza i kontrolowanej przez tego
        // samego gracza co gospodarz i załącznik?
        const hostAttachments = attachmentsAttachedTo(state, host.id);
        const hasKeepingAuraForColor = (color) => hostAttachments.some(a =>
          a.aura?.keepOwnAttachmentsOnProtection && a.aura?.chosenColor === color
          && a.controllerId === host.controllerId && a.zone === 'battlefield' && a.attachedTo === host.id
        );
        const isOwn = object.controllerId === host.controllerId;
        const allKept = isOwn && matchingColors.every(hasKeepingAuraForColor);
        if (!allKept) {
          detachOrphanedAttachment(state, object, object.attachedTo, events);
          continue;
        }
        // Jeśli wszystkie pasujące kolory są pokryte keepOwn, a załącznik
        // jest własny — nie zdejmujemy (wyjątek Benevolent Blessing).
        // Załącznik przeciwnika (isOwn === false) spada normalnie.
        if (!isOwn) {
          detachOrphanedAttachment(state, object, object.attachedTo, events);
          continue;
        }
      }
    }
    // M110 (CR 702.16c): ochrona przed JAKOŚCIĄ zdejmuje też załączniki
    // mające tę jakość (np. „protection from Equipment").
    if (isProtectedFromSource(state, host, object)) {
      detachOrphanedAttachment(state, object, object.attachedTo, events);
    }
  }
  return events;
}
