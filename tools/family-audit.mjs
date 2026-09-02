import fs from 'node:fs';
import path from 'node:path';

/**
 * Analizator rodzin efektów i mutacji pól (pętla jakości, kierunek 2 z M277).
 *
 * Ad hoc narzędzia `/tmp/fam*.mjs` (M274/M276/M277) za każdym razem znajdowały
 * błąd: #24 (liczniki wejścia), #26, #28 (obrażenia). Wspólna idea — porównać
 * zbiór helperów wołanych przez WARIANTY jednej rodziny i wypunktować ten,
 * który robi to samo WŁASNYM kodem (wzorzec L107). Ten moduł przenosi tę
 * metodę do `tools/` jako stałe narzędzie obok `event-contract-audit.mjs`.
 *
 * Dwa wymiary skanu (L107 pkt 1 — grep po MUTACJI POLA, nie po nazwie):
 *
 * 1. RODZINY EFEKTÓW (`EFFECT_FAMILIES`): dla każdego wariantu
 *    `effect.type === '…'` w `effects.js` sprawdzamy, czy wykonuje surową
 *    mutację rodziny (`manual`) BEZ choke pointu rodziny (`choke`). Wariant
 *    delegujący do innego członka rodziny przez `applyEffect` liczy się jako
 *    przechodzący przez choke point.
 *
 * 2. RODZINY PÓL (`FIELD_FAMILIES`): globalne mutacje pola (życie, trucizna)
 *    poza plikiem-właścicielem helpera. Trafienie = kandydat na ominięcie
 *    `changeLife` / `addPoisonCounters` i zgubienie ich skutków ubocznych.
 *
 * Narzędzie NIE zgaduje intencji: każde trafienie, które jest świadome,
 * trafia do `FAMILY_EXCEPTIONS` z uzasadnieniem (ADR 0027 pkt 3). Wyjątek bez
 * powodu jest naruszeniem, nie wyjątkiem. Fałszywy alarm poprawia się w
 * konfiguracji albo na liście wyjątków — nigdy „naprawą" poprawnego kodu.
 */

export const AUDITED_FILES = [
  'src/engine/effects.js', 'src/engine/game-state.js', 'src/engine/abilities.js',
  'src/engine/spells.js', 'src/engine/triggers.js', 'src/engine/permanents.js',
  'src/engine/state-based.js', 'src/engine/combat.js', 'src/engine/resources.js',
  'src/engine/objects.js', 'src/engine/counters.js', 'src/engine/players.js',
  'src/engine/zones.js',
];

/**
 * Świadome odstępstwa — klucz `rodzina.wariant`, wartość: dlaczego surowa
 * mutacja (albo brak choke pointu) jest tu poprawny.
 */
export const FAMILY_EXCEPTIONS = {
  'mill.mill_from_bottom':
    'Cellar Door kładzie DOLNĄ kartę biblioteki do grobu (CR 401.4) — to nie '
    + 'jest „mill N z wierzchu", więc ochrona scry/surveil z millTargetPlayerId '
    + 'nie ma zastosowania; ścieżka przechodzi przez choke point stref '
    + 'moveObjectDirectly i emituje object_moved + cards_milled.',
};

/**
 * Rodziny efektów. `match` wyznacza członków rodziny po nazwie `effect.type`;
 * `manual` to regex sygnału surowej mutacji (wykonanie czynności ręką),
 * `choke` to dozwolone drogi (choke point albo delegacja do innego członka).
 */
