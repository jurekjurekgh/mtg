// Wspólne granice czterech sond scoringu (audyt PR #154/F6).
// Nie wpływa na bota ani silnik: pusty/urwany pomiar nie jest wynikiem jakości.
export function parseAuditArgs(argv, defaultSeeds, allowedFlags = []) {
  const flags = new Set();
  const positional = [];
  for (const arg of argv) {
    if (allowedFlags.includes(arg)) flags.add(arg);
    else if (arg.startsWith('--')) throw new Error(`Nieznana opcja audytu: ${arg}`);
    else positional.push(arg);
  }
  const seeds = positional.length ? Number(positional[0]) : defaultSeeds;
  if (positional.length > 1 || !Number.isSafeInteger(seeds) || seeds < 1) {
    throw new Error('Liczba seedów musi być dodatnią liczbą całkowitą; pomiar 0 partii jest niedozwolony');
  }
  return { seeds, flags };
}

export function assertAuditCommand(result, cmd) {
  if (result?.ok !== true) {
    throw new Error(`Przerwany pomiar: odrzucona komenda ${cmd?.type ?? '(brak)'}: ${result?.events?.[0]?.reason ?? 'brak potwierdzenia'}`);
  }
}

export function assertAuditFinished(state) {
  if (state?.status !== 'finished') {
    throw new Error('Niepełny pomiar: partia nie zakończyła się w limicie komend');
  }
}

/**
 * Obserwacja OBECNOŚCI z widoku, nie pełna legalność celu (typy/hexproof itd.).
 * Celami bywają gracze, wpisy stosu i karty w publicznych strefach. Null to
 * niewybrany slot opcjonalny; zero WYBRANYCH celów nie oznacza utraty celów.
 */
export function allChosenTargetsAbsent(view, stackId) {
  const entry = (view.zones?.stack ?? []).find((e) => e.id === stackId);
  const targets = (entry?.targets ?? []).filter((id) => id != null);
  if (!targets.length) return false;
  const visibleIds = new Set([
    ...(view.players ?? []).map((p) => p.id),
    ...Object.values(view.zones ?? {}).flatMap((zone) => Array.isArray(zone) ? zone.map((o) => o?.id) : []),
  ]);
  return targets.every((id) => !visibleIds.has(id));
}
