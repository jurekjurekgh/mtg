#!/usr/bin/env node
/**
 * AUDYT NIESCORINGOWANYCH DECYZJI BOTA.
 *
 * Punkt wyjścia (decyzja właściciela, PR #93 tura 5): „audyt Żywym Testerem
 * z akcentem na inteligentne zachowanie bota i scoringowanie działań
 * niescoringowanych". Istniejąca bramka `test/bot-targeted-effect-valuation-
 * guard.test.js` pilnuje, że każdy TYP EFEKTU ma gałąź wyceny. Nie pilnuje
 * natomiast, czy decyzja ma CO rozstrzygać: gdy dwa warianty mają identyczną
 * punktację, wybór jest arbitralny (kolejność z `legalCommands`, ewentualnie rng
 * z puli top-3) — skutek ten sam co przy braku wyceny, tylko niewidoczny
 * w źródle. Stąd pomiar na śladzie (`bot.trace()`), nie grep po pliku.
 *
 * Klasy decyzji:
 *   single   — jedna opcja, nie ma czego ważyć (przymus decyzji);
 *   decided  — wyraźny zwycięzca (unikalne maksimum);
 *   tie_top  — ≥2 opcje ex aequo na maksimum — tu wybór jest arbitralny;
 *   tie_all  — wszystkie opcje równe — wybór w 100% arbitralny.
 *
 * Remis remisowi nierówny — dla remisów dodajemy klasyfikację po PROJEKCJI
 * DANYCH, które wycena widziała (`tieProjection` w heuristic-bot):
 *   rozróznialne — dane się różnią, a punkty nie ⇒ przeoczenie wyceny, FINDING;
 *   rownowazne   — dane identyczne (dwa lasy w ręce) ⇒ remis uczciwy, nie wolno
 *                  go sztucznie rozstrzygać (L5: strażnik mierzy regułę, nie szum);
 *   bez-danych   — brak projekcji dla tej klasy komend; NIE udajemy, że oceniliśmy.
 * Ta kategoria jest więc miernikiem postępu, a nie dowodem poprawności: dowodzą
 * testy jednostkowe (test/audyt-bot-wybior-landu.test.js).
 *
 * Użycie:
 *   node tools/bot-tie-audit.mjs [--gry=N] [--top=N] [--kind=<fragm>] [--gate=<kind>] [--json]
 * --gate=<kind> kończy pracą z kodem 1, gdy wskazany kind ma remisy rozróznialne.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';

const REPO = path.resolve(import.meta.dirname, '..');

/**
 * Pary talii SPOZA próbki benchmarkowej (tools/benchmark.mjs BENCH_DECKS) plus
 * świeże talie audytowe — inaczej audyt kręciłby się na tym samym rozkładzie
 * decyzji co tuning i przestawał być niezależnym pomiarem.
 */
export const AUDIT_PAIRS = Object.freeze([
  ['ravnica', 'innistrad-wu'], ['dominaria-brg', 'mirrodin-wu'], ['tarkir-bg', 'warhammer-brg'],
  ['wiedzmin', 'tarkir-bg'], ['worek-legend', 'wiedzmin'], ['srodziemie', 'theros'],
  ['kaladesh', 'zendikar'], ['warhammer-wu', 'innistrad-brg'], ['dominaria-wu', 'worek-mroczny'],
  ['forgotten-realms', 'worek-dziki'], ['tarkir-wur', 'wiedzmin'], ['worek-basni', 'mirrodin-brg'],
].map((p) => Object.freeze(p)));

const registry = createCardRegistry();
const deckCache = new Map();
const deckOf = (nazwa) => {
  if (!deckCache.has(nazwa)) {
    deckCache.set(nazwa, parseDeckText(fs.readFileSync(path.join(REPO, 'decks', `${nazwa}.txt`), 'utf8'), registry).cardIds);
  }
  return deckCache.get(nazwa);
};

