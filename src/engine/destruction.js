import { event } from '../protocol/types.js';
import { effectiveKeywords, deathZoneFor, replaceObject } from './permanents.js';
import { attachmentsAttachedTo } from './attachments.js';
import { removeCounter } from './counters.js';
import { moveObjectDirectly } from './objects.js';

/** CR616.1/702.89: najpierw wybory i zmodyfikowana grupa, potem ruchy.
 * Aura niszczona razem z hostem nadal chroni. Każdy replacement raz (614.5).
 * Frame jest zwykłymi danymi; żadnych callbacków/ukrytego stanu w protokole. */
export function destroyPermanents(state, ids, { cause = 'effect', putIds = [], frame = null } = {}) {
  // F1 (audyt PR106): przyczyna jest PER-ID. Aura dopisana przez armor jest
  // niszczona efektem umbra (CR 702.89a + 614.6), nie pierwotną przyczyną —
  // jej tarcza działa także, gdy hosta zabijało SBA (CR 122.1c + 614.5).
  const work = frame ?? { ids: [...new Set(ids)], cause, putIds, choices: {}, causes: {}, restorePriorityTo: state.turn.priorityPlayerId };
  work.causes ??= {};
  const active = state.players.findIndex(p => p.id === state.turn.activePlayerId);
  const rank = id => (state.players.findIndex(p => p.id === state.objects.get(id)?.controllerId) - active + state.players.length) % state.players.length;
  for (let i = 0; i < work.ids.length; i++) {
    // CR616.1: wybory różnych kontrolerów APNAP; kolejność ruchów bez zmian.
    const id = work.ids.filter(id => !work.choices[id]).sort((a,b) => rank(a)-rank(b))[0];
    if (id == null) break;
    const object = state.objects.get(id);
    if (!object || object.zone !== 'battlefield') { work.choices[id] = 'skip'; continue; }
    if (work.putIds.includes(id)) { work.choices[id] = 'destroy'; continue; }
    if (effectiveKeywords(object,state).includes('indestructible')) { work.choices[id] = 'skip'; continue; }
    const options = [];
    if ((state.regenerationShields ?? []).includes(id) && !(state.cantBeRegeneratedThisTurn ?? []).includes(id)) options.push('regenerate');
    if ((work.causes[id] ?? work.cause) === 'effect' && (object.counters?.shield ?? 0) > 0) options.push('shield');
    for (const aura of attachmentsAttachedTo(state,id)) if (aura.aura?.umbraArmor) options.push(`umbra:${aura.id}`);
    if (options.length > 1) {
      state.pendingReplacementChoice = { playerId: object.controllerId, objectId:id, cardId:object.cardId,
        options, frame:work, continuations:[] };
      state.turn.priorityPlayerId = object.controllerId;
      state.events.push(event('replacement_choice_required',{playerId:object.controllerId,objectId:id,cardId:object.cardId,options}));
      return false;
    }
    work.choices[id] = options[0] ?? 'destroy';
    expandArmor(work,id);
  }
  // Wszystkie decyzje zapadły przed jakąkolwiek zmianą pola bitwy.
  for (const id of work.ids) {
    const choice=work.choices[id], object=state.objects.get(id);
    if (!object || object.zone !== 'battlefield') continue;
    if (choice==='shield') {
      removeCounter(state,id,'shield',1);
      state.events.push(event('shield_consumed',{objectId:id,cardId:object.cardId,reason:'destroy'}));
    } else if (choice==='regenerate') regeneratePermanent(state,object);
    else if (choice.startsWith('umbra:')) {
      replaceObject(state,object,{damage:0,damagedByDeathtouch:false});
      state.events.push(event('umbra_armor_applied',{objectId:id,cardId:object.cardId,auraId:choice.slice(6),playerId:object.controllerId}));
    }
  }
  const victims=work.ids.filter(id=>work.choices[id]==='destroy').map(id=>state.objects.get(id)).filter(o=>o?.zone==='battlefield');
  const simultaneousIds=victims.filter(o=>o.kind==='creature' && deathZoneFor(state,o)==='graveyard').map(o=>o.id);
  // Nie uruchamiaj orphan cleanup ofiary grupy przy wcześniejszym ruchu
  // jej gospodarza: ta aura też jest niszczona, a nie przenoszona dwa razy.
  const victimIds=new Set(victims.map(o=>o.id));
  for(const object of victims) if(victimIds.has(object.attachedTo)) replaceObject(state,object,{attachedTo:null});
  for(const object of victims) {
    const toZone=deathZoneFor(state,object);
    const toId=`${toZone==='graveyard' && work.cause==='sba'?'grave':toZone}-${state.objectSequence++}`;
    moveObjectDirectly(state,object.id,toZone,toId);
    state.events.push(event(work.cause==='sba'?(object.kind==='creature'?'creature_destroyed':'object_moved'):'permanent_destroyed',{
      fromId:object.id,toId,objectId:toId,toZone,cardId:object.cardId,object,
      playerId:object.controllerId,controllerId:object.controllerId,
      ...(work.cause==='sba' && object.kind!=='creature'?{fromZone:'battlefield',sba:work.putIds.includes(object.id)?'zero_loyalty':'destroy'}:{}),
      ...(simultaneousIds.length>1?{simultaneousIds}:{}),
    }));
  }
  return true;
}
function expandArmor(work,id) {
  const choice=work.choices[id];
  if (choice?.startsWith('umbra:')) { const auraId=choice.slice(6);if(!work.ids.includes(auraId)) { work.ids.push(auraId); (work.causes ??= {})[auraId]='effect'; } }
}
export function chooseDestructionReplacement(state,choice) {
  const pending=state.pendingReplacementChoice;
  if (!pending?.frame || !pending.options.includes(choice)) throw new Error('illegal_replacement_choice');
  state.pendingReplacementChoice=null;
  pending.frame.choices[pending.objectId]=choice;expandArmor(pending.frame,pending.objectId);
  const complete=destroyPermanents(state,[],{frame:pending.frame});
  if(!complete) state.pendingReplacementChoice.continuations.push(...pending.continuations);
  else state.turn.priorityPlayerId=pending.frame.restorePriorityTo;
  return complete ? pending.continuations : null;
}
/** Zachowaj wpis stosu do chwili zakończenia decyzji; finalny event też czeka. */
export function holdReplacementResolution(state,entry,resolvedEvent) {
  if (!state.pendingReplacementChoice) return false;
  state.objects.set(entry.id,entry);
  if(!state.zones.stack.includes(entry.id))state.zones.stack.push(entry.id);
  state.pendingReplacementChoice.continuations.push({completion:{entryId:entry.id,event:resolvedEvent,spell:!entry.activatedEntry&&!entry.triggerEntry}});
  return true;
}

