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
  const keys = new Set(options.flatMap(c => Object.keys(c ?? {}).filter(k => Array.isArray(c[k]))));
  for (const key of keys) {
    const groups = new Map();
    for (const cmd of options) {
      const value = cmd?.[key];
      if (!Array.isArray(value) || !value.every(v => typeof v === 'string' || typeof v === 'number')) continue;
      const rest = Object.keys(cmd).filter(k => k !== key).sort().map(k => [k, cmd[k]]);
      const fingerprint = JSON.stringify(rest);
      const group = groups.get(fingerprint) ?? [];
      group.push(value);
      groups.set(fingerprint, group);
    }
    for (const values of groups.values()) {
      if (values.length >= 2 && values.some(v => v.length >= 2)
        && new Set(values.map(v => JSON.stringify(v))).size >= 2) {
        throw new Error(`Zakazany modal kombinacji lub kolejności (${key}): użyj kreatora`);
      }
    }
  }
}
