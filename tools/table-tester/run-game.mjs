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
import { runDetectors, formatFindings, harmfulCardNames } from './detectors.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT = path.resolve(__dirname, '../../dist/mtg-table.html');
const DECKS_DIR = path.resolve(__dirname, '../../decks');

// ---------------------------------------------------------------------------
// Argumenty CLI
// ---------------------------------------------------------------------------
export function parseArgs(argv) {
  const opts = {
    // M203: talie per PLAN od M178 (ADR 0023) — `green`/`red` przestały
    // istnieć, a tester grał wtedy tym, co artefakt miał wybrane domyślnie,
    // nagłówkując transkrypt podaną nazwą (cichy fałsz). Domyślne = pierwsza
    // i czwarta talia stałej próbki benchmarku (tools/benchmark.mjs).
    human: 'dominaria',
    bot: 'ravnica',
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
    listDecks: false,
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
    else if (a === '--list-decks') opts.listDecks = true;
    else if (a === '--help') opts.help = true;
    else throw new Error(`Nieznana opcja: ${a}`);
  }
  // M203: nieistniejąca talia to BŁĄD, nie cichy fallback. Sterownik wybiera
  // talię pętlą „jeśli opcja pasuje, ustaw" — bez tego sprawdzenia partia
  // startowała na innej talii, niż zapowiadał nagłówek transkryptu (L24).
  const available = deckNames();
  for (const [flag, deck] of [['--human', opts.human], ['--bot', opts.bot]]) {
    if (!available.includes(deck)) {
      throw new Error(`Nie ma talii „${deck}" (${flag}). Dostępne: ${available.join(', ')}`);
    }
  }
  return opts;
}

/** Nazwy talii w `decks/` (bez rozszerzenia) — jedno źródło dla CLI i pomocy. */
export function deckNames() {
  return fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', ''));
}

