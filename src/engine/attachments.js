import { event } from '../protocol/types.js';
import { deathZoneFor } from './zones.js';
import { moveObject } from './mover.js';
import { nextTimestamp } from './timestamps.js';

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
 *   bestow    → odłącza się i zostaje na polu bitwy jako stwór (CR 702.103f);
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
  // D4b (CR 613.7e): „An Aura, Equipment, or Fortification receives a new
  // timestamp each time it becomes attached to an object or player.” Choke
  // point przypięć — znacznik porządkuje efekty załącznika w warstwach 4/6.
  // CR 701.3b/701.3c: przypięcie do TEGO SAMEGO obiektu „does nothing” —
  // nowy znacznik tylko przy zmianie celu (probe U9: jedyna zmiana to koszt).
  const nextTarget = 'attachedTo' in patch ? patch.attachedTo ?? null : object.attachedTo ?? null;
  const nextPlayer = 'enchantedPlayerId' in patch ? patch.enchantedPlayerId ?? null : object.enchantedPlayerId ?? null;
  const moved = nextTarget !== (object.attachedTo ?? null) || nextPlayer !== (object.enchantedPlayerId ?? null);
  const stamp = !moved ? {}
    : { attachedTs: (nextTarget != null || nextPlayer != null) ? nextTimestamp(state) : null };
  const updated = Object.freeze({ ...object, ...patch, ...stamp });
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
  if (descriptor.combatDamageByToughness) result.combatDamageByToughness = true;
  if (descriptor.umbraArmor) result.umbraArmor = true;
  if (descriptor.doesntUntap) result.doesntUntap = true;
  // Conditional keywords (Hunter's Blowgun): different keywords based on
  // a condition evaluated at read time (state required). Only included when
  // non-empty to preserve backward compatibility with existing tests.
  // Batch 56 (Bonds of Faith): warunkowy pump („gets +2/+2 as long as it's a
  // Human") — L21: bez przepisania pola ginie po cichu na obiekcie gry.
  if (descriptor.conditionalPump && descriptor.conditionalPump.length > 0) {
    result.conditionalPump = [...descriptor.conditionalPump];
  }
  if (descriptor.conditionalKeywords && descriptor.conditionalKeywords.length > 0) {
    result.conditionalKeywords = [...descriptor.conditionalKeywords];
  }
  // Protection from color (Benevolent Blessing): aura z chosenColor nadaje
  // gospodarzowi ochronę przed tym kolorem.
  if (descriptor.chosenColor) {
    result.protectionFromColors = [descriptor.chosenColor];
  }
  // Batch 46 (Guildscorn Ward): TRWAŁA ochrona przed JAKOŚCIĄ źródła
  // (CR 702.16b–f, „protection from multicolored"). Dotąd jakość mogła
  // pochodzić tylko z grantu „until end of turn" (Spare from Evil) —
  // aura potrzebuje tej samej reguły bez daty ważności.
  if (descriptor.protection) {
    result.protection = { ...descriptor.protection };
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
// Jedno miejsce czytania deskryptora załącznika (aura → bestow → equipment):
// predykaty gospodarza i walidacja SBA muszą czytać TEN SAM deskryptor,
// inaczej „ownControlOnly" zniknie w jednej ścieżce (M210/3).
export function auraDescriptor(attachment) {
  return attachment?.aura ?? attachment?.bestow ?? attachment?.equipment ?? null;
}

export function auraEnchantKind(attachment) {
  const descriptor = auraDescriptor(attachment);
  return descriptor?.enchant ?? descriptor?.enchantType ?? 'creature';
}

export function isLegalAuraHost(attachment, host) {
  if (!host || host.zone !== 'battlefield') return false;
  const enchantKind = auraEnchantKind(attachment);
  if (enchantKind === 'enchantment') {
    return host.kind === 'enchantment' || (host.types ?? []).includes('Enchantment');
  }
  if (enchantKind === 'artifact_or_creature') {
    const isArtOrCreature = host.kind === 'creature' || host.kind === 'artifact' || (host.types ?? []).includes('Artifact');
    if (!isArtOrCreature) return false;
    // „Enchant artifact or creature YOU CONTROL” (Moonlit Meditation) vs
    // „Enchant artifact or creature” (Clawing Torment). Rozróżnia deskryptor
    // `ownControlOnly` — dokładnie ten sam, którego używa walidacja rzucania
    // w resources.js. Wcześniej czytała go TYLKO tamta ścieżka, więc SBA
    // (CR 704.5n) nie zrzucała aury po zmianie kontroli gospodarza.
    if (auraDescriptor(attachment)?.ownControlOnly === false) return true;
    return host.controllerId === attachment.controllerId;
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
  // Batch 45 (Pain for All): „Enchant creature you control" — stwór POD
  // KONTROLĄ kontrolera aury; utrata kontroli hosta = aura spada (SBA,
  // removeIllegalAttachments — CR 704.5n).
  if (enchantKind === 'creature_you_control') {
    return host.kind === 'creature' && host.controllerId === attachment.controllerId;
  }
  // Sesja 2026-09-21 (granica aura–host, znaleziona pomiarem na żywo): „Enchant
  // player" (Curse of the Pierced Heart) ma gospodarza-GRACZA, a nie permanent.
  // Bez rozróżnienia tego deskryptora predykat wpadał w domyślne „wyłącznie
  // stwory" i aura wracająca z grobu (Annie Flash, CR 303.4f) ZAŁĄCZAŁA SIĘ DO
  // STWORA — klątwa leżała na stworze, a jej zdolność czytała
  // `enchantedPlayerId` (nieustawione), więc nie robiła nic. Gracz nie jest
  // permanentem, więc ten predykat milczy — gospodarza-GRACZA rozstrzyga
  // bliźniaczy `isLegalAuraPlayerHost`, a WSPÓLNY zbiór kandydatów daje
  // `legalAuraHosts` (L41: jedna reguła, jedno miejsce).
  if (enchantKind === 'player') return false;
  // Zwykła aura / bestow / equipment — wyłącznie stwory.
  return host.kind === 'creature';
}

/**
 * Legalny gospodarz-GRACZ dla aury „Enchant player" (CR 303.4f: „object OR
 * player"). Gra jest dwuosobowa, więc kandydatami są wszyscy gracze w partii
 * (klątwa może zaczarować także kontrolera — Oracle nie zawęża celu).
 * Predykat jest bliźniakiem `isLegalAuraHost` i razem z nim tworzy JEDEN zbiór
 * legalnych gospodarzy (ścieżka zwrotu z grobu + walidacja wyboru gracza).
 */
export function isLegalAuraPlayerHost(state, attachment, playerId) {
  if (auraEnchantKind(attachment) !== 'player') return false;
  return (state?.players ?? []).some((player) => player.id === playerId);
}

/**
 * Wszyscy legalni gospodarze aury — permanenty ORAZ gracze (CR 303.4f).
 * Jedno źródło dla ścieżki zwrotu z grobu (effects.js), walidacji wyboru
 * (game-state.js `resolve_aura_host`) i oferty (legalCommands): kandydat
 * „jest / nie jest legalny" nie ma dwóch odpowiedzi zależnie od warstwy (L48).
 */
export function legalAuraHosts(state, attachment) {
  const objectIds = state.zones.battlefield
    .filter((hostId) => isLegalAuraHost(attachment, state.objects.get(hostId)));
  const playerIds = (state.players ?? [])
    .map((player) => player.id)
    .filter((playerId) => isLegalAuraPlayerHost(state, attachment, playerId));
  return { objectIds, playerIds };
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
 * załączony permanent przestaje być stworem (CR 702.103b: „the permanent it
 * becomes as it resolves will be a bestowed Aura"); obrażenia i liczniki z czasu
 * bycia stworem zerujemy jako higienę stanu (SBA 704.5f/g dotyczą wyłącznie
 * stworów, a cleanup 514.2 i tak by je zdjął).
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
 * Zaczarowuje GRACZA aurą „Enchant player" (CR 303.4f: „object or player") —
 * ścieżka wejścia NIE-czarowaniem: powrót z grobu (Annie Flash) wybiera
 * gospodarza przed wejściem. Gracz nie jest obiektem, więc aura nie dostaje
 * `attachedTo` (i nie obowiązuje jej SBA „aura bez gospodarza", CR 704.5m —
 * gracz nie opuszcza pola bitwy); kształt obiektu jest DOKŁADNIE ten sam, co
 * przy rzucie (spells.js `resolveAuraSpell`: `kind: 'enchantment'` +
 * `enchantedPlayerId`) — inaczej ta sama karta zachowywałaby się inaczej
 * zależnie od drogi wejścia (L41/L128).
 */
export function attachAuraToPlayer(state, auraId, playerId) {
  const aura = state.objects.get(auraId);
  if (!aura || aura.zone !== 'battlefield' || (!aura.bestow && !aura.aura)) {
    throw new Error('Zaczarować gracza można tylko aurą na polu bitwy');
  }
  if (!isLegalAuraPlayerHost(state, aura, playerId)) {
    throw new Error(`Aura nie ma legalnego gospodarza-gracza (${auraEnchantKind(aura)})`);
  }
  const updated = patchAttachmentObject(state, aura, {
    kind: 'enchantment',
    enchantPlayer: true,
    enchantedPlayerId: playerId,
    attachedTo: null,
  });
  state.events.push(event('aura_attached_to_player', {
    objectId: updated.id, cardId: updated.cardId, playerId,
    controllerId: updated.controllerId,
  }));
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
  // M110 (CR 702.16d): permanent z ochroną przed jakością equipmentu nie może
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
    // Bestow (CR 702.103f): „If a bestowed Aura becomes unattached, it ceases
    // to be bestowed. If a bestowed Aura is attached to an illegal object or
    // player, it becomes unattached and ceases to be bestowed. This is an
    // exception to rule 704.5m." — aura odłącza się i znów jest stworem: ZOSTAJE.
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
  // do grobu WŁAŚCICIELA.
  // M271 (błędy #11 i #12): ruch szedł tu RĘCZNIE, z pominięciem jedynego
  // choke pointu zmian stref, „żeby nie tworzyć cyklu importów". Cykl jest
  // realny (pilnuje go test/module-graph.test.js), ale rozwiązaniem jest
  // rejestr `mover.js`, a nie duplikat logiki — kopia gubiła DWIE korekty,
  // które choke point wykonuje:
  //  - CR 400.3 + 110.2a: poza polem bitwy obiekt należy do WŁAŚCICIELA,
  //    więc ukradziona aura lądowała w grobie ZŁODZIEJA (błąd #11);
  //  - CR 122.1h: `deathZoneFor` (finality / „exile if it would die") był
  //    ignorowany, więc aura z finality szła do grobu i dawała się odzyskać
  //    (błąd #12).
  // Odczepienie WŁASNYCH załączników aury (Feedback na Hobble, Batch 24)
  // wykonuje teraz sam choke point — nie duplikujemy go tutaj.
  // `kind` też ustawia choke point: bestow wraca do bycia stworem
  // (CR 702.103f), czysta aura zostaje enchantmentem.
  const toZone = deathZoneFor(state, attachment);
  const newId = `${toZone === 'exile' ? 'exile' : 'grave'}-${state.objectSequence++}`;
  const moved = moveObject(state, attachment.id, toZone, newId);
  const e = event('permanent_put_into_graveyard', {
    fromId: attachment.id, toId: newId, cardId: moved.cardId,
    controllerId: moved.controllerId, reason: 'aura_without_legal_host',
    toZone,
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
  const osierocone = [...state.objects.values()]
    .filter((object) => object.zone === 'battlefield' && object.attachedTo === hostId);
  // M271 (błąd #16): NAJPIERW zrywamy WSZYSTKIE wiązania z odchodzącym
  // gospodarzem, dopiero potem stosujemy politykę per załącznik.
  //
  // Dlaczego kolejność ma znaczenie: polityka czystej aury (CR 704.5m)
  // przenosi ją do grobu, a każde przeniesienie kończy się sprawdzeniem
  // inwariantów stanu. Przy DWÓCH załącznikach na jednym gospodarzu
  // sprawdzenie wypadało w ŚRODKU pętli — gdy drugi załącznik wciąż
  // wskazywał już skasowanego gospodarza — i wywracało partię wyjątkiem
  // „Załącznik X wskazuje nieistniejącego gospodarza Y".
  // Zerwanie wiązań z góry sprawia, że stan pośredni jest spójny.
  for (const object of osierocone) {
    const aktualny = state.objects.get(object.id);
    if (!aktualny) continue;
    state.objects.set(object.id, Object.freeze({ ...aktualny, attachedTo: null }));
  }
  for (const object of osierocone) {
    const aktualny = state.objects.get(object.id);
    if (!aktualny) continue;
    detachOrphanedAttachment(state, aktualny, hostId, events);
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
 * Efektywne KOLORY obiektu (CR 105 / 202.2 / 708.2a).
 *
 * Kolor jest cechą czytaną przy odczycie, jak keywordy — nie wolno brać go
 * wprost z `object.colors`, bo dwa stany permanentu zmieniają go na polu
 * bitwy:
 *
 *  - CR 708.2a: permanent ZAKRYTY (morph/megamorph/cloak) jest bezimiennym
 *    stworem 2/2 BEZ kolorów i bez podtypów — kolory karty pod spodem są
 *    zakryte. Odsłonięcie (turnFaceUp) przywraca je z nietkniętego pola
 *    `colors`, tak samo jak robi to effectiveKeywords dla keywordów.
 *  - CR 202.2: kolor wyznacza koszt many. Land go nie ma, więc każdy land
 *    jest bezbarwny — także wtedy, gdy zostanie animowany w stwora
 *    („It's still a land” — Silvanus's Invoker). Podtyp Swamp mówi tylko,
 *    jaką manę produkuje.
 *
 * Kolor jest cechą REGUŁOWĄ: patrzą na nią „protection from [kolor]”
 * (CR 702.16), intimidate (CR 702.13) i „can't be blocked except by [kolor]
 * creatures” (Dread Warlock). Dlatego jeden odczyt, jedna reguła (L41).
 */
export function effectiveColors(object) {
  if (!object) return [];
  // CR 708.2a — zakryty permanent nie ma kolorów.
  if (object.faceDown) return [];
  // CR 202.2 (land jest bezbarwny) egzekwują DANE KARTY — landy mają
  // `colors: []` w card-data.js. Nie zerujemy tu koloru po typie Land,
  // bo efekt animujący MOŻE nadać kolor (Genju of the Spires: „becomes a
  // 6/1 RED Spirit creature land” — CR 613, warstwa 5) i takiego koloru
  // nie wolno zgubić. Tak samo token-land z kolorem od efektu (CR 111.4).
  return object.colors ?? [];
}

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
  // Batch 46 (Guildscorn Ward): jakość z przypiętej AURY/equipmentu — trwała,
  // liczona przy odczycie, więc odpięcie znosi ochronę natychmiast.
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const grant = attachmentGrant(attachment);
    if (grant.protection) out.push(grant.protection);
  }
  return out;
}

/** Czy ŹRÓDŁO ma jakość, przed którą chroni deskryptor (CR 702.16b–f). */
export function sourceHasProtectionQuality(quality, source) {
  if (!quality || !source) return false;
  if (quality.kind === 'creature') {
    const isCreature = source.kind === 'creature' || (source.types ?? []).includes('Creature');
    if (!isCreature) return false;
  }
  if (quality.subtype && !(source.subtypes ?? []).includes(quality.subtype)) return false;
  if (quality.notSubtype && (source.subtypes ?? []).includes(quality.notSubtype)) return false;
  // Kolory ŹRÓDŁA czytamy przez effectiveColors — zakryte źródło (CR 708.2a)
  // i land (CR 202.2) są bezbarwne, więc nie mają jakości „kolor”.
  const sourceColors = effectiveColors(source);
  if (Array.isArray(quality.colors) && !quality.colors.some((c) => sourceColors.includes(c))) return false;
  // Batch 46 (Guildscorn Ward, CR 702.16a): „protection from multicolored" —
  // źródłem jest obiekt o DWÓCH lub więcej kolorach (CR 105.4).
  if (quality.multicolored && sourceColors.length < 2) return false;
  return true;
}

/** Czy `target` jest chroniony przed `source` jakością (nie kolorem). */
export function isProtectedFromSource(state, target, source) {
  const qualities = effectiveProtectionQualities(state, target);
  if (qualities.length === 0) return false;
  return qualities.some((quality) => sourceHasProtectionQuality(quality, source));
}

/**
 * CR 702.16b (DEBT: **T** = targeted) — JEDYNA reguła „ochrona blokuje
 * CELOWANIE", wspólna dla oferty i walidacji we wszystkich ścieżkach
 * (czary, zdolności aktywowane, triggery, Fireball).
 *
 * Dosłownie (mtg.wiki, „Protection"): „**T**argeted by spells with the
 * specified quality, or by abilities from sources of that quality."
 *
 * Ochrona ma w tym silniku dwa źródła danych i reguła musi czytać OBA:
 *  - `effectiveProtectionQualities` — jakości (granty do końca tury i z
 *    załączników, CR 702.16a — np. „protection from non-Human creatures");
 *  - `effectiveProtectionFromColors` — drukowana ochrona od koloru.
 * Kolory ŹRÓDŁA czyta `effectiveColors` (zakryty permanent i land są
 * bezbarwne — CR 708.2a / 202.2); `sourceColors` pozwala ścieżce, która zna
 * kolory źródła lepiej niż obiekt (walidacja rzutu czaru), podać je wprost.
 *
 * Historia (audyt PR #112, F2): ta reguła istniała w PIĘCIU ręcznych kopiach
 * (`validateTargets`, `legalTargetCandidates`, `castFireball`,
 * `legalFireballCasts`, `protectedBlocked` w triggers.js), z czego dwie
 * (Fireball) nie znały wcale ochrony od JAKOŚCI — klasa L41/L107/L140:
 * kopie tej samej reguły rozjeżdżają się cicho.
 */
export function isTargetingBlockedByProtection(state, target, source, { sourceColors = null } = {}) {
  if (!target) return false;
  if (isProtectedFromSource(state, target, source)) return true;
  const protColors = effectiveProtectionFromColors(state, target);
  if (protColors.length === 0) return false;
  const colors = Array.isArray(sourceColors) ? sourceColors : effectiveColors(source);
  return colors.some((color) => protColors.includes(color));
}

export function removeIllegalAttachments(state) {
  const events = [];
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield') continue;
    // F2 (uwaga właściciela 2026-09-23c, Veiled Ascension): permanent
    // ZAKRYTY (morph/cloak) to bezimienny 2/2 stwór BEZ typów i podtypów
    // (CR 708.2) — dopóki leży twarzą w dół, NIE jest aurą, więc reguła
    // „aura bez legalnego zaczarowanego obiektu” (CR 704.5m) go nie dotyczy.
    // Bez tego warunku zakryta Aura (np. Guildscorn Ward po cloaku) szła do
    // grobu natychmiast po wejściu, mimo że na stole jest legalnym 2/2.
    if (object.faceDown) continue;
    if (object.attachedTo == null) {
      // CR 704.5m — trzeci przypadek reguły (łowów E3, 2026-09-21): „or is
      // not attached to an object or player”. Czysta aura bez zaczarowanego
      // obiektu idzie do grobu WŁAŚCICIELA przez ten sam choke point ruchu,
      // co zrzucanie z hosta (`detachOrphanedAttachment`, M271). Dwa kształty
      // są LEGALNE i zostają na polu bitwy: bestow bez hosta znów jest
      // stworem (CR 702.103f — wyjątek od 704.5m), equipment bez hosta jest
      // normalnym artefaktem
      // (CR 704.5n), a aura na GRACZA niesie `enchantedPlayerId`
      // (reprezentacja `attachAuraToPlayer` — przypięta DO GRACZA, pin H/4).
      // Guard = WYŁĄCZNIE czysta aura (deskryptor `aura`, bez `bestow`):
      // zwykłe permanenty i nieprzyłączone equipmenty są legalne bez hosta.
      if (object.aura != null && object.bestow == null && object.enchantedPlayerId == null) {
        detachOrphanedAttachment(state, object, null, events);
      }
      continue;
    }
    const host = state.objects.get(object.attachedTo);
    const hostLegal = isLegalAuraHost(object, host);
    if (!hostLegal) {
      detachOrphanedAttachment(state, object, object.attachedTo, events);
      continue;
    }
    // Protection (CR 702.16c/d): aura/equipment of the protected color
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
    // M110 (CR 702.16c/d): ochrona przed JAKOŚCIĄ zdejmuje też załączniki
    // mające tę jakość (np. „protection from Equipment").
    if (isProtectedFromSource(state, host, object)) {
      detachOrphanedAttachment(state, object, object.attachedTo, events);
    }
  }
  return events;
}