const rodzaj = (s) => String(s ?? '?').replace(/[\[(].*$/, '').trim();

/**
 * „Brak akcji" — pary, które silnik wystawia obok siebie w krokach bojowych:
 * w declare_blockers `declare_blockers{}` (ślad: `block[]`) i `pass_priority`
 * prowadzą do tego samego stanu (brak bloków), różniąc tylko tym, KTO dostaje
 * pierwsze okno odpowiedzi (udowodnione w teście test/audyt-bot-block-noop.test.js,
 * nie założone). Analogicznie `attack[]` w declare_attackers. Remis między nimi
 * nie jest przeoczeniem wyceny, tylko nadwyżką oferty silnika — nie wolno mu
 * policzyć jako decyzji, bo pomiar straszy liczbą zamiast mówić prawdę.
 */
const BRAK_ACJI = new Set(['pass_priority', 'block[]', 'attack[]']);

/**
 * Rozegrane partie → statystyka decyzji per kind. Deterministyczne: seedy
 * pochodzą od nazw talii (ADR 0005), dwa uruchomienia dają identyczny wynik.
 * Funkcja jest eksportowana, żeby test bramkowy mógł ją wywołać na małym
 * zbiorze par bez odpalania procesu.
 */
export function audytRemisow({ pary = AUDIT_PAIRS, gry = 1, kindFilter = '' } = {}) {
  const stat = new Map();
  const global = { single: 0, decided: 0, tie_top: 0, tie_all: 0, decisions: 0, gry: 0,
    tieNoOp: 0, tieAkcyjne: 0 };

  const wierszDla = (kind) => {
    let s = stat.get(kind);
    if (!s) {
      s = { kind, single: 0, decided: 0, tie_top: 0, tie_all: 0, suma: 0,
        noOp: 0, akcyjne: 0, rozroznialne: 0, rownowazne: 0, bezDanych: 0, przyklady: [] };
      stat.set(kind, s);
    }
    return s;
  };

  const zlicz = (trace, meta) => {
    for (const e of trace) {
      const kind = rodzaj(e.chosen ?? e.options?.[0]?.cmd);
      if (kindFilter && !kind.includes(kindFilter)) continue;
      const opcje = (e.options ?? []).map((o) => (Number.isFinite(o.score) ? o.score : -Infinity));
      const s = wierszDla(kind);
      global.decisions += 1; s.suma += 1;
      const max = Math.max(...opcje);
      const naMaks = opcje.filter((x) => x === max).length;
      let klasa;
      if (opcje.length <= 1) klasa = 'single';
      else if (naMaks > 1 && new Set(opcje).size === 1) klasa = 'tie_all';
      else if (naMaks > 1) klasa = 'tie_top';
      else klasa = 'decided';
      s[klasa] += 1; global[klasa] += 1;
      if (klasa !== 'tie_top' && klasa !== 'tie_all') continue;
      // Najpierw: czy to w ogóle jest decyzja? Wszystkie ex aequo opcje bez
      // akcji = nadwyżka oferty silnika, nie dylemat bota.
      const tiedOpcje = (e.options ?? []).filter((o) => o.score === max);
      if (tiedOpcje.length > 1 && tiedOpcje.every((o) => BRAK_ACJI.has(o.cmd))) {
        s.noOp += 1; global.tieNoOp += 1;
        continue;
      }
      s.akcyjne += 1; global.tieAkcyjne += 1;
      // Opcje bez projekcji (pass_priority, concede — rodzina „brak akcji")
      // wylatywalby wszystko: przy block[] vs block[x<y] vs pass null
      // wcisnął realny finding do „bez danych". Odrzucamy je, a klasyfikujemy
      // to, co zostaje; jeśli mniej niż dwa warianty — nie mamy zdania.
      const zProjekcja = (e.tie ?? []).filter((x) => x.proj
        && (kind === 'play_land' || !Object.values(x.proj).some((v) => v === undefined)));
      const proj = zProjekcja.map((x) => x.proj);
      if (!e.tie || proj.length < 2) {
        s.bezDanych += 1;
      } else {
        // Sygnatura = TO, na co wycena patrzyła. Równe sygnatury ⇒ remis z
        // definicji; różne ⇒ wycena była ślepa na różnicę, którą dało się znać.
        // Sygnaturą są WEJŚCIA delty, nie ich tożsamość: dwa lądy w różnym
        // kolorze, z których żaden nie pokrywa zapotrzebowania, są dla tej
        // decyzji zamienne i nie wolno od bota żądać rozstrzygnięcia. Za to
        // różne wejścia przy równym wyniku = niedoinfekcyjność mapowania
        // (np. sufit klampy zgniatał pokrycie 2 i 3 do jednego punktu).
        let sygn;
        if (kind === 'play_land') {
          // Tylko WEJŚCIA delty: dwa lądy w różnych kolorach, z których żaden
          // nie pokrywa zapotrzebowania, są dla tej decyzji zamienne.
          sygn = proj.map((pr) => `${pr.pokrywa}|${pr.ilosc >= 2 ? 'x' : '-'}|`
            + `${pr.nowyKolor ? 'n' : '-'}|${pr.zdolnosc ? 'a' : '-'}|${pr.tapped ? 't' : '-'}`);
        } else {
          // Walka: projekcja jest zbiorem faktów o wariancie (ile tur obrażeń,
          // ilu swoich wystawiamy na blok / ile obrażeń znika i ile gini).
          // Każdy z nich jest rozstrzygalny, więc porównujemy całość.
          sygn = proj.map((pr) => JSON.stringify(pr));
        }
        if (new Set(sygn).size > 1) {
          s.rozroznialne += 1;
          s.przyklady.push(`${meta.para} seed ${meta.seed} ${meta.gracz} tura ${e.turn} `
            + `ex aequo @${max} → dane się różnią: ${sygn.join(' vs ')}`);
        } else s.rownowazne += 1;
      }
      if (s.przyklady.length < 12 && e.chosen !== 'concede' && kind !== 'pass_priority') {
        s.przyklady.push({ ...meta, turn: e.turn, step: e.step, chosen: e.chosen, klasa,
          opcje: (e.options ?? []).slice(0, 8), tie: e.tie });
      }
    }
  };

  for (const [dx, dy] of pary) {
    for (let k = 0; k < gry; k++) {
      const seed = 4000 + k * 13 + dx.length;
      const d1 = deckOf(dx);
      const d2 = deckOf(dy);
      const state = setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }],
        decks: new Map([['p1', d1], ['p2', d2]]), registry });
      const b1 = createHeuristicBot({ seed: seed + 1, opponentDeck: d2, registry });
      const b2 = createHeuristicBot({ seed: seed + 2, opponentDeck: d1, registry });
      runSimulation({ state, controllers: new Map([['p1', b1], ['p2', b2]]), maxCommands: 4000 });
      zlicz(b1.trace(), { para: `${dx}|${dy}`, seed, gracz: 'p1' });
      zlicz(b2.trace(), { para: `${dx}|${dy}`, seed, gracz: 'p2' });
      global.gry += 1;
    }
  }

  const wagi = (s) => (s.tie_top * 2 + s.tie_all);
  const rows = [...stat.values()].sort((a, b) => wagi(b) - wagi(a));
  return { global, rows };
}

