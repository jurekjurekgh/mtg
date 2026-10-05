/** Wartość P/T liczona w chwili zastosowania efektu (CR 608.2h).
 * Liść bez stanu/registry: ten sam filtr czyta silnik i bot z PlayerView.
 * `permanents` to publiczne obiekty pola bitwy, `controllerId` — kontroler
 * EFEKTU, nie celu ani (być może już poświęconego) źródła.
 */
export function isCountedEffectValue(value) {
  return value?.kind === 'permanent_count';
}

export function countedEffectValue(value, permanents, controllerId) {
  if (!isCountedEffectValue(value)) return null;
  const count = [...permanents].filter(object => object
    && (object.zone == null || object.zone === 'battlefield')
    && object.controllerId === controllerId
    && (!value.token || object.isToken === true)
    && (value.types ?? []).every(type => (object.types ?? []).includes(type))
    && (value.subtypes ?? []).every(type => (object.subtypes ?? []).includes(type))).length;
  return count * (value.multiplier ?? 1);
}

/** Bez widoku znamy znak, nie liczbę. Potrzebny klasyfikacji debuffów/UI. */
export function countedEffectSign(value) {
  return isCountedEffectValue(value) ? Math.sign(value.multiplier ?? 1) : 0;
}
