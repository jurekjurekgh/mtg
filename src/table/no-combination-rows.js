/** Fail closed: the generic one-row-per-command renderer must not enumerate
 * multi-item selections. Dedicated set/ordering wizards remain free to consume
 * the same complete legalCommands. This detects array-valued selections; a
 * semantically disguised scalar encoding requires explicit metadata.
 *
 * Zgłoszenie właściciela F1 (2026-11-21, Lash of the Balrog): „MASZ
 * NATYCHMIAST SKASOWAĆ W KODZIE WSZELKIE FRAGMENTY, KTÓRE MOGĄ ROBIĆ
 * PERMUTACYJNE MODALE! NAWET FALLBACKI!” — dlatego reguła niżej wykrywa
 * też PEŁNY krzyż wymiarów SKALARNYCH (np. cel × wariant zapłaty {4}):
 * gdy liczba distinct kombinacji podzbioru pól == rozmiar grupy ==
 * iloczyn distinct wartości tych pól, grupa JEST iloczynem i musi iść do
 * kreatora grupowego (jeden wybór na grupę), nigdy na listę wierszy.
 * `allowScalarProduct` wyłącza regułę wyłącznie dla dedykowanego
 * jednowyborowego okna rzutu (M300, lista gotowych rzutów — nie modal
 * wyboru kombinacji).
 */
export function assertNoCombinationRows(commands, session = null, { allowScalarProduct = false } = {}) {
  const options = commands ?? [];
  if (options.length < 2) return;
  const modeGroups = new Map();
  for (const cmd of options) {
    if (!Number.isInteger(cmd?.modeIndex)) continue;
    const id = cmd.objectId ?? cmd.cardId;
    const spell = session?.state?.objects?.get?.(id)?.spell;
    if ((spell?.modes?.[cmd.modeIndex]?.choiceComponents?.length ?? 0) < 2) continue;
    const modes = modeGroups.get(id) ?? new Set();
    modes.add(cmd.modeIndex); modeGroups.set(id, modes);
  }
  if ([...modeGroups.values()].some(modes => modes.size >= 2)) {
    throw new Error('Zakazany modal kombinacji trybów: użyj kreatora wyboru wielu');
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
  // F1: pełny krzyż wymiarów skalarnych (cel × wariant zapłaty, cel ×
  // ofiara × …). Treść pól tablicowych liczymy jako wartość (pojedynczy cel
  // siedzi w `targets: [id]`), pola stałe (rozmiar 1) wypadają same.
  if (allowScalarProduct) return;
  const norm = (v) => (Array.isArray(v) ? `a:${JSON.stringify(v)}`
    : (v === undefined ? 'u' : `${typeof v}:${String(v)}`));
  const fields = [...new Set(options.flatMap((cmd) => Object.keys(cmd ?? {})))];
  const dims = [];
  for (const field of fields) {
    const values = new Set(options.map((cmd) => norm(cmd[field])));
    if (values.size >= 2) dims.push({ field, size: values.size });
  }
  if (dims.length < 2) return;
  // Podzbiory wymiarów 2..4 (wystarcza dla krzyży, które powstają z iloczynu
  // dwóch-trzech decyzji; C(n,4) przy ~10 polach to setki porównań).
  const subsets = (start, need, acc) => {
    if (need === 0) return [acc];
    const out = [];
    for (let i = start; i <= dims.length - need; i += 1) {
      out.push(...subsets(i + 1, need - 1, [...acc, dims[i]]));
    }
    return out;
  };
  for (let k = 2; k <= Math.min(4, dims.length); k += 1) {
    for (const subset of subsets(0, k, [])) {
      const product = subset.reduce((p, d) => p * d.size, 1);
      if (product !== options.length) continue;
      const joints = new Set(options.map((cmd) => subset.map((d) => norm(cmd[d.field])).join('|')));
      if (joints.size === options.length) {
        throw new Error('Zakazany modal permutacji kombinacji: użyj kreatora grupowego (jeden wybór na grupę)');
      }
    }
  }
}
