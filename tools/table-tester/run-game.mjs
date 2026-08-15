#!/usr/bin/env node
/**
 * Żywy tester stołu — „gracz automatyczny" na prawdziwym artefakcie.
 *
 * Ładuje zbudowany jednoplikowy artefakt `dist/mtg-table.html` w jsdom
 * (headless DOM bez przeglądarki), uruchamia partię człowiek-vs-bot i gra
 * rolę GRACZA: klika akcje w panelu „Twoje działania", odpowiada na modale
 * wyboru (mulligan, szukanie, scry/surveil, wizardy walki itd.), zamyka
 * modal „Rozgrywka" — dokładnie tak, jak robiłby to człowiek.
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
import { extractBotMoves, extractModalChoice, extractTileText } from './extract.mjs';
import { runDetectors, formatFindings } from './detectors.mjs';

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
    // M97: profil zachowania gracza — dotąd tester zawsze klikał „pierwszą
    // opcję", więc całe gałęzie UI (inne tryby modalne, inne cele, bloki,
    // ptaszki) nigdy nie były odwiedzane.
    profile: 'greedy',
    policySeed: 1,
    tickRate: 0,
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
    else if (a === '--profile' || a === '-p') { opts.profile = take(i, a); i += 1; }
    else if (a === '--policy-seed') { opts.policySeed = Number(take(i, a)); i += 1; }
    else if (a === '--tick-rate') { opts.tickRate = Number(take(i, a)); i += 1; }
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
  --profile, -p <nazwa>  profil gracza: greedy | random | defensive | explorer
                         | impatient (klika W TRAKCIE pauzy bota)        [greedy]
  --policy-seed <n>      seed decyzji profilu (deterministycznie)                  [1]
  --tick-rate <0..1>     jak często gracz „ptaszkuje" akcję (wycisza auto-pass)    [0]
  --help                 ten tekst

Profile gracza:
  greedy     — jak dotąd: pierwsza sensowna akcja, wszyscy do ataku (regresja)
  random     — losowy wybór akcji i opcji modala (odwiedza rzadkie gałęzie UI)
  defensive  — unika ataku, chętnie blokuje, woli zdolności od czarów
  explorer   — preferuje akcje NIEODWIEDZONE w tej partii (pokrycie UI)

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
export async function runTableGame({
  human, bot, seed, steps, out, quiet, snapshotEvery, log,
  profile = 'greedy', policySeed = 1, tickRate = 0,
}) {
  const { document } = boot();
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  /** Unikalne kafle strefy (każda karta raz; pola kafla rozdzielone "·"
   *  przez extractTileText — bez zlepień sąsiednich <div> jak w M80–M87). */
  const tiles = (zoneSel, limit = 12) => {
    const seen = new Set();
    const out = [];
    for (const el of $$(`${zoneSel} .tile`)) {
      const t = extractTileText(el);
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

  // --- M97: deterministyczna losowość polityki (ADR 0005 — bez Math.random) --
  let rngState = (policySeed >>> 0) || 1;
  const rnd = () => {
    // xorshift32 — powtarzalny przy tym samym --policy-seed.
    rngState ^= rngState << 13; rngState >>>= 0;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5; rngState >>>= 0;
    return rngState / 0xffffffff;
  };
  const pickRandom = (arr) => (arr.length ? arr[Math.floor(rnd() * arr.length) % arr.length] : null);

  // Pokrycie UI: co gracz już widział / kliknął (profil `explorer` i raport).
  const seenActions = new Set();     // etykiety akcji (bez wartości zmiennych)
  const clickedActions = new Set();
  const seenModals = new Set();
  const actionRecords = [];          // { label, hasTick } — dla detektora osi 3
  // M99: panel akcji w KAŻDYM kroku — detektor martwego okna (Forever Young)
  // nie może zależeć od snapshotów, bo `--quiet` je wyłącza.
  const windowRecords = [];          // { actions: string[], gameOver: boolean }
  const normalize = (t) => t.replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim().slice(0, 60);

  // --- M97: ptaszkowanie akcji (oś 3) --------------------------------------
  // Gracz-człowiek zaznacza ptaszek „nie przerywaj auto-passu" przy akcjach,
  // których nie chce oglądać. Tester rejestruje, KTÓRE akcje w ogóle mają
  // ptaszek (detektor osi 3), i przy --tick-rate > 0 czasem go klika.
  const recordAndMaybeTick = async (buttons) => {
    for (const { b, t } of buttons) {
      const tick = b.querySelector?.('.action-ignore-input');
      const label = normalize(t);
      if (!seenActions.has(label)) {
        seenActions.add(label);
        actionRecords.push({ label: t.trim(), hasTick: Boolean(tick) });
      }
      if (tick && !tick.checked && tickRate > 0 && rnd() < tickRate) {
        tick.click();
        await sleep(30);
        logL(`  [ptaszek] wyciszam: ${t.slice(0, 70)}`);
      }
    }
  };

  // Polityka gracza: kolejność priorytetów akcji w panelu „Twoje działania".
  const pickAction = () => {
    const labels = $$('#actions button.action')
      .map((b) => ({ b, t: text(b) }))
      .filter(({ t }) => !t.includes('Poddaj'));
    if (labels.length === 0) return null;
    const by = (re) => labels.find(({ t }) => re.test(t));
    const all = (re) => labels.filter(({ t }) => re.test(t));

    // Akcje, które ZAWSZE wykonujemy najpierw — inaczej gra stoi
    // (obowiązkowe kroki i domknięcia efektów rozstrzyganych etapami).
    // M99: profil `impatient` gra jak człowiek, który NIE czeka na zamknięcie
    // pauzy bota — najpierw próbuje własnego ruchu, a „Wznów grę bota" klika
    // dopiero, gdy nic innego nie ma. Tylko taki gracz trafia w klasę błędów
    // „odrzucona komenda gubi pauzę" (M90/B, Forever Young): pozostałe profile
    // zawsze zamykały pauzę pierwszym kliknięciem i nigdy jej nie dotykały.
    const mandatory = by(/Dobierz kartę/)
      || by(/^Odrzuć:/)
      || (profile === 'impatient' ? null : by(/Wznów grę bota/))
      || by(/zakończ|Zakończ/)
      || by(/Rozstrzygnij obrażenia/);
    if (mandatory) return mandatory;

    // Pula „ruchów rozwijających" — z niej wybiera profil.
    const plays = all(/Zagraj ląd|^Rzuć:|^Zagraj:|^Aktywuj:|^Cycling:|^Wyposaż:|^Flashback:|^Cel czaru|^Cel zdolności:|^Bestow:|^Aura:|^Wybierz:|cel triggera/);
    const decisions = all(/Odrzucenie karty|Poświęcenie|Zapłata|Dopłata|Karta z ręki|Wybór koloru|Wybór typu|Kolejność|Proliferate|Cel obrażeń|Rozdzielenie|Wybierz tryb|wybór trybu|Moonlit|Przekierowanie|Dobrowolna|Index|Rozstrzygnij|Pokój|wybierz cel|Karta do ręki|Szukanie|Wybór efektu|Karta na wierzch|Karty do grobu|Surveil|Stomping|odsłonięte|reveal_exile|Craft:|wygnaj|pomijam|brak karty/);
    const pass = by(/Dalej|pass/);

    // Decyzje blokujące zawsze przed pasem (inaczej gra utyka).
    if (decisions.length > 0 && plays.length === 0) return decisions[0];

    switch (profile) {
      case 'random': {
        // Losowo spośród WSZYSTKIEGO, co da się kliknąć (czasem pass) —
        // odwiedza gałęzie UI, których stała kolejność priorytetów nigdy
        // nie dotyka.
        const pool = [...plays, ...decisions];
        if (pool.length === 0) return pass ?? labels[0];
        if (pass && rnd() < 0.15) return pass;
        return pickRandom(pool);
      }
      case 'defensive': {
        // Gracz ostrożny: zdolności i lądy tak, agresywne czary rzadziej,
        // chętnie oddaje priorytet (więcej okien reakcji dla bota).
        const safe = all(/Zagraj ląd|^Aktywuj:|^Cycling:|^Wyposaż:/);
        if (safe.length > 0) return pickRandom(safe);
        if (decisions.length > 0) return decisions[0];
        if (pass && rnd() < 0.5) return pass;
        return plays[0] ?? pass ?? labels[0];
      }
      case 'impatient': {
        // Niecierpliwy: cokolwiek własnego, byle nie czekać. Gdy engine ruch
        // odrzuci (bo priorytet ma wstrzymany bot), UI MUSI nadal dawać
        // wyjście — „Wznów grę bota" zamiast samego „Poddaj partię".
        const pool = [...plays, ...decisions];
        if (pool.length > 0) return pickRandom(pool);
        return by(/Wznów grę bota/) ?? pass ?? labels[0];
      }
      case 'explorer': {
        // Maksymalne pokrycie UI: najpierw akcje, których jeszcze NIE
        // klikaliśmy w tej partii.
        const fresh = [...plays, ...decisions].filter(({ t }) => !clickedActions.has(normalize(t)));
        if (fresh.length > 0) return fresh[0];
        const pool = [...plays, ...decisions];
        if (pool.length > 0) return pickRandom(pool);
        return pass ?? labels[0];
      }
      case 'greedy':
      default:
        // Zachowanie historyczne (regresja wyników z M80–M96).
        return by(/Zagraj ląd/)
          || by(/^Rzuć:/)
          || by(/^Zagraj:/)
          || by(/^Aktywuj:/)
          || by(/^Wybierz:/)
          || by(/cel triggera/)
          || by(/^Cel zdolności:|^Cel czaru:|^Bestow:|^Aura:/)
          || (decisions.length > 0 ? decisions[0] : null)
          || pass;
    }
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
        // M97: profil decyduje o skali ataku. `greedy` atakuje wszystkim
        // (zachowanie historyczne), `defensive` trzyma stwory w obronie,
        // `random`/`explorer` losują podzbiór — dzięki temu bot dostaje
        // różne sytuacje bojowe, a nie zawsze „wszyscy do przodu".
        let attackers = targets;
        if (profile === 'defensive') attackers = [];
        else if (profile === 'random' || profile === 'explorer') {
          attackers = targets.filter(() => rnd() < 0.6);
          if (attackers.length === 0 && targets.length > 0 && rnd() < 0.5) attackers = [targets[0]];
        }
        for (const t of attackers) { t.click(); await sleep(30); }
        logL(`  [combat wizard] atakuję ${attackers.length} z ${targets.length} stworów (profil ${profile})`);
      } else if (targets.length > 0) {
        // Bloki: wizard renderuje TEN SAM bloker w sekcji każdego atakującego,
        // więc zaznaczenie go dwa razy daje `illegal_blockers: Blocker jest
        // użyty więcej niż raz` (M98). Każdy bloker wybieramy najwyżej RAZ —
        // klucz to nazwa stwora z wiersza wizarda.
        const usedBlockers = new Set();
        const candidates = [];
        for (const t of targets) {
          const key = text(t.parentElement).slice(0, 60);
          if (usedBlockers.has(key)) continue;
          usedBlockers.add(key);
          candidates.push(t);
        }
        const blockers = (profile === 'defensive' || profile === 'explorer')
          ? candidates
          : (profile === 'random' ? candidates.filter(() => rnd() < 0.7) : [candidates[0]]);
        const picked = blockers.length > 0 ? blockers : [candidates[0]];
        for (const t of picked) { t.click(); await sleep(40); }
        logL(`  [combat wizard] blokuję ${picked.length} stworami: ${text(picked[0].parentElement).slice(0, 45)}`);
      }
      const confirm = opts.find((b) => /Zatwierdź/.test(text(b)));
      if (confirm) {
        logL(`  [combat wizard] ${text(confirm)}`);
        confirm.click();
        await sleep(80);
        // M98: wizard potrafi ODMÓWIĆ zatwierdzenia i pokazać podpowiedź
        // (menace wymaga 2+ blokerów, „can't block alone"). Człowiek by ją
        // przeczytał i poprawił wybór — tester dotąd brnął dalej, generując
        // `illegal_blockers` i fałszywe zgłoszenia detektora reguł.
        const err = $('#choice-request .combat-wizard-error');
        if (err && visible($('#choice-request'))) {
          logL(`  [combat wizard] odmowa: ${text(err).slice(0, 70)} — poprawiam wybór`);
          // Najprostsza legalna korekta: „Bez bloków" / „Bez ataku".
          const clear = $$('#choice-request button').find((b) => /Bez blok|Bez ataku/.test(text(b)));
          if (clear) { clear.click(); await sleep(60); }
          const again = $$('#choice-request .choice-request-option').find((b) => /Zatwierdź/.test(text(b)));
          if (again) { again.click(); await sleep(80); }
        }
        return true;
      }
    }
    if (opts.length > 0) {
      // Szukanie: nie bierz pierwszej oferty „nie znajduj karty", jeśli jest
      // realny kandydat (Caravan Vigil / Pilgrim's Eye).
      const found = opts.find((b) => {
        const s = text(b);
        return /Szukanie:/.test(s) && !/nie znajduj/.test(s);
      });
      // M97: dotąd tester ZAWSZE klikał pierwszą opcję, więc tryby modalne
      // (Choose one), alternatywne cele i warianty poświęcenia nigdy nie były
      // odwiedzane. Profil decyduje, którą opcję wybiera gracz.
      seenModals.add(normalize(intro));
      let chosen;
      if (found) chosen = found;
      else if (profile === 'random') chosen = pickRandom(opts);
      else if (profile === 'explorer') {
        const fresh = opts.filter((b) => !clickedActions.has(normalize(text(b))));
        chosen = fresh[0] ?? pickRandom(opts);
      } else if (profile === 'defensive' && opts.length > 1) {
        // Ostrożny gracz woli opcję „nie rób nic/pomiń", gdy istnieje.
        chosen = opts.find((b) => /pomij|nie |brak|zostaw/i.test(text(b))) ?? opts[0];
      } else chosen = opts[0];
      clickedActions.add(normalize(text(chosen)));
      // M88: lista opcji i wybrana oznaczona ▶ — bez obcinania kontekstu
      // (poprzednio intro.slice(0, 120) + text(chosen).slice(0, 80)).
      const optTexts = opts.map((b) => text(b));
      const chosenIndex = opts.indexOf(chosen);
      const lines = extractModalChoice({ intro, options: optTexts.map((t) => ({ text: t })), chosenIndex });
      for (const line of lines) logL(`  [modal choice] ${line}`);
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
      // M88: zamiast text() całego body + slice(0, 400) (zlepia wpisy i
      // ucina kontekst), czytamy poszczególne <div.bot-move-line> z modala
      // i logujemy każdy jako osobną linię. W realnej przeglądarce
      // użytkownik widzi układ CSS, ale w transkrypcie pojawiały się zlepki
      // typu „Faza: Główna 1G Garruk's Companion wchodzi na bitwisko".
      const head = $('#bot-move .modal-head h3');
      const title = head ? (head.textContent ?? '').trim() : '';
      const entryEls = $$('#bot-move-body .bot-move-line');
      const entries = entryEls.map((el) => ({
        text: (el.textContent ?? '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '),
      })).filter((e) => e.text);
      const lines = extractBotMoves({ title: title || '(bez tytułu)', entries });
      for (const line of lines) logL(`  [ROZGRYWKA] ${line}`);
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

  // Czy partia już się skończyła (panel akcji jest wtedy pusty prawidłowo).
  const isGameOver = () => /Koniec partii|wygrywa|wygrał|przegrał/.test(text($('#turn-indicator')));

  const step = async () => {
    // M99: `impatient` z rozmysłem NIE zamyka modala ruchu bota od razu —
    // klika w panel akcji „przez" otwartą pauzę, tak jak gracz na telefonie.
    if (profile !== 'impatient' && await closeBotMove()) return 'botmove';
    for (let i = 0; i < 5; i += 1) {
      if (await resolveModal()) { await sleep(80); continue; }
      break;
    }
    // M97: zanim klikniemy — zarejestruj widoczne akcje (detektor osi 3:
    // czy każda wyciszalna akcja ma ptaszek) i ewentualnie zaptaszkuj.
    // M99: zapis okna decyzyjnego ZANIM klikniemy — to jedyny moment, w którym
    // widać dokładnie to, co widzi gracz (łącznie z „samym Poddaj partię").
    windowRecords.push({
      actions: $$('#actions button.action').map((b) => text(b).trim()).filter(Boolean),
      gameOver: isGameOver(),
    });
    await recordAndMaybeTick($$('#actions button.action')
      .map((b) => ({ b, t: text(b) }))
      .filter(({ t }) => !t.includes('Poddaj')));
    const pick = pickAction();
    if (!pick) return 'none';
    clickedActions.add(normalize(pick.t));
    logL(`  >> ${pick.t.slice(0, 110)}`);
    pick.b.click();
    // M99: DOUBLE-TAP. Panel akcji renderuje przyciski legalne w chwili
    // rysowania; gracz na telefonie potrafi stuknąć dwa razy, zanim UI się
    // przerysuje — druga komenda trafia do sesji już PO zmianie stanu (często
    // w trakcie pauzy bota) i zostaje odrzucona przez engine. Właśnie tak
    // powstał ekran „tylko Poddaj partię" (M90/B, Forever Young). Żaden
    // profil klikający „raz i czekam" tej ścieżki nie odwiedza.
    if (profile === 'impatient' && rnd() < 0.5) pick.b.click();
    await sleep(120);
    // Stan PO (ewentualnym) odrzuceniu — to jest okno, które zobaczył gracz.
    if (profile === 'impatient') {
      windowRecords.push({
        actions: $$('#actions button.action').map((b) => text(b).trim()).filter(Boolean),
        gameOver: isGameOver(),
      });
    }
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
  logL(`== NOWA PARTIA: gracz=${human} vs bot=${bot}, seed=${seed}, profil=${profile}, policy-seed=${policySeed}, tick-rate=${tickRate} ==`);
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
  // --- M97: raport pokrycia UI + automatyczne detektory ---------------------
  logL('');
  logL(`== POKRYCIE UI == akcje widziane: ${seenActions.size}, kliknięte: ${clickedActions.size}, modale: ${seenModals.size}`);
  const findings = runDetectors(lines, { actionRecords, windowRecords, profile });
  for (const line of formatFindings(findings)) logL(line);

  flush();
  return { lines, findings, windowRecords, coverage: { seenActions: [...seenActions], clickedActions: [...clickedActions], modals: [...seenModals] } };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); process.exit(0); }
    runTableGame({ ...opts, log: (s) => console.log(s) })
      .then((r) => console.log(`Transkrypt zapisany: ${opts.out} | zgłoszeń detektorów: ${r?.findings?.length ?? 0}`))
      .catch((e) => { console.error('BŁĄD:', e.message); process.exit(1); });
  } catch (e) {
    console.error('BŁĄD:', e.message);
    console.log(HELP);
    process.exit(1);
  }
}

