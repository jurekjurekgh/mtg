/** Fail closed: the generic one-row-per-command renderer must not enumerate
 * multi-item selections. Dedicated set/ordering wizards remain free to consume
 * the same complete legalCommands. This detects array-valued selections; a
 * semantically disguised scalar encoding requires explicit metadata. */
export function assertNoCombinationRows(commands, session = null) {
  const options = commands ?? [];
  if (options.length < 2) return;
  for (const cmd of options) {
    if (!Number.isInteger(cmd?.modeIndex)) continue;
    const spell = session?.state?.objects?.get?.(cmd.objectId)?.spell;
    if ((spell?.modes?.[cmd.modeIndex]?.choiceComponents?.length ?? 0) >= 2) {
      throw new Error('Zakazany modal kombinacji trybów: użyj kreatora wyboru wielu');
    }
  }
  // Kilka pól tablicowych może zmieniać się jednocześnie (np. wybrane karty
  // i kolejność reszty); porównanie jednego pola nie wykryłoby takiej listy.
  const arrayGroups = new Map();
  for (const cmd of options) {
    const keys = Object.keys(cmd ?? {}).filter(k => Array.isArray(cmd[k])
      && cmd[k].every(v => typeof v === 'string' || typeof v === 'number'));
    if (!keys.length) continue;
    const other = Object.keys(cmd).filter(k => !keys.includes(k)).sort().map(k => [k, cmd[k]]);
    const fingerprint = JSON.stringify(other);
    const group = arrayGroups.get(fingerprint) ?? [];
    group.push({ values: keys.sort().map(k => [k, cmd[k]]), multi: keys.some(k => cmd[k].length >= 2) });
    arrayGroups.set(fingerprint, group);
  }
  for (const entries of arrayGroups.values()) {
    if (entries.length >= 2 && entries.some(e => e.multi)
      && new Set(entries.map(e => JSON.stringify(e.values))).size >= 2) {
      throw new Error('Zakazany modal kombinacji lub kolejności: użyj kreatora');
    }
  }
}
