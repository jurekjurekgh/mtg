import { isCardObject } from './zones.js';

/**
 * Liczba RÓŻNYCH typów kart (CR 205.2a) w grobie gracza — jedno źródło dla
 * wszystkich konsumentów delirium (CR 207.2c):
 *   • bramka aktywacji zdolności (`abilities.js` — Resurrected Cultist),
 *   • warunek triggera (`triggers.js`),
 *   • warunek STATYCZNY (`permanents.js` — Spineseeker Centipede: „gets +1/+2
 *     and has vigilance as long as there are four or more card types among
 *     cards in your graveyard").
 *
 * Po co liść: `permanents.js` nie może brać tej reguły z `triggers.js` —
 * triggers importuje permanents (CARD_TYPES, effectiveKeywords…), więc import
 * w drugą stronę robiłby cykl, a build odmawia cykli (ADR 0011). Reguła jedzie
 * więc modułem o zerowych zależnościach, a LISTĘ TYPÓW przekaje konsument
 * parametrem — jeden egzemplarz kodu, zero cykli (wzorzec L171; klasa L41/L48:
 * kopie tej samej reguły rozjeżdżają się po cichu).
 *
 * Liczymy wyłącznie KARTY (nie tokeny — CR 108.2b, `isCardObject`).
 */
export function countGraveyardCardTypes(state, playerId, cardTypes) {
  const present = new Set();
  for (const objectId of state.zones.graveyard) {
    const object = state.objects.get(objectId);
    if (!isCardObject(object) || object.controllerId !== playerId) continue;
    for (const type of object.types ?? []) {
      if (cardTypes.includes(type)) present.add(type);
    }
  }
  return present.size;
}
