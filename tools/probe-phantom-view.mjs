#!/usr/bin/env node
/**
 * Sonda „pól-widm" w kontrakcie PlayerView (klasa znaleziska A-2 z audytu PR #164).
 *
 * Po co: PR #164 zostawił w bocie filtr czytający pola, których `playerView`
 * NIGDY nie wysyła (`playableFromExile`, `onAdventure`, `warpedAtTurn`) — warunek
 * był martwy (L41 klasy: dwie warstwy czytają różne słowniki pól). Ten sam typ
 * usterki może siedzieć w dowolnym konsumencie widoku (boty, render, sesja),
 * a testy tego nie łapią, bo nie ma skąd wiedzieć, że pole miało istnieć.
 *
 * Jak: każdy widok przekazany kontrolerowi opakowujemy w Proxy, które
 *   - zbiera WSZYSTKIE nazwy pól, jakie widok kiedykolwiek wystawił (`present`),
 *   - rejestruje KAŻDY odczyt pola nieobecnego w danym obiekcie (`missing`).
 * Pole, które jest czytane, ale NIGDY nie pojawiło się w żadnym widoku
 * (`present.has(prop) === false`), to kandydat na pole-widmo: albo literówka
 * / nieistniejące pole kontraktu (usterka), albo pole spoza widoku (np. na
 * obiekcie gry, nie widoku) — do ręcznego rozstrzygnięcia.
 *
 * To NIE jest test regresji (heurystyka + ruch niedeterministyczny względem
 * implementacji) — narzędzie śledcze pętli jakości (ADR 0021). Uruchomienie:
 *   node tools/probe-phantom-view.mjs --games 8 --steps 1200
 *
 * Wynik: lista kandydatów + najczęstsze odczyty pól opcjonalnych (obecnych
 * w innych miejscach widoku) do przeglądu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const opts = { games: 8, steps: 1200, decks: null, seedBase: 9100 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--games') opts.games = Number(argv[++i]);
    else if (arg === '--steps') opts.steps = Number(argv[++i]);
    else if (arg === '--decks') opts.decks = argv[++i].split(',').map((s) => s.trim());
    else if (arg === '--seed-base') opts.seedBase = Number(argv[++i]);
    else if (arg === '--help') { console.log('node tools/probe-phantom-view.mjs [--games N] [--steps N] [--decks a,b,c] [--seed-base N]'); process.exit(0); }
    else throw new Error(`Nieznana opcja: ${arg}`);
  }
  return opts;
}

/** Zbiory obserwacji w jednym przebiegu sondy. */
export function createProbe() {
  const present = new Set();
  const missing = new Map();
  return {
    present,
    missing,
    /**
     * Owija widok: rekord pól obecnych + odczytów pól nieobecnych.
     *
     * Widoki silnika są `Object.freeze`, a Proxy nie może na zamrożonym
     * obiekcie podmienić wartości (niezmiennik ECMAScript) — dlatego opakowujemy
     * PŁYTKĄ KOPIĘ o tym samym zestawie pól. Kopie tego samego obiektu w ramach
     * JEDNEGO widoku dzielą jeden Proxy (mapa `cache`), żeby porównania
     * tożsamości w bocie działały jak na oryginale.
     */
    wrap(value, at = 'view', seen = new Map()) {
      if (value === null || typeof value !== 'object') return value;
      if (seen.has(value)) return seen.get(value);
      let copy;
      if (Array.isArray(value)) {
        copy = value.map((entry) => this.wrap(entry, at, seen));
      } else {
        // Płytka kopia MUSI mieć ten sam zestaw kluczy: bot czyta widok także
        // przez enumerację (`Object.keys`, `for..of`, spread), a Proxy z pustym
        // targetem gubiłby pola i bot podejmowałby inne decyzje (fałszywy alarm
        // „bot wybrał nielegalną komendę”). Wartości leniwie, przez gettery.
        copy = {};
        for (const key of Object.keys(value)) {
          Object.defineProperty(copy, key, {
            enumerable: true,
            configurable: true,
            get: () => (typeof value[key] === 'object' && value[key] !== null
              ? this.wrap(value[key], `${at}.${key}`, seen)
              : value[key]),
          });
        }
      }
      const proxy = new Proxy(copy, {
        get: (target, prop, receiver) => {
          if (typeof prop === 'symbol') return target[prop];
          if (!(prop in value)) {
            const record = missing.get(prop) ?? { count: 0, samples: new Set() };
            record.count += 1;
            if (record.samples.size < 4) record.samples.add(`${at}.${prop}`);
            missing.set(prop, record);
            return undefined;
          }
          present.add(prop);
          if (!Array.isArray(value)) {
            const raw = value[prop];
            return typeof raw === 'object' && raw !== null
              ? this.wrap(raw, `${at}.${prop}`, seen)
              : raw;
          }
          return target[prop];
        },
      });
      seen.set(value, proxy);
      return proxy;
    },
  };
}

