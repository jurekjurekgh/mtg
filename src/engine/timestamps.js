/**
 * Znaczniki czasu efektów ciągłych (D4b / W-*, audyt warstw CR 613).
 *
 * CR 613.7 (CR 2026-09-25, dosłownie): „Within a layer or sublayer,
 * determining which order effects are applied in is usually done using a
 * timestamp system. An effect with an earlier timestamp is applied before an
 * effect with a later timestamp.”
 *
 *  - 613.7a — efekt ze zdolności statycznej ma znacznik obiektu, na którym
 *    zdolność siedzi (`object.timestamp`);
 *  - 613.7b — efekt z rozstrzygnięcia czaru/zdolności dostaje znacznik
 *    w chwili utworzenia (np. `tempBasePT.ts`, warstwa animacji `layer.ts`,
 *    `keywordGrantTs`, `lostKeywordTs`, `subtypeOverrideTs`, wpis buffa `ts`);
 *  - 613.7c — licznik dostaje znacznik przy położeniu, a wszystkie liczniki
 *    tego rodzaju — ten sam nowy znacznik (`counterTs`);
 *  - 613.7d — obiekt dostaje znacznik przy wejściu do strefy;
 *  - 613.7e — Aura/Equipment dostaje NOWY znacznik przy każdym przypięciu
 *    (`attachedTs`);
 *  - 613.7f/g — permanent dostaje nowy znacznik przy obrocie twarzą
 *    w górę/w dół i przy transformacji.
 *
 * Licznik jest monotoniczny w obrębie partii (`state.timestampSeq`) i nie ma
 * nic wspólnego z `objectSequence` (identyfikatory obiektów zostają bez zmian).
 * Brak znacznika (fixtures sprzed tej zmiany) = 0, czyli „najstarszy”.
 */

/** Następny znacznik czasu partii (CR 613.7). */
export function nextTimestamp(state) {
  state.timestampSeq = (state.timestampSeq ?? 0) + 1;
  return state.timestampSeq;
}

/** Znacznik obiektu (CR 613.7d/f/g); brak = 0 (najstarszy). */
export function timestampOf(object) {
  return object?.timestamp ?? 0;
}

/** Znacznik przypięcia załącznika (CR 613.7e), z powrotem na znacznik obiektu. */
export function attachmentTimestampOf(attachment) {
  return attachment?.attachedTs ?? timestampOf(attachment);
}
