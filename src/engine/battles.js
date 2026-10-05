/** Publiczny kontrakt Battle potrzebny efektom celującym w bitwy.
 * CR 310.9a/e: protector jest rolą NIEZALEŻNĄ od kontrolera permanenta.
 * Nie dodaje kart Battle do kolekcji ani nie udaje ich Oracle/tylnych stron.
 */
export function isBattle(object) {
  return !object?.faceDown && (object?.kind === 'battle' || (object?.types ?? []).includes('Battle'));
}

export function battleProtectorId(object) {
  if (!isBattle(object)) return null;
  // Bitwa bez typu może być chroniona wyłącznie przez swego kontrolera.
  // Siege wymaga jawnie wybranego protektora, nie domysłu po controllerId.
  return object.protectorId ?? ((object.subtypes ?? []).includes('Siege') ? null : object.controllerId);
}

export function battleDefenseDelta(effect, battle, effectControllerId) {
  if (!isBattle(battle)) return 0;
  const protector = battleProtectorId(battle);
  return protector != null && protector !== effectControllerId
    ? (effect.opponentAmount ?? 0) : (effect.otherwiseAmount ?? 0);
}