const IGNORED_MISSING = new Set([
  // Pola protokołu Proxy / inspekcji konsolowej — nie są kontraktem widoku.
  'then', 'toJSON', 'constructor', 'inspect', 'nodeType', 'Symbol(nodejs.util.inspect.custom)',
]);

export function phantomCandidates(probe) {
  const out = [];
  for (const [prop, record] of probe.missing) {
    if (IGNORED_MISSING.has(prop)) continue;
    if (!probe.present.has(prop)) out.push({ prop, count: record.count, samples: [...record.samples] });
  }
  return out.sort((a, b) => b.count - a.count);
}

export function optionalReads(probe, limit = 25) {
  const out = [];
  for (const [prop, record] of probe.missing) {
    if (IGNORED_MISSING.has(prop)) continue;
    if (probe.present.has(prop)) out.push({ prop, count: record.count, samples: [...record.samples].slice(0, 2) });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

function loadDecks(registry, names) {
  const dir = path.join(root, 'decks');
  const available = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')).sort();
  const chosen = names ?? [available[1], available[2], available[0], available[3]];
  return chosen.map((name) => ({
    name,
    cardIds: parseDeckText(fs.readFileSync(path.join(dir, `${name}.txt`), 'utf8'), registry).cardIds,
  }));
}

function wrapController(probe, bot) {
  return {
    chooseCommand(view, helpers) {
      return bot.chooseCommand(probe.wrap(view, 'view', new Map()), helpers);
    },
  };
}

export function runProbe({ games = 8, steps = 1200, decks = null, seedBase = 9100 } = {}) {
  const registry = createCardRegistry();
  const lists = loadDecks(registry, decks);
  const probe = createProbe();
  for (let game = 0; game < games; game += 1) {
    const first = lists[game % lists.length];
    const second = lists[(game + 1) % lists.length];
    const seed = seedBase + game;
    const state = setupCardMatch({
      seed,
      players: [{ id: 'p1' }, { id: 'p2' }],
      decks: new Map([['p1', first.cardIds], ['p2', second.cardIds]]),
      registry,
    });
    runSimulation({
      state,
      maxCommands: steps,
      controllers: new Map([
        ['p1', wrapController(probe, createHeuristicBot({ seed: seed + 1, opponentDeck: second.cardIds }))],
        ['p2', wrapController(probe, game % 2 === 0
          ? createHeuristicBot({ seed: seed + 2, opponentDeck: first.cardIds })
          : createAggroBot(seed + 2))],
      ]),
    });
  }
  return { probe, lists: lists.map((l) => l.name) };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { probe, lists } = runProbe(opts);
  const phantoms = phantomCandidates(probe);
  console.log(`Sonda pól-widm: ${opts.games} partii, talie: ${lists.join(', ')}`);
  console.log(`pola widoku widziane: ${probe.present.size}; odczytów pól nieobecnych: ${probe.missing.size} nazw`);
  console.log('\n== KANDYDACI NA POLA-WIDMA (czytane i NIGDY nieobecne w żadnym widoku) ==');
  if (phantoms.length === 0) console.log('  (brak)');
  for (const item of phantoms) console.log(`  ${item.prop} ×${item.count} — ${item.samples.join(' | ')}`);
  console.log('\n== Najczęstsze odczyty pól OPCJONALNYCH (obecne gdzie indziej — przegląd) ==');
  for (const item of optionalReads(probe)) console.log(`  ${item.prop} ×${item.count} — ${item.samples.join(' | ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
