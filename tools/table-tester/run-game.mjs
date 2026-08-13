#!/usr/bin/env node
/**
 * Żywy tester stołu — „gracz automatyczny" na prawdziwym artefakcie.
 *
 * Ładuje zbudowany jednoplikowy artefakt `dist/mtg-table.html` w jsdom
 * (headless DOM bez przeglądarki), uruchamia partię człowiek-vs-bot i gra
 * rolę GRACZA: klika akcje w panelu „Twoje działania", odpowiada na modale
 * wyboru (mulligan, szukanie, scry/surveil, wizardy walki itd.), zamyka
 * modal „Ruch przeciwnika" — dokładnie tak, jak robiłby to człowiek.
 *
 * Efekt: transkrypt obserwacji — co gracz widzi na stole w kolejnych krokach
 * (wskaźnik tury, stos, panel akcji, ręka, pola, log). Służy do audytu UX
 * i rozgrywki „z perspektywy gracza": etykiety, modale, zachowanie bota,
 * kolejność rozstrzygania — rzeczy, których testy engine nie łapią.
 *
 * Wymagania: Node >= 22, `npm run build` (artefakt), zależność `jsdom`
 * (instalowana w tym katalogu: `npm i`).
 *
 * Użycie:
 *   node run-game.mjs --human green --bot red --seed 42 --steps 300 --out t.txt
 *
 * Pełna instrukcja: docs/setup/TESTER_STOLU.md
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT = path.resolve(__dirname, '../../dist/mtg-table.html');
const DECKS_DIR = path.resolve(__dirname, '../../decks');

// ---------------------------------------------------------------------------
// Argumenty CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    human: 'green',
    bot: 'red',
    seed: 42,
    steps: 300,
    out: 'transcript.txt',
    quiet: false,
    snapshotEvery: 3,
    help: false,
  };
  const take = (i, name) => {
    if (i + 1 >= argv.length) throw new Error(`Opcja ${name} wymaga wartości`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--human' || a === '-h') { opts.human = take(i, a); i += 1; }
    else if (a === '--bot' || a === '-b') { opts.bot = take(i, a); i += 1; }
    else if (a === '--seed' || a === '-s') { opts.seed = Number(take(i, a)); i += 1; }
    else if (a === '--steps' || a === '-n') { opts.steps = Number(take(i, a)); i += 1; }
    else if (a === '--out' || a === '-o') { opts.out = take(i, a); i += 1; }
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--snapshot-every') { opts.snapshotEvery = Number(take(i, a)); i += 1; }
    else if (a === '--help') opts.help = true;
    else throw new Error(`Nieznana opcja: ${a}`);
  }
  return opts;
}

const HELP = `Żywy tester stołu — automatyczny gracz na prawdziwym artefakcie (jsdom).

Użycie:
  node run-game.mjs [opcje]

Opcje:
  --human <talia>        talia gracza (nazwa pliku decks/*.txt bez .txt) [green]
  --bot <talia>          talia bota                                              [red]
  --seed <n>             seed partii                                            [42]
  --steps <n>            limit kroków gry                                      [300]
  --out <plik>           plik transkryptu                              [transcript.txt]
  --quiet, -q            bez snapshotów co krok (mniejszy transkrypt)
  --snapshot-every <n>   snapshot co n kroków (tylko przy --quiet)                 [3]
  --help                 ten tekst

Talie: ${fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', '')).join(', ')}

Przed uruchomieniem: npm run build (artefakt dist/mtg-table.html) i npm i (jsdom).

Pełna instrukcja: docs/setup/TESTER_STOLU.md
`;

// ---------------------------------------------------------------------------
// jsdom + polyfill-e
// ---------------------------------------------------------------------------
function boot() {
  if (!fs.existsSync(ARTIFACT)) {
    throw new Error(`Brak artefaktu: ${ARTIFACT}\nUruchom najpierw: npm run build`);
  }
  const html = fs.readFileSync(ARTIFACT, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:8123/table',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = (id) => clearTimeout(id);
  if (!window.crypto?.getRandomValues) {
    window.crypto = { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(Math.random() * 256); return arr; } };
  }
  window.confirm = () => true;
  return { window, document };
}

// ---------------------------------------------------------------------------
// Pomocnicze (document z boot(); funkcje budowane per-uruchomienie)
// ---------------------------------------------------------------------------
const text = (el) => (el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => el && el.className && String(el.className).includes('active');

// ---------------------------------------------------------------------------
// Główny sterownik
// ---------------------------------------------------------------------------
export async function runTableGame({ human, bot, seed, steps, out, quiet, snapshotEvery, log }) {
  const { document } = boot();
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  /** Unikalne kafle strefy (każda karta raz; textContent kafla = cała karta). */
  const tiles = (zoneSel, limit = 12) => {
    const seen = new Set();
    const out = [];
    for (const el of $$(`${zoneSel} .tile`)) {
      const t = text(el);
      if (!t || t.length < 3) continue;
      const key = t.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };
  const lines = [];
  const logL = (s) => { lines.push(s); log?.(s); };
  const flush = () => fs.appendFileSync(out, lines.join('\n') + '\n', 'utf8');

  // Polityka gracza: kolejność priorytetów akcji w panelu „Twoje działania".
  const pickAction = () => {
    const labels = $$('#actions button.action')
      .map((b) => ({ b, t: text(b) }))
      .filter(({ t }) => !t.includes('Poddaj'));
    const by = (re) => labels.find(({ t }) => re.test(t));
    return by(/Dobierz kartę/)
      || by(/Zagraj ląd/)
      || by(/^Rzuć:/)
      || by(/^Zagraj:/)      // cast_permanent (stwory/artefakty/auray)
      || by(/^Aktywuj:/)
      || by(/^Odrzuć:/)   // discard choice (limit ręki / koszt / efekt)
      || by(/Wznów grę bota/)
      || by(/^Wybierz:/)     // otwiera modal decyzji (szukanie/scry/combat...)
      || by(/cel triggera/)  // resolve_trigger_target (cel zdolności triggerowanej)
      || by(/^Cel zdolności:|^Cel czaru:|^Bestow:|^Aura:/) // grupy wyboru celu
      // Decyzje blokujące (resolve_*) — otwierają modal z opcjami.
      // Gracz-klikacz wybiera pierwszą opcję w modalu (resolveModal).
      || by(/Odrzucenie karty|Poświęcenie|Zapłata|Dopłata|Karta z ręki|Wybór koloru|Wybór typu|Kolejność|Proliferate|Cel obrażeń|Rozdzielenie|Wybierz tryb|wybór trybu|Moonlit|Przekierowanie|Dobrowolna|Index|Rozstrzygnij|Pokój|wybierz cel|Karta do ręki|Szukanie|Wybór efektu|Karta na wierzch|Karty do grobu|Surveil|Stomping|odsłonięte|reveal_exile|Craft:|wygnaj|pomijam|brak karty/)
      || by(/Dalej|pass/);
  };

  const resolveModal = async () => {
    const cr = $('#choice-request');
    if (!cr || !visible(cr)) return false;
    const intro = text($('#choice-request-body'));
    const opts = $$('#choice-request .choice-request-option');
    // Combat wizard: zaznacz pierwszego dowolnego atakującego (albo blokera),
    // potem zatwierdź. Dla bloków zaznaczamy po jednym blokerze na PIERWSZEGO
    // atakującego (prosta heurystyka), żeby obserwować walkę stwór–stwór.
    const toggles = $$('#choice-request .combat-wizard-toggle');
    if (toggles.length > 0 && /(atakujących|blokujących)/.test(intro)) {
      // Atakujący: zaznacz WSZYSTKIE dostępne (dla „can't attack alone" potrzebny
      // partner — inaczej prosta heurystyka utyka na ciągłych odrzuceniach).
      // Bloki: zaznacz po jednym blokerze na PIERWSZEGO atakującego.
      const isAttackers = /atakujących/.test(intro);
      const targets = toggles.filter((i) => !i.disabled && !i.checked);
      if (isAttackers) {
        for (const t of targets) { t.click(); await sleep(30); }
        logL(`  [combat wizard] atakuję ${targets.length} stworami`);
      } else if (targets.length > 0) {
        targets[0].click(); await sleep(60);
        logL(`  [combat wizard] blokuję: ${text(targets[0].parentElement).slice(0, 50)}`);
      }
      const confirm = opts.find((b) => /Zatwierdź/.test(text(b)));
      if (confirm) { logL(`  [combat wizard] ${text(confirm)}`); confirm.click(); await sleep(80); return true; }
    }
    if (opts.length > 0) {
      // Szukanie: nie bierz pierwszej oferty „nie znajduj karty", jeśli jest
      // realny kandydat (Caravan Vigil / Pilgrim's Eye).
      const found = opts.find((b) => {
        const s = text(b);
        return /Szukanie:/.test(s) && !/nie znajduj/.test(s);
      });
      const chosen = found ?? opts[0];
      logL(`  [modal choice] ${intro.slice(0, 120)} -> klikam opcję: ${text(chosen).slice(0, 80)}`);
      chosen.click();
      await sleep(80);
      return true;
    }
    const confirm = $$('#choice-request button').find((b) => /Zatwierdź|Dalej|OK|Domyślnie/.test(text(b)));
    if (confirm) { logL(`  [modal wizard] ${intro.slice(0, 100)} -> ${text(confirm).slice(0, 60)}`); confirm.click(); await sleep(80); return true; }
    return false;
  };

  const closeBotMove = async () => {
    const bm = $('#bot-move');
    if (bm && visible(bm)) {
      const title = text($('#bot-move .modal-head h3'));
      const body = text($('#bot-move-body'));
      logL(`  [RUCH PRZECIWNIKA] ${title ? title : '(bez tytułu)'} :: ${body.slice(0, 400)}`);
      const ok = $('#bot-move-ok');
      if (ok) { ok.click(); await sleep(120); return true; }
    }
    return false;
  };

  const snapshot = (stepNo) => {
    const ti = text($('#turn-indicator'));
    const stack = $$('#stack-zone *').map((e) => text(e)).filter((t) => t && t.length > 2).slice(0, 6).join(' | ') || '(pusty)';
    const actions = $$('#actions button.action').map((b) => text(b)).slice(0, 14);
    const hand = tiles('#hand');
    const bfOwn = tiles('#bf-own');
    const bfEnemy = tiles('#bf-enemy');
    const logTail = $$('#log .log-event, #log .log-rejection, #log .log-system').map((e) => text(e)).slice(-6);
    logL(`\n--- krok ${stepNo} | ${ti} ---`);
    logL(`  STOS: ${stack}`);
    logL(`  AKCJE: ${actions.length ? actions.join('  ||  ') : '(brak)'}`);
    logL(`  RĘKA: ${hand.join(' | ') || '(pusta)'}`);
    logL(`  MOJE POLA: ${bfOwn.join(' | ') || '(puste)'}`);
    logL(`  POLA WROGA: ${bfEnemy.join(' | ') || '(puste)'}`);
    logL(`  LOG: ${logTail.join(' ⏎ ')}`);
  };

  const step = async () => {
    if (await closeBotMove()) return 'botmove';
    for (let i = 0; i < 5; i += 1) {
      if (await resolveModal()) { await sleep(80); continue; }
      break;
    }
    const pick = pickAction();
    if (!pick) return 'none';
    logL(`  >> ${pick.t.slice(0, 110)}`);
    pick.b.click();
    await sleep(120);
    if (await closeBotMove()) return 'botmove';
    for (let i = 0; i < 5; i += 1) {
      if (await resolveModal()) { await sleep(80); continue; }
      break;
    }
    return 'action';
  };

  // --- Start partii ---
  for (let i = 0; i < 100 && !($('#new-game') && $('#deck-human')?.options?.length); i += 1) await sleep(50);
  $('#seed').value = String(seed);
  for (const opt of $('#deck-human').options) if (opt.value === human) $('#deck-human').value = opt.value;
  for (const opt of $('#deck-bot').options) if (opt.value === bot) $('#deck-bot').value = opt.value;
  logL(`== NOWA PARTIA: gracz=${human} vs bot=${bot}, seed=${seed} ==`);
  $('#new-game').click();
  await sleep(300);

  for (let i = 0; i < steps; i += 1) {
    const res = await step();
    if (!quiet && (i % snapshotEvery === 0 || res === 'none')) snapshot(i);
    if (res === 'none') {
      const ti = text($('#turn-indicator'));
      const actions = $$('#actions button.action').map((b) => text(b));
      logL(`  [STOP] brak akcji w kroku ${i} | ${ti} | akcje: ${actions.join(',') || '(puste)'}`);
      break;
    }
    const ti = text($('#turn-indicator'));
    if (/Koniec partii|wygrywa|wygrał|przegrał/.test(ti)) {
      logL(`== KONIEC PARTII == ${ti}`);
      snapshot(i + 1);
      break;
    }
    if (i === steps - 1) logL(`== LIMIT KROKÓW (${steps}) ==`);
  }
  flush();
  return lines;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); process.exit(0); }
    runTableGame({ ...opts, log: (s) => console.log(s) })
      .then(() => console.log(`Transkrypt zapisany: ${opts.out}`))
      .catch((e) => { console.error('BŁĄD:', e.message); process.exit(1); });
  } catch (e) {
    console.error('BŁĄD:', e.message);
    console.log(HELP);
    process.exit(1);
  }
}