export function regeneratePermanent(state, object, collected = null) {
  if (!object || object.zone !== 'battlefield') return false;
  if (!(state.regenerationShields ?? []).includes(object.id)) return false;
  // CR 701.12b (minimalny wymiar): „It can't be regenerated this turn" (Rage
  // of Purphoros) — flaga trwała do końca tury ustawiana na obiekcie
  // efektem cant_be_regenerated_this_turn. Blokuje regenerację TEGO
  // obiektu niezależnie od źródła tarczy (regenerate / destroy z efektem
  // regeneracji / planeswalker itd.).
  if ((state.cantBeRegeneratedThisTurn ?? []).includes(object.id)) return false;
  // E8/B1 (wyzwanie wyłapywacza błędów, CR 701.15b): każda tarcza regeneracji
  // zastępuje JEDNO zniszczenie — dwie tarcze ratują dwukrotnie. Dotąd filter
  // zdejmował WSZYSTKIE instancje naraz i drugie zniszczenie w turze zabijało
  // mimo nietkniętej drugiej tarczy. Konsumujemy dokładnie jedną.
  const shieldIndex = (state.regenerationShields ?? []).indexOf(object.id);
  if (shieldIndex >= 0) {
    state.regenerationShields = [
      ...(state.regenerationShields ?? []).slice(0, shieldIndex),
      ...(state.regenerationShields ?? []).slice(shieldIndex + 1),
    ];
  }
  // Odcięcie od walki (CR 701.12a: „removed from combat").
  if (state.combat) {
    state.combat.attackers = (state.combat.attackers ?? []).filter((id) => id !== object.id);
    for (const [attackerId, blockerIds] of state.combat.blockers) {
      state.combat.blockers.set(attackerId, blockerIds.filter((id) => id !== object.id));
    }
    state.combat.blockedAttackers?.delete(object.id);
  }
  const wasTapped = Boolean(object.tapped);
  const regenerated = Object.freeze({
    ...object, tapped: true, damage: 0, damagedByDeathtouch: false,
  });
  state.objects.set(object.id, regenerated);
  const regenerationEvent = event('permanent_regenerated', {
    objectId: object.id, cardId: object.cardId, playerId: object.controllerId,
  });
  state.events.push(regenerationEvent);
  collected?.push(regenerationEvent);
  // M117 (lekcja L24, ta sama klasa co tapnięcie landa za manę z M114):
  // regeneracja TAPUJE permanent (CR 701.15a), a tapnięcie jest zdarzeniem
  // widocznym dla reguł — bez `object_tapped` żaden trigger „becomes tapped”
  // (Chronic Flooding) by go nie zobaczył, a gracz nie przeczytałby w logu,
  // dlaczego jego stwór stoi zatapniętny. Zdarzenie tylko przy REALNEJ zmianie:
  // permanent już zatapniętny nie „staje się” zatapniętny drugi raz.
  if (!wasTapped) {
    const tappedEvent = event('object_tapped', {
      objectId: object.id, playerId: object.controllerId, viaRegeneration: true,
    });
    state.events.push(tappedEvent);
    // Zdarzenie musi trafić także do listy ZWRACANEJ przez SBA — `accepted()`
    // karmi `processTriggers` tą listą, a nie całym `state.events`. Bez tego
    // trigger „becomes tapped” nie zobaczyłby tapnięcia z regeneracji.
    collected?.push(tappedEvent);
  }
  return true;
}