export const EFFECT_FAMILIES = [
  {
    id: 'damage',
    label: 'obrażenia',
    files: ['src/engine/effects.js'],
    match: /damage/,
    manual: [
      { re: /changeLife\s*\([^,)]+,[^,)]+,\s*-/, why: 'odejmuje życie własnym changeLife zamiast zadać obrażenia' },
      { re: /markDamage\s*\(/, why: 'zadaje obrażenia markDamage z pominięciem kontraktu obrażeń' },
    ],
    choke: [
      /dealNonCombatDamage\s*\(/,
      /applyEffect\s*\([^)]*type:\s*'[a-z_0-9]*damage/,
    ],
  },
  {
    id: 'untap',
    label: 'odkręcanie',
    files: ['src/engine/effects.js'],
    match: /untap/,
    manual: [
      { re: /tapped:\s*false/, why: 'odkręca ręczną mutacją tapped:false — gubi stun (CR 122.1d) i blokady' },
    ],
    choke: [
      /untapByEffect\s*\(/,
    ],
  },
  {
    id: 'mill',
    label: 'mill',
    files: ['src/engine/effects.js'],
    match: /mill/,
    manual: [
      { re: /state\.zones\.library\s*=\s*state\.zones\.library/, why: 'mutuje bibliotekę wprost zamiast przez millTargetPlayerId' },
    ],
    choke: [
      /millTargetPlayerId\s*\(/,
      /applyEffect\s*\([^)]*type:\s*'mill_cards'/,
    ],
  },
  {
    id: 'destroy',
    label: 'zniszczenie',
    files: ['src/engine/effects.js'],
    match: /destroy/,
    manual: [
      { re: /moveObjectDirectly\s*\([^)]*,\s*'graveyard'/, why: 'przenosi do grobu ręcznie zamiast destroyPermanentByEffect — gubi indestructible i zdarzenie zniszczenia' },
      { re: /state\.objects\.delete\s*\(/, why: 'kasuje obiekt zamiast destroyPermanentByEffect' },
    ],
    choke: [
      /destroyPermanentByEffect\s*\(/,
      /applyEffect\s*\([^)]*type:\s*'destroy_[a-z_0-9]+'/,
    ],
  },
];

/**
 * Rodziny pól: mutacja pola poza plikiem-właścicielem helpera.
 * `pattern` chwyta surową mutację; `owner` to plik, w którym mutacja jest
 * legalna (ciało choke pointu).
 */
export const FIELD_FAMILIES = [
  {
    id: 'life',
    label: 'życie gracza',
    owner: 'src/engine/players.js',
    pattern: /\.life\s*(?:\+=|-=|=(?!=))/,
    why: 'zmienia życie poza changeLife — gubi zdarzenie life_changed i kontrakt logu/bota',
    // Próbki pinu anty-vacuous (patrz `test/family-audit.test.js`): `bypass`
    // MUSI pasować do wzoru, `legal` NIE może.
    bypass: ['state.players[0].life += 1;', 'p.life = 20;', 'target.life -= 3;'],
    legal: ['const before = player.life;', 'if (player.life <= 0) {', 'life: player.life'],
  },
  {
    id: 'poison',
    label: 'liczniki trucizny',
    owner: 'src/engine/players.js',
    pattern: /\.poison\s*(?:\+=|-=|=(?!=))/,
    why: 'zmienia truciznę poza addPoisonCounters — gubi zdarzenie poison_counters_added',
    bypass: ['player.poison = 10;', 'state.players[1].poison += 1;'],
    legal: ['player.poison === 9;', 'const poison = player.poison;'],
  },
  {
    // Rodzina z audytu PR #92 (znalezisko 3): licznik dobrań w turze był
    // podnoszony trzema rozjechanymi ścieżkami, a wyzwalacz Jolrael czytał
    // WARTOŚĆ KOŃCOWĄ stanu po komendzie — „draw two" dawało dwa wyzwalacze,
    // a „1 + 2" none. Odtąd jedynym miejscem zapisu jest `recordCardDrawn`
    // (players.js), które razem z licznikiem stempluje `drawNumberThisTurn`
    // w zdarzeniu `card_drawn`.
    //
    // Zasięg wzoru (świadomie węższy niż „każde przypisanie"): łapie zapis
    // per gracz (`state.cardsDrawnThisTurn[id] = 3`, `+= 1`, `p.cardsDrawnThisTurn++`,
    // `state.players[i].cardsDrawnThisTurn = 2`) — to jest klasa błędu
    // „ścieżka podnosi licznik sama". Nie łapie przerzucenia całego obiektu
    // składnią (`state.cardsDrawnThisTurn = { ...x, [id]: 2 }`), bo tym samym
    // wzorem zeruje się licznik przy starcie tury w `game-state.js` (w bloku
    // resetów `spellsCastThisTurn`/`lifeGainedThisTurn`), a fałszywy alarm na
    // każdym progu tury kosztowałby więcej, niż wart jest ten rzadki zapis.
    // Nie łapie też formy przedrostkowej `++x.cardsDrawnThisTurn` (pole jest
    // potem, nie przed operatorem) — w kodzie produkcyjnym nikt jej nie używa,
    // a jej obsługa kosztowałaby wzór łapiący komentarze.
    id: 'draws',
    label: 'licznik dobrań w turze',
    owner: 'src/engine/players.js',
    pattern: /\.cardsDrawnThisTurn\s*(?:\[[^\]]+\])?\s*(?:\+=|\+\+|=(?!=)\s*\d)/,
    why: 'podnosi licznik dobrań poza recordCardDrawn — gubi stemplowanie drawNumberThisTurn w card_drawn (CR 122.5)',
    bypass: [
      'state.cardsDrawnThisTurn[p.id] = 2;',
      'p.cardsDrawnThisTurn += 1;',
      'state.players[1].cardsDrawnThisTurn = 3;',
    ],
    legal: [
      'state.cardsDrawnThisTurn = {};',
      'const n = (state.cardsDrawnThisTurn?.[playerId] ?? 0) + 1;',
      'const drawn = (state?.cardsDrawnThisTurn ?? {})[object.controllerId] ?? 0;',
    ],
  },
];

function stripComments(source) {
  return source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Wyciąga gałęzie `effect.type === 'X' { … }` z ciałem bez komentarzy. */
export function collectEffectBranches(source) {
  const found = [];
  const re = /effect\.type === '([a-z_0-9]+)'\)\s*\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    let depth = 1;
    let index = re.lastIndex;
    while (index < source.length && depth > 0) {
      const ch = source[index];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      index += 1;
    }
    const body = stripComments(source.slice(re.lastIndex, index - 1));
    const line = source.slice(0, match.index).split('\n').length;
    found.push({ type: match[1], body, line });
  }
  return found;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Zwraca naruszenia rodzin efektów (pomijając uzasadnione wyjątki). */
export function auditEffectFamilies({ rootDir = '.', families = EFFECT_FAMILIES } = {}) {
  const violations = [];
  for (const family of families) {
    for (const file of family.files) {
      const source = fs.readFileSync(path.resolve(rootDir, file), 'utf8');
      for (const branch of collectEffectBranches(source)) {
        if (!family.match.test(branch.type)) continue;
        const manualHit = family.manual.find((m) => m.re.test(branch.body));
        if (!manualHit) continue;
        const viaChoke = family.choke.some((c) => c.test(branch.body));
        if (viaChoke) continue;
        const key = `${family.id}.${branch.type}`;
        if (key in FAMILY_EXCEPTIONS) continue;
        violations.push({
          kind: 'effect',
          family: family.id,
          label: family.label,
          type: branch.type,
          file,
          line: branch.line,
          why: manualHit.why,
        });
      }
    }
  }
  return violations;
}

/** Zwraca globalne mutacje pól poza plikiem-właścicielem helpera. */
export function auditFieldMutations({ rootDir = '.', files = AUDITED_FILES, families = FIELD_FAMILIES } = {}) {
  const violations = [];
  for (const family of families) {
    for (const file of files) {
      if (file === family.owner) continue;
      const source = fs.readFileSync(path.resolve(rootDir, file), 'utf8');
      const clean = stripComments(source);
      for (const line of clean.split('\n')) {
        if (family.pattern.test(line)) {
          violations.push({
            kind: 'field',
            family: family.id,
            label: family.label,
            file,
            line: line.trim(),
            why: family.why,
          });
        }
      }
    }
  }
  return violations;
}

/** Pełny raport: rodziny efektów + rodziny pól. */
export function auditFamilies(opts = {}) {
  return {
    effect: auditEffectFamilies(opts),
    field: auditFieldMutations(opts),
  };
}

export function formatFamilyViolations(report) {
  const parts = [];
  for (const v of report.effect) {
    parts.push(
      `[${v.label}] ${v.type} (${v.file}:${v.line}) — ${v.why};\n`
      + `  dozwolone drogi: choke point rodziny ${v.family} albo delegacja applyEffect`,
    );
  }
  for (const v of report.field) {
    parts.push(`[${v.label}] ${v.file}: ${v.line} — ${v.why}`);
  }
  return parts.join('\n');
}

// Uruchomienie bezpośrednie: raport dla człowieka (npm test woła funkcję).
if (process.argv[1] && process.argv[1].endsWith('family-audit.mjs')) {
  const report = auditFamilies();
  const total = report.effect.length + report.field.length;
  if (total === 0) {
    console.log('Rodziny efektów i mutacje pól: brak naruszeń.');
  } else {
    console.log(formatFamilyViolations(report));
    console.log(`\nRAZEM naruszeń rodzin: ${total}`);
  }
}
