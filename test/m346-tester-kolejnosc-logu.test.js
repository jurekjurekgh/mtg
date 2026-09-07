import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import * as extractors from '../tools/table-tester/extract.mjs';
import { runDetectors } from '../tools/table-tester/detectors.mjs';

const source = readFileSync(new URL('../tools/table-tester/run-game.mjs', import.meta.url), 'utf8');

// Wykonujemy rzeczywiste lokalne funkcje sterownika na minimalnym DOM-ie,
// bez jsdom w głównej bramce. Nie jest to kopia algorytmu z run-game.
// Dzięki temu RED mierzy stare slice(-6)/indeks od końca, nie brak nowego API.
function localFunction(name) {
  const from = source.indexOf(`  const ${name} =`);
  assert.notEqual(from, -1, `funkcja ${name} istnieje w sterowniku`);
  const end = source.indexOf('\n  };', from);
  assert.ok(end > from, `koniec funkcji ${name}`);
  return source.slice(from, end + '\n  };'.length);
}
const text = (element) => element?.textContent ?? '';
const elements = (lines) => lines.map((textContent) => ({ textContent }));
function snapshotLog(lines) {
  const printed = [];
  const ctx = createContext({
    $$: (selector) => selector.startsWith('#log') ? elements(lines) : [],
    $: () => ({ textContent: 'Tura 12' }), text, tiles: () => [],
    logL: (line) => printed.push(line),
    chronologicalLogEntries: extractors.chronologicalLogEntries,
  });
  // Stary snapshot czytał DOM bezpośrednio; po M346 ma wspólnego producenta
  // danych okna. Obydwie wersje muszą dać ten sam, poprawny tekst ogona.
  const prelude = source.includes('  const captureLogWindow =') ? localFunction('captureLogWindow') : '';
  runInContext(`${prelude}\n${localFunction('snapshot')}\nsnapshot(12);`, ctx);
  return printed.find((line) => line.startsWith('  LOG:'));
}
function collector(name, extra = {}) {
  let rows = [];
  const records = [];
  const printed = [];
  const ctx = createContext({
    $$: () => elements(rows), text,
    rejectionRecords: records, rejectionsSeen: 0, tickedThisWindow: false,
    mainLogSeen: 0, MAIN_LOG_EVIDENCE: /^Auto-pass:/,
    logL: (line) => printed.push(line),
    chronologicalLogEntries: extractors.chronologicalLogEntries,
    ...extra,
  });
  const collect = runInContext(`${localFunction(name)}\n${name};`, ctx);
  return { ctx, records, printed, collect, setRows: (next) => { rows = next; } };
}

test('M346/A: snapshot loguje sześć najnowszych wpisów w kolejności chronologicznej', () => {
  const rows = ['ósmy', 'siódmy', 'szósty', 'piąty', 'czwarty', 'trzeci', 'drugi', 'pierwszy'];
  assert.equal(snapshotLog(rows), '  LOG: trzeci ⏎ czwarty ⏎ piąty ⏎ szósty ⏎ siódmy ⏎ ósmy');
});

test('M346/B: krótki i pusty log nie gubią wpisów ani nie odwracają chronologii', () => {
  assert.equal(snapshotLog(['nowszy', 'starszy']), '  LOG: starszy ⏎ nowszy');
  assert.equal(snapshotLog([]), '  LOG: ');
});

test('M346/C: kolektor odrzuceń przypisuje nowe powody do nowej akcji, nie powtarza starego', () => {
  const c = collector('collectRejections');
  c.setRows(['pierwszy błąd']); c.collect('akcja A');
  c.setRows(['trzeci błąd', 'drugi błąd', 'pierwszy błąd']);
  c.ctx.tickedThisWindow = true;
  c.collect('akcja B'); c.collect('bez nowego odrzucenia');
  assert.deepEqual(c.records.map((r) => [r.action, r.reason, r.afterTick]), [
    ['akcja A', 'pierwszy błąd', false],
    ['akcja B', 'drugi błąd', true],
    ['akcja B', 'trzeci błąd', true],
  ]);
});

test('M346/D: po skróceniu logu kolektor odrzuceń rozpoczyna od nowej zawartości', () => {
  const c = collector('collectRejections');
  c.setRows(['stary 2', 'stary 1']); c.collect('poprzednia partia');
  c.setRows(['nowy']); c.collect('nowa partia');
  assert.equal(c.records.length, 3);
  assert.equal(c.records.at(-1).reason, 'nowy');
});

test('M346/E: dwa identyczne odrzucenia są dwoma zdarzeniami, nie deduplikujemy po tekście', () => {
  const c = collector('collectRejections');
  c.setRows(['odrzucone']); c.collect('A');
  c.setRows(['odrzucone', 'odrzucone']); c.collect('B');
  assert.deepEqual(c.records.map((r) => r.action), ['A', 'B']);
});

test('M346/F: istniejący kolektor dowodów auto-pass zachowuje kolejność i filtr', () => {
  const c = collector('collectMainLog');
  c.setRows(['Auto-pass: stary', 'Nowa partia']); c.collect();
  c.setRows(['Auto-pass: drugi', 'zwykły wpis', 'Auto-pass: pierwszy', 'Auto-pass: stary', 'Nowa partia']);
  c.collect(); c.collect();
  assert.deepEqual(c.printed, ['  LOG: Auto-pass: stary', '  LOG: Auto-pass: pierwszy', '  LOG: Auto-pass: drugi']);
});

test('M346/G: wspólny ekstraktor nie mutuje wejścia i dla zera nowych wpisów daje pustkę', () => {
  assert.equal(typeof extractors.chronologicalLogEntries, 'function');
  const rows = Object.freeze(['nowy', 'starszy', 'najstarszy']);
  assert.deepEqual(extractors.chronologicalLogEntries(rows, 2), ['starszy', 'nowy']);
  assert.deepEqual(extractors.chronologicalLogEntries(rows, 0), []);
  assert.deepEqual(extractors.chronologicalLogEntries(rows, -1), []);
  assert.deepEqual(extractors.chronologicalLogEntries(rows, 20), ['najstarszy', 'starszy', 'nowy']);
});

const logWindow = (logTail, newestLogEntry) => ({
  actions: ['Dalej (pass)', 'Poddaj partię'], gameOver: false, logTail, newestLogEntry,
});
const staleFlags = (lines, windowRecords) => runDetectors(lines, { windowRecords })
  .filter((f) => /Nieaktualny ogon logu/.test(f.message));

test('M346/H: detektor porównuje ogon z niezależnym najnowszym wpisem DOM, także bez snapshotów', () => {
  const windows = [logWindow(['dawny wpis'], 'nowe zdarzenie')];
  const quiet = staleFlags([], windows);
  const verbose = staleFlags(['  LOG: dawny wpis'], windows);
  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].category, 'info');
  assert.match(quiet[0].evidence, /nowe zdarzenie/);
  assert.deepEqual(verbose, quiet, 'tryb logowania nie decyduje o detekcji');
});

test('M346/I: aktualny/pusty log i stare rekordy bez danych nie dają fałszywych alarmów', () => {
  assert.deepEqual(staleFlags([], [logWindow(['stary', 'nowy'], 'nowy'), logWindow([], null), { actions: [], gameOver: true }]), []);
  assert.deepEqual(staleFlags([], null), []);
});