const HELP = `Żywy tester stołu — automatyczny gracz na prawdziwym artefakcie (jsdom).

Użycie:
  node run-game.mjs [opcje]

Opcje:
  --human <talia>        talia gracza (nazwa pliku decks/*.txt bez .txt) [dominaria]
  --bot <talia>          talia bota                                              [ravnica]
  --seed <n>             seed partii                                            [42]
  --steps <n>            limit kroków gry                                      [300]
  --out <plik>           plik transkryptu                              [transcript.txt]
  --quiet, -q            bez snapshotów co krok (mniejszy transkrypt)
  --snapshot-every <n>   snapshot co n kroków (tylko przy --quiet)                 [3]
  --profile, -p <nazwa>  profil gracza: greedy | random | defensive | explorer
                         | impatient (klika W TRAKCIE pauzy bota)        [greedy]
  --policy-seed <n>      seed decyzji profilu (deterministycznie)                  [1]
  --tick-rate <0..1>     jak często gracz „ptaszkuje" akcję (wycisza auto-pass)    [0]
  --list-decks           wypisz talie z decks/ i zakończ (bez partii)
  --help                 ten tekst

Profile gracza:
  greedy     — jak dotąd: pierwsza sensowna akcja, wszyscy do ataku (regresja)
  random     — losowy wybór akcji i opcji modala (odwiedza rzadkie gałęzie UI)
  defensive  — unika ataku, chętnie blokuje, woli zdolności od czarów
  explorer   — preferuje akcje NIEODWIEDZONE w tej partii (pokrycie UI)

Talie: ${deckNames().join(', ')}

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
    // M103: ?tester=1 włącza w artefakcie mostek window.__mtgDebug (sonda
    // „oferta bez skutku" — fingerprint stanu + wykonanie komendy na klonie).
    url: 'http://localhost:8123/table?tester=1',
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
  const { window: domWindow, document } = boot();
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  // M103 (L15): mostek diagnostyczny artefaktu (?tester=1) — sonda „oferta
  // bez skutku" (fingerprint + wykonanie komendy na klonie z pasywnym
  // przeciwnikiem). Bez mostka detektor `noop` po prostu nie działa.
  const debugApi = domWindow.__mtgDebug ?? null;
  /**
   * Kafle strefy (pola rozdzielone „·" przez extractTileText — bez zlepień
   * sąsiednich <div> jak w M80–M87).
   *
   * M126/#3: wcześniej snapshot ZWIJAŁ kafle o tym samym prefiksie (40 znaków
   * tekstu), więc dwa realne permanenty o tej samej nazwie widniały jako
   * JEDEN. Tak zniknął ze stołu drugi Guidestone Compass (token-kopia
   * z Cogwork Assemblera), a panel akcji pokazywał przy tym dwie grupy
   * „Cel zdolności: Guidestone Compass" — obraz stołu przeczył panelowi
   * i prowadził diagnozę na manowce (podejrzenie błędu grupowania w UI,
   * którego nie było).
   *
   * Transkrypt ma odwzorowywać stół, więc liczymy EGZEMPLARZE: identyczne
   * kafle zwijamy z jawnym mnożnikiem „×N" zamiast po cichu je gubić.
   */
  const tiles = (zoneSel, limit = 12) => {
    const counts = new Map();
    const order = [];
    for (const el of $$(`${zoneSel} .tile`)) {
      const t = extractTileText(el);
      if (!t || t.length < 3) continue;
      if (!counts.has(t)) { counts.set(t, 0); order.push(t); }
      counts.set(t, counts.get(t) + 1);
    }
    const out = [];
    for (const text of order) {
      const n = counts.get(text);
      out.push(n > 1 ? `${text} ×${n}` : text);
      if (out.length >= limit) break;
    }
    return out;
  };
  const lines = [];
  const logL = (s) => { lines.push(s); log?.(s); };
  // M171/Z5 (klasa L33): appendFileSync DOKLEJAŁ nowy przebieg do starego
  // pliku przy tym samym --out — transkrypt zawierał dwa przebiegi naraz
  // (stare linie sprzed fixu + nowe po nim) i wygenerował fałszywą hipotezę
  // o „niedziałającym fixie". Transkrypt = JEDEN przebieg.
  // M203: ścieżka względna jest liczona od katalogu narzędzia, nie od bieżącego
  // katalogu — uruchomienie z korzenia repo zostawiało `transcript.txt` obok
  // `package.json`, poza zasięgiem `.gitignore` (który pilnuje tylko
  // `tools/table-tester/transcript.txt`).
  const outPath = path.isAbsolute(out) ? out : path.resolve(__dirname, out);
  const flush = () => fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

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
  const actionRecords = [];          // { label, hasTick, commandKey } — detektor osi 3
  // M99: panel akcji w KAŻDYM kroku — detektor martwego okna (Forever Young)
  // nie może zależeć od snapshotów, bo `--quiet` je wyłącza.
  const windowRecords = [];          // { actions: string[], gameOver: boolean }
  // M103 (L15): rekordy sondy „oferta bez skutku" dla detektora `noop` —
  // { label, source, applied|scanned, probe } dla ofert panelu i modala.
  const probeRecords = [];
  // M104 (reguła M99): ODRZUCENIA komend zbierane strukturalnie. Dotąd
  // detektor `rules` widział je wyłącznie w linii `LOG:` snapshotu, więc pod
  // `--quiet` nie zgłaszał ich wcale. Sterownik czyta wpisy `.log-rejection`
  // z DOM po każdym kliknięciu i przekazuje różnicę do runDetectors.
  const rejectionRecords = [];
  let rejectionsSeen = 0;
  // M138/Z1 (reguła M99: dane strukturalne, nie parsowanie snapshotów):
  // nazwy permanentów NA MOIM polu bitwy, zbierane w każdym kroku. Detektor
  // `detectBotBuffsMyCreatures` musi wiedzieć, czyj jest cel — pod `--quiet`
  // linii „MOJE POLA:" w transkrypcie nie ma w ogóle.
  const myPermanentNames = new Set();
  const enemyPermanentNames = new Set();
  // Czy w BIEŻĄCYM oknie gracz zaznaczył ptaszek wyciszenia. Zaznaczenie
  // przewija grę (session.recheckAutoPass — feature 2026-08-11), więc
  // kliknięcie zaraz po nim trafia w panel sprzed przewinięcia i engine
  // odrzuca komendę. To ARTEFAKT POLITYKI testera (jak double-tap profilu
  // `impatient`), nie błąd reguł — detektor klasyfikuje go osobno.
  let tickedThisWindow = false;
  const collectRejections = (action) => {
    const entries = $$('#log .log-rejection').map((e) => text(e).trim()).filter(Boolean);
    for (let i = rejectionsSeen; i < entries.length; i += 1) {
      rejectionRecords.push({
        action: String(action ?? '').slice(0, 90),
        reason: entries[i].slice(0, 120),
        afterTick: tickedThisWindow,
      });
    }
    rejectionsSeen = entries.length;
  };
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
        // M189/Z3: rekord niesie TYP KOMENDY z `data-option-key` — etykieta
        // („Wybierz: Cel (7 opcji)") nie odróżnia wyciszalnego celu czaru od
        // OBOWIĄZKOWEJ decyzji narzuconej przez kartę (Cuombajj Witches:
        // `resolve_opponent_target`), a detektor osi 3 musi je rozdzielić.
        // Opcje grupy nie są w DOM przycisku (modal buduje je po kliknięciu),
        // więc źródłem prawdy jest klucz komendy, nie tekst.
        const optionKey = b.dataset?.optionKey ?? b.getAttribute?.('data-option-key') ?? '';
        actionRecords.push({ label: t.trim(), hasTick: Boolean(tick), commandKey: String(optionKey) });
      }
      if (tick && !tick.checked && tickRate > 0 && rnd() < tickRate) {
        tick.click();
        tickedThisWindow = true;
        await sleep(30);
        logL(`  [ptaszek] wyciszam: ${t.slice(0, 70)}`);
      }
    }
  };

  /**
   * M104: SKAN wszystkich widocznych ofert w oknie — nie tylko tej, którą
   * gracz kliknie. Do M103 sonda mierzyła wyłącznie kliknięcie, więc oferta
   * bez skutku, której polityka gracza akurat nie wybrała, nigdy nie była
   * mierzona (weryfikacja mutacyjna M104: cofnięta bramka „odkręć nietapnięty
   * ląd" pokazywała no-opy w panelu, a oś `noop` milczała — bo tester klikał
   * co innego). Sonda działa na KLONIE stanu, więc skan jest bezpieczny.
   *
   * Każdy klucz opcji sondujemy RAZ na partię (dedupe) i z limitem
   * PROBE_SCAN_CAP — inaczej koszt rośnie z kwadratem długości partii.
   */
  const probedKeys = new Set();
  const PROBE_SCAN_CAP = 600;
  const scanOffers = (buttons, source) => {
    if (!debugApi) return;
    for (const { b, t } of buttons) {
      const key = b?.dataset?.optionKey;
      if (!key || probedKeys.has(key)) continue;
      if (probedKeys.size >= PROBE_SCAN_CAP) return;
      probedKeys.add(key);
      let probe;
      try {
        probe = debugApi.probe(key);
      } catch {
        probe = { ok: false, reason: 'probe_throw' };
      }
      if (probe) probeRecords.push({ label: String(t ?? '').trim(), source, scanned: true, applied: false, probe });
    }
  };

  /**
   * M103 (L15) + M104: kliknięcie ZMIERZONE sondą „oferta bez skutku".
   * PRZED kliknięciem sonda wykonuje tę samą komendę na KLONIE stanu
   * (pasywny przeciwnik) — prawdziwej partii nie dotyka; PO kliknięciu
   * fingerprint mówi, czy partia klik w ogóle przyjęła (`applied`; klik
   * odrzucony przez UI nie jest dowodem na nic).
   *
   * `source` rozróżnia miejsce oferty: `panel` (przycisk „Twoje działania")
   * i `modal` (opcja wizarda wyboru — M104). Detektor traktuje je inaczej:
   * w modalu opcja „nic nie rób" jest legalnym wyborem, nie błędem.
   */
  const clickProbed = async (button, label, source, { doubleTap = false, settle = 120 } = {}) => {
    const optionKey = button?.dataset?.optionKey ?? null;
    let probe = null;
    if (optionKey && debugApi) {
      try {
        probe = debugApi.probe(optionKey);
      } catch {
        probe = { ok: false, reason: 'probe_throw' };
      }
    }
    const beforeFp = debugApi ? debugApi.fingerprint() : null;
    button.click();
    if (doubleTap) button.click();
    await sleep(settle);
    const afterFp = debugApi ? debugApi.fingerprint() : null;
    collectRejections(label);
    if (optionKey && probe) {
      probeRecords.push({
        label: String(label ?? '').trim(),
        source,
        applied: Boolean(beforeFp && afterFp && beforeFp !== afterFp),
        probe,
      });
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
      || by(/^Poświęć:/)
      || by(/^Weź ląd do ręki:/)
      || by(/^Nie bierz lądu/)
      || by(/^Rzuć z odbiciem:/)
      || by(/^Rzuć zawieszone:/)
      || (profile === 'impatient' ? null : by(/Wznów grę bota/))
      || by(/zakończ|Zakończ/)
      || by(/Rozstrzygnij obrażenia/);
    if (mandatory) return mandatory;

    // Pula „ruchów rozwijających" — z niej wybiera profil.
    // M155 (audyt żywym testerem): „Rzuć za warp:" (Weftblade Enhancer — nowa
    // mechanika Batch 38) to rzut PERMANENTA; bez wzorca tester nigdy nie
    // ćwiczył warp. Dokładamy do puli ruchów i priorytetów greedy.
    const plays = all(/Zagraj ląd|^Rzuć:|^Rzuć za warp:|^Zagraj:|^Aktywuj:|^Cycling:|^Wyposaż:|^Flashback:|^Cel czaru|^Cel zdolności:|^Bestow:|^Aura:|^Wybierz:|cel triggera|podziel \d+ obrażeni?[ae]?/);
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
          || by(/^Rzuć za warp:/)
          || by(/^Zagraj:/)
          || by(/^Aktywuj:/)
          || by(/^Wybierz:/)
          || by(/cel triggera/)
          || by(/podziel \d+ obrażeni/) // M172/E: wizard podziału obrażeń
          || by(/^Cel zdolności:|^Cel czaru:|^Bestow:|^Aura:/)
          || (decisions.length > 0 ? decisions[0] : null)
          || pass;
    }
  };

  /**
   * M106/Z9 (audyt stołu): KREATOR MANY (`#mana-wizard`, feature E.3a) —
   * rzut z niejednoznaczną płatnością otwiera modal „tapnij źródła po
   * jednym". Tester go nie znał, więc takie kliknięcie wyglądało w
   * transkrypcie na MARTWE (akcja zostawała w panelu), a cała ścieżka
   * płatności many nigdy nie była audytowana. Gracz-tester klika teraz
   * kolejne źródła, aż kreator sam odpali wstrzymaną komendę (albo się
   * zamknie).
   */
  const resolveManaWizard = async () => {
    const wizard = $('#mana-wizard');
    if (!wizard || !visible(wizard)) return false;
    const intro = text($('#mana-wizard-body')).slice(0, 120);
    const sources = $$('#mana-wizard .mana-wizard-source');
    if (sources.length === 0) {
      const cancel = $$('#mana-wizard button').find((b) => /Anuluj|✕/.test(text(b)));
      logL(`  [kreator many] brak źródeł do tapnięcia — zamykam: ${intro}`);
      if (cancel) { cancel.click(); await sleep(60); }
      return true;
    }
    logL(`  [kreator many] ${intro} — źródła: ${sources.length}`);
    for (let i = 0; i < sources.length; i += 1) {
      const fresh = $$('#mana-wizard .mana-wizard-source');
      if (fresh.length === 0 || !visible($('#mana-wizard'))) break;
      // Gracz tapuje ŚWIADOMIE: najpierw źródło pokrywające brakujący kolor
      // (kreator wypisuje „kolory do pokrycia: U"), a dopiero potem dowolne.
      // Bez tego tester tapał trzy Góry na koszt {1}{U} i marnował lądy.
      const need = (text($('#mana-wizard-body')).match(/kolory do pokrycia: ([WUBRG, ]+)/) ?? [])[1] ?? '';
      const needed = need.split(/[^WUBRG]+/).filter(Boolean);
      const covering = needed.length
        ? fresh.filter((b) => needed.some((c) => new RegExp(`\\(${c}[),]`).test(text(b))))
        : [];
      const pool = covering.length ? covering : fresh;
      const pick = profile === 'random' ? pickRandom(pool) : pool[0];
      logL(`  [kreator many] ${text(pick).slice(0, 60)}`);
      pick.click();
      await sleep(60);
    }
    if (visible($('#mana-wizard'))) {
      const cancel = $$('#mana-wizard button').find((b) => /Anuluj|✕/.test(text(b)));
      logL('  [kreator many] kreator nadal otwarty po wyczerpaniu źródeł — anuluję');
      if (cancel) { cancel.click(); await sleep(60); }
    }
    return true;
  };

  const resolveModal = async () => {
    if (await resolveManaWizard()) return true;
    const cr = $('#choice-request');
    if (!cr || !visible(cr)) return false;
    const intro = text($('#choice-request-body'));
    const opts = $$('#choice-request .choice-request-option');
    // Combat wizard: zaznacz pierwszego dowolnego atakującego (albo blokera),
    // potem zatwierdź. Dla bloków zaznaczamy po jednym blokerze na PIERWSZEGO
    // atakującego (prosta heurystyka), żeby obserwować walkę stwór–stwór.
    // M172/E: wizard podziału obrażeń (Inferno Titan) — steppery +/− i
    // „Zatwierdź podział". Polityka gracza: całość w PIERWSZEGO kandydata
    // (profil random: rozrzuca po kandydatach). Bez tej gałęzi tester
    // wisiał na modalu bez opcji .choice-request-option (M172, /tmp/e-flow).
    const divisionConfirm = $$('#choice-request button').find((b) => /Zatwierdź podział/.test(text(b)));
    if (divisionConfirm) {
      const pluses = $$('#choice-request .damage-wizard-plus');
      if (pluses.length > 0) {
        for (let guard = 0; guard < 12 && divisionConfirm.disabled; guard += 1) {
          const target = profile === 'random' ? pickRandom(pluses) : pluses[0];
          target.click();
          await sleep(20);
        }
      }
      logL(`  [division wizard] ${text($('#choice-request .damage-wizard-remaining')) || 'podział'}`);
      if (!divisionConfirm.disabled) {
        divisionConfirm.click();
        await sleep(80);
        return true;
      }
      // Nie dało się złożyć legalnego podziału — anuluj (modal wróci).
      const cancelBtn = $$('#choice-request button').find((b) => /Anuluj/.test(text(b)));
      if (cancelBtn) { cancelBtn.click(); await sleep(60); }
      return true;
    }
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
      const confirm = $$('#choice-request .choice-request-option').find((b) => /Zatwierdź/.test(text(b)));
      if (confirm) {
        logL(`  [combat wizard] ${text(confirm)}`);
        // M112: wizard walki ma już `data-option-key` (klucz liczony z bieżącego
        // zaznaczenia), więc zatwierdzenie idzie przez sondę „oferta bez skutku"
        // — walka przestała być białą plamą osi noop.
        await clickProbed(confirm, `combat:${text(confirm)}`, 'modal', { settle: 80 });
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
      // M104: sondujemy WSZYSTKIE warianty modala, nie tylko wybrany —
      // to w modalu żyje większość ofert (cele, tryby, warianty kosztu).
      scanOffers(opts.map((b) => ({ b, t: text(b) })), 'modal');
      const chosenIndex = opts.indexOf(chosen);
      const lines = extractModalChoice({ intro, options: optTexts.map((t) => ({ text: t })), chosenIndex });
      for (const line of lines) logL(`  [modal choice] ${line}`);
      // M104: opcje modala też są sondowane (do M103 sonda widziała wyłącznie
      // przycisk panelu, czyli PIERWSZY wariant grupy).
      await clickProbed(chosen, text(chosen), 'modal', { settle: 80 });
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
      // typu „Faza: Główna 1G Garruk's Companion wchodzi na pole bitwy".
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
    // M138/Z1: NAZWY permanentów z mojego pola bitwy (pierwszy człon kafla przed
    // „ · "). Kumulujemy, bo cel buffa mógł zejść ze stołu przed snapshotem.
    //
    // ALE: ta sama nazwa może pojawić się po OBU stronach (egzemplarze z dwóch
    // talii, zmiana kontrolera) — wtedy obecność w historii nie dowodzi, że
    // permanent jest MÓJ. Zbieramy więc też stronę wroga, a detektor pomija
    // nazwy niejednoznaczne. Bez tego audyt kontrolny zgłosił Silvanus's
    // Invoker, którego bot załogował WŁASNYM pojazdem — czyli oczywiście
    // swojego (L33: najpierw podejrzewaj narzędzie).
    for (const tileText of tiles('#bf-own', 40)) {
      const name = String(tileText).split(' · ')[0].replace(/\s*×\d+$/, '').trim();
      if (name && name.length > 2) myPermanentNames.add(name);
    }
    for (const tileText of tiles('#bf-enemy', 40)) {
      const name = String(tileText).split(' · ')[0].replace(/\s*×\d+$/, '').trim();
      if (name && name.length > 2) enemyPermanentNames.add(name);
    }
    const visibleActions = $$('#actions button.action')
      .map((b) => ({ b, t: text(b) }))
      .filter(({ t }) => !t.includes('Poddaj'));
    tickedThisWindow = false;
    await recordAndMaybeTick(visibleActions);
    // M104: zmierz KAŻDĄ ofertę w oknie (nie tylko tę, którą gracz kliknie).
    scanOffers(visibleActions, 'panel');
    const pick = pickAction();
    if (!pick) return 'none';
    clickedActions.add(normalize(pick.t));
    logL(`  >> ${pick.t.slice(0, 110)}`);
    // M103 (L15): sonda „oferta bez skutku" — PRZED kliknięciem mierzymy
    // skutek komendy na KLONIE stanu z pasywnym przeciwnikiem (nie dotyka
    // prawdziwej partii), a PO kliknięciu sprawdzamy, czy partia w ogóle
    // przyjęła klik (applied) — odrzucone kliki nie są dowodem na nic.
    // M99: DOUBLE-TAP. Panel akcji renderuje przyciski legalne w chwili
    // rysowania; gracz na telefonie potrafi stuknąć dwa razy, zanim UI się
    // przerysuje — druga komenda trafia do sesji już PO zmianie stanu (często
    // w trakcie pauzy bota) i zostaje odrzucona przez engine. Właśnie tak
    // powstał ekran „tylko Poddaj partię" (M90/B, Forever Young). Żaden
    // profil klikający „raz i czekam" tej ścieżki nie odwiedza.
    await clickProbed(pick.b, pick.t, 'panel', {
      doubleTap: profile === 'impatient' && rnd() < 0.5,
    });
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
  // M203: brak talii na liście artefaktu = jawny błąd. Wcześniej pętla bez
  // `else` zostawiała wybór domyślny, a transkrypt i tak głosił `human`.
  const selectDeck = (selector, deck) => {
    const select = $(selector);
    const option = [...(select?.options ?? [])].find((opt) => opt.value === deck);
    if (!option) {
      throw new Error(`Talia „${deck}" nie jest dostępna w artefakcie (${selector}). `
        + `Dostępne: ${[...(select?.options ?? [])].map((opt) => opt.value).join(', ') || '(brak)'} `
        + '— uruchom npm run build, jeśli decks/ jest nowszy niż dist/.');
    }
    select.value = deck;
  };
  selectDeck('#deck-human', human);
  selectDeck('#deck-bot', bot);
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
  const panelProbes = probeRecords.filter((r) => r.source !== 'modal').length;
  const modalProbes = probeRecords.length - panelProbes;
  logL(`== POKRYCIE UI == akcje widziane: ${seenActions.size}, kliknięte: ${clickedActions.size}, modale: ${seenModals.size}, sondy noop: ${probeRecords.length} (panel ${panelProbes}, modal ${modalProbes})${debugApi ? '' : ' (mostek ?tester=1 niedostępny)'}`);
  collectRejections('(koniec partii)');
  // M121: detektor „bot bije we własny permanent" klasyfikuje karty po
  // deskryptorach z rejestru (nazwa karty w logu nie zdradza, co robi czar).
  let harmfulNames = new Set();
  let allCardNames = new Set();
  try {
    const { createCardRegistry } = await import('../../src/cards/card-data.js');
    const registry = createCardRegistry();
    harmfulNames = harmfulCardNames(registry);
    // M123: detektor przecieku porównuje wpisy modala z nazwami WSZYSTKICH
    // kart (miniaturka dokleja nazwę do wpisu w transkrypcie).
    allCardNames = new Set([...registry.all()].map((c) => c.name).filter(Boolean));
  } catch { /* rejestr niedostępny — detektor po prostu nic nie zgłosi */ }
  const findings = runDetectors(lines, { actionRecords, windowRecords, profile, probeRecords, rejectionRecords, harmfulNames, allCardNames, myPermanentNames, enemyPermanentNames });
  for (const line of formatFindings(findings)) logL(line);

  flush();
  // M197: zrzut UKŁADU STOŁU na żywym artefakcie — boksy liczników stref,
  // pula many i etykiety grup permanentów. Pozwala sprawdzić w prawdziwym
  // DOM (nie w mini-DOM testów), że sekcje naprawdę się renderują.
  const layout = {
    metaFoe: text($('#meta-foe')),
    metaOwn: text($('#meta-own')),
    manaSymbols: $$('.mana-pool-chip .ms').length,
    groupLabels: $$('.sub-label').map((e) => text(e)),
    // M198/A+B: pusty pasek statusu i pas komunikatow zniknely z ukladu.
    hasStatusBar: Boolean($('#status')),
    hasTableNote: Boolean($('#table-note')),
    hasNoticeModal: Boolean($('#notice-ok')),
    // M198/D+G: osobny przycisk inspektora, brak panelu rozumowania bota.
    inspectorButton: text($('#zone-inspector-open')),
    hasBotReasoning: Boolean($('#bot-reasoning')),
    buildStampAlign: ($('.build-stamp') && domWindow.getComputedStyle)
      ? domWindow.getComputedStyle($('.build-stamp')).textAlign : null,
    hasBrand: Boolean($('.brand')),
    hasFoot: Boolean($('.foot')),
    hasLibraryPreview: Boolean($('#library-preview')),
    copyAllLabel: text($('#turn-history-copy-all')),
    // M199: zapis „Przebieg tur (dla AI)" ma być w pełnym FoW — sprawdzalne
    // na ŻYWYM artefakcie (panel + główny log obok siebie).
    turnHistoryTurns: $('#turn-history-select')?.options?.length ?? 0,
    turnHistoryText: text($('#turn-history')),
    mainLogShowsOwnDraw: /Dobierasz:/.test(text($('#log'))),
    ownPlayerLabel: text($('.player.own .pname')),
  };
  return { lines, findings, windowRecords, probeRecords, rejectionRecords, layout, outPath, coverage: { seenActions: [...seenActions], clickedActions: [...clickedActions], modals: [...seenModals] } };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); process.exit(0); }
    if (opts.listDecks) { console.log(deckNames().join('\n')); process.exit(0); }
    runTableGame({ ...opts, log: (s) => console.log(s) })
      .then((r) => console.log(`Transkrypt zapisany: ${r?.outPath ?? opts.out} | zgłoszeń detektorów: ${r?.findings?.length ?? 0}`))
      .catch((e) => { console.error('BŁĄD:', e.message); process.exit(1); });
  } catch (e) {
    console.error('BŁĄD:', e.message);
    console.log(HELP);
    process.exit(1);
  }
}