// --- CLI. Moduł importuje się bez efektów ubocznych: test bramkowy woła
// audytRemisow() wprost, zamiast odpalać proces i parsować stdout. ---
const uruchomionyJakoSkrypt = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (uruchomionyJakoSkrypt) {
  const argNum = (nazwa, dom) => {
    const a = process.argv.find((x) => x.startsWith(`--${nazwa}=`));
    return a ? Number(a.split('=')[1]) : dom;
  };
  const { global, rows } = audytRemisow({
    gry: argNum('gry', 2),
    kindFilter: (process.argv.find((a) => a.startsWith('--kind=')) ?? '').split('=')[1] ?? '',
  });
  const TOP = argNum('top', 12);
  const doPominięcia = new Set(['pass_priority', 'concede', 'resolve_mulligan_choice']);
  const GATE = (process.argv.find((a) => a.startsWith('--gate=')) ?? '').split('=')[1] ?? '';

  if (GATE) {
    const r = rows.find((x) => x.kind === GATE) ?? { rozroznialne: 0, tie_top: 0, suma: 0 };
    console.log(`GATE ${GATE}: rozróznialne=${r.rozroznialne} z ${r.tie_top} remisów (${r.suma} decyzji)`);
    process.exit(r.rozroznialne === 0 ? 0 : 1);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ global, kinds: rows }, null, 1));
    process.exit(0);
  }
  console.log(` partie: ${global.gry} | decyzje: ${global.decisions}`);
  console.log(` single ${global.single} | decided ${global.decided} | tie_top ${global.tie_top} | tie_all ${global.tie_all}`);
  const istotne = rows.filter((r) => !doPominięcia.has(r.kind));
  const sumaIstotnych = istotne.reduce((a, r) => a + r.suma, 0);
  const sumaTie = istotne.reduce((a, r) => a + r.tie_top + r.tie_all, 0);
  const istotneAkcyjne = istotne.reduce((a, r) => a + (r.suma - r.noOp), 0);
  console.log(` decyzje z alternatywami (bez pass/concede/mulligan): ${sumaIstotnych}, z tego remis: ${sumaTie}`
    + ` (${sumaIstotnych ? ((100 * sumaTie / sumaIstotnych).toFixed(1)) : 0}%)`);
  console.log(`   z REMISÓW: ${global.tieNoOp} to pary „brak akcji" silnika (block[]/attack[] vs pass)`
    + ` — nadwyżka oferty, nie dylemat; ${global.tieAkcyjne} to remis miedzy REALNymi wariantami`
    + ` (${istotneAkcyjne ? ((100 * global.tieAkcyjne / istotneAkcyjne).toFixed(1)) : 0}% decyzji akcyjnych)`);
  console.log('\n kind                    single decided  tie_top  tie_all |   no-op akcyjne | rozróznialne rownowazne bez-danych');
  for (const r of rows) {
    if (r.tie_top + r.tie_all === 0) continue;
    console.log(` ${r.kind.padEnd(23)} ${String(r.single).padStart(6)} ${String(r.decided).padStart(7)}`
      + ` ${String(r.tie_top).padStart(8)} ${String(r.tie_all).padStart(8)} |`
      + ` ${String(r.noOp).padStart(6)} ${String(r.akcyjne).padStart(8)} |`
      + ` ${String(r.rozroznialne).padStart(12)} ${String(r.rownowazne).padStart(11)} ${String(r.bezDanych).padStart(10)}`);
  }
  const grozy = rows.filter((r) => r.rozroznialne > 0);
  console.log('\n GROZY (remisy przy różnych danych): '
    + (grozy.length ? grozy.map((r) => `${r.kind}=${r.rozroznialne}`).join(', ') : 'brak'));
  console.log('\n=== przykłady (turn/step, wybrane i wszystkie opcje z punktami) ===');
  let wypisane = 0;
  for (const r of rows) {
    if (doPominięcia.has(r.kind)) continue;
    for (const p of r.przyklady) {
      if (wypisane >= TOP) break;
      if (!p.opcje) continue;
      wypisane += 1;
      console.log(`\n[${r.kind}] ${p.para} seed ${p.seed} tura ${p.turn} ${p.step} → ${p.chosen}  (${p.klasa})`);
      for (const o of p.opcje) console.log(`     ${String(o.score).padStart(8)}  ${o.cmd}`);
    }
    if (wypisane >= TOP) break;
  }
}
