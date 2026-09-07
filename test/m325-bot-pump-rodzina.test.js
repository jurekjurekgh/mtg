import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * M325 (audyt PR #102, F2 — klasa L48/L72/L107): model „widoczny pump
 * obronny\" (M317, `enemyDefensivePumpBonus`) musi obejmować CAŁĄ rodzinę
 * porównań ze statystykami blokerów w wycenie ataku.
 *
 * M317 podstawiał `effBlocker*` w trzech gałęziach, a dwie zostały na surowych
 * odczytach — ta sama rodzina z dwoma sprzecznymi modelami:
 *  • `power >= strongestBlockerToughness` w gałęzi stwora POŻYCZANEGO
 *    (`tempControlUntilEOT`) — bot liczył właścicielowi utratę permanentu,
 *    którego atakujący nie zabije, bo bloker jest pompowany;
 *  • wyłączenie kary za „kupowany deathtouch\" przy first strike — przy
 *    widocznym pumpe bloker przeżywa pierwsze uderzenie i trik nadal zabija.
 *
 * Suchy pomiar dryfu: ZERO (benchmark `--quick` 84,8% = 570/672 identycznie
 * jak baza, golden-master wycen bez regeneracji) — gałęzie przykrywają
 * wcześniejsze rozstrzygnięcia tej samej wyceny, więc decyzji tu nie widać.
 * Strażnik skanuje zatem ŹRÓDŁO (wzorzec L107: grep po POLU; ten sam kształt
 * co `m305/5` zakazujący `zones.library.find(` w botie i lista
 * `FAMILY_EXCEPTIONS` w `tools/family-audit.mjs`): pinuje niesprzeczność
 * modelu, żeby następna gałąź nie musiała być łapana audytem.
 *
 * Wyjątki (świadome, z powodem): definicje surowych reducerów, definicje
 * `eff*` oraz WYCENA WARTOŚCI permanentu (nie stanu) — `P.attackThroughBonus +
 * strongestBlockerPower + strongestBlockerToughness`, bo pump nie zmienia
 * tego, ile jest wart cudzy stwór na stole.
 */

const BOT_SOURCE = readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
const RAW_STATS = /strongestBlockerToughness|strongestBlockerPower|gangPower|weakestBlockerToughness/;
const ALLOWED = [
  /^\s*const strongest(BlockerPower|BlockerToughness) = blockers\.reduce/,
  /^\s*const (gangPower|weakestBlockerToughness) = /,
  /^\s*const eff\w+ = /,
  /^\s*: weakestBlockerToughness \+ trick\.toughness;$/,
  /weakestBlockerToughness === Number\.POSITIVE_INFINITY/,
  /perAttacker = P\.attackThroughBonus \+ strongestBlockerPower \+ strongestBlockerToughness/,
];

/** Ciało `case 'declare_attackers'` — od etykiety do następnego `case`. */
function declareAttackersBody(source) {
  const start = source.indexOf("      case 'declare_attackers': {");
  assert.ok(start >= 0, 'znaleziono case declare_attackers');
  const rest = source.slice(start + 1);
  const next = rest.search(/\n      case '/);
  assert.ok(next >= 0, 'znaleziono następny case');
  return rest.slice(0, next);
}

test('M325/A: każda konfrontacja ze statystykami blokerów czyta wersję z bonusem', () => {
  const body = declareAttackersBody(BOT_SOURCE);
  const braki = body.split('\n')
    .map((line) => line.trim())
    .filter((line) => RAW_STATS.test(line) && !ALLOWED.some((re) => re.test(line)));
  assert.deepEqual(braki, [],
    `surowe staty blokerów w porównaniach (pomijają widoczny pump, M317): ${braki.join(' ;; ')}`);
});

test('M325/B: rodzina jest podpięta — gałęzie czytają eff* (pin anty-vacuous)', () => {
  const body = declareAttackersBody(BOT_SOURCE);
  const effUses = (body.match(/effBlockerToughness|effBlockerPower|effGangPower|effWeakestBlockerToughness/g) ?? []).length;
  assert.ok(effUses >= 6, `strażnik gaśnie, gdy rodzina przestanie używać eff* (użycia: ${effUses})`);
  assert.match(body, /const trick = enemyDefensivePumpBonus\(view\);/, 'jedno źródło bonusu (L41)');
});
