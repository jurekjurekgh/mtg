import fs from 'node:fs';
import path from 'node:path';

/**
 * Analizator kontraktów zdarzeń i choke pointów (ADR 0027, odznaka platynowa).
 *
 * Dlaczego istnieje: cztery odznaki (M269-M272) pokazały, że najbogatszą żyłą
 * błędów reguł jest wzorzec L107 — „choke point istnieje, ale jakaś ścieżka go
 * omija". Odpowiada za 10 z 25 znalezionych błędów. Audyt WZROKOWY tej klasy
 * nie nadąża: emiterów jednego zdarzenia bywa kilkanaście (50 dla
 * `object_moved`), a brak JEDNEGO pola w JEDNYM z nich jest niewidoczny.
 * Dowód: piątego emitera poświęcenia bez `toZone` (błąd #20) znalazł dopiero
 * test skanujący źródła, choć tę samą rodzinę przeglądałem ręcznie.
 *
 * Zasada działania — ROZJAZD ŁADUNKÓW. Jeśli zdecydowana większość emiterów
 * zdarzenia niesie pole X, a pojedyncze go nie niosą, to kandydat na błąd
 * kontraktu: konsument (log stołu, triggery, bot) czyta `e.X` i dostaje
 * `undefined`. Tak wyglądały błędy #20 (`toZone`), #22 (`cardId`)
 * i #23 (`colors`).
 *
 * Narzędzie NIE zgaduje intencji: każde trafienie, które jest świadomym
 * kontacktem, musi trafić na listę WYJĄTKÓW z uzasadnieniem (ADR 0027 pkt 3).
 * Wyjątek bez powodu jest naruszeniem, nie wyjątkiem.
 */

export const AUDITED_FILES = [
  'src/engine/effects.js', 'src/engine/game-state.js', 'src/engine/abilities.js',
  'src/engine/spells.js', 'src/engine/triggers.js', 'src/engine/permanents.js',
  'src/engine/state-based.js', 'src/engine/combat.js', 'src/engine/resources.js',
  'src/engine/objects.js', 'src/engine/counters.js', 'src/engine/players.js',
  'src/engine/zones.js',
];

/**
 * Świadome odstępstwa od kontraktu — każde z POWODEM (ADR 0027 pkt 3).
 * Klucz: `typZdarzenia.pole`. Wartość: dlaczego brak pola jest poprawny.
 */
export const CONTRACT_EXCEPTIONS = {
  'object_exiled.cardId':
    'Wygnanie ZAKRYTE (faceDown): nazwa karty nie jest informacją publiczną, '
    + 'więc zdarzenie celowo jej nie niesie (mgła wojny).',
  'object_exiled.object':
    'Ścieżka opóźniona (warp/suspend) niesie `objectId` + `cardId`; pełny '
    + 'snapshot obiektu jest tam zbędny, bo obiekt istnieje w `state.objects`.',
  'damage_prevented.cardId':
    'Celem prewencji bywa GRACZ, nie permanent — konsument (session.js) '
    + 'rozgałęzia się po `isPlayer(e.target)` i nie sięga po cardId.',
  'damage_prevented.objectId':
    'Prewencja obrażeń wobec GRACZA: identyfikatorem celu jest pole `target`, '
    + 'a permanentowego objectId po prostu nie ma.',
  'permanent_entered_battlefield.fromId':
    'ETB ze stref bez poprzednika obiektowego (żeton, kopia); żaden konsument '
    + 'nie czyta fromId dla tego typu — sprawdzone grepem w triggers/session.',
  'spell_cast.targetCardIds':
    'Ścieżka bez celów (`targets: []`) — LKI nazw celów nie ma czego opisywać.',
  'spell_cast.targets':
    'Wariant rzutu bez wyboru celów (czar bezcelowy) — lista byłaby pusta, '
    + 'a ścieżki celowane pole dokładają.',
  'discard_choice_required.sourceCardId':
    'Odrzucenie z limitu ręki (`purpose: hand_size`) nie ma karty-źródła; '
    + 'konsument formatuje ten wariant bez nazwy źródła.',
  'stats_modified.cardId':
    'Choke point `addStatModifiers` niesie `objectId`; konsument czyta nazwę '
    + 'z obiektu, bo modyfikator dotyczy permanentu na polu bitwy.',
  'counter_added.fromProliferate':
    'Znacznik proliferate dokłada wyłącznie ścieżka proliferate; zwykłe '
    + 'dołożenie licznika go nie ma z definicji.',
  'counter_removed.annihilated':
    'Znacznik anihilacji +1/+1 vs -1/-1 (SBA) — świadomy kontrakt UI '
    + '(session.js:1443), pozostałe ścieżki go nie niosą.',
  'counter_added.objectId': 'Wariant licznika GRACZA (trucizna) — identyfikatorem jest playerId.',
  'counter_added.cardId':
    'Licznik trucizny leży na GRACZU, a gracz nie jest kartą — nazwy nie ma '
    + 'skąd wziąć ani po co pokazywać.',
  'counter_added.counter':
    'Ścieżka licznika gracza niesie rodzaj w osobnym zdarzeniu '
    + '`poison_counters_added` (choke point addPoisonCounters).',
  'counter_added.amount':
    'Jak wyżej — liczbę liczników trucizny niesie zdarzenie dedykowane, '
    + 'które rozumie log stołu i heurystyka bota.',
  'counter_added.total':
    'Suma liczników gracza jest odczytywana wprost z `player.poison`, '
    + 'więc duplikowanie jej w zdarzeniu byłoby drugim źródłem prawdy.',
  'library_searched.qualifier':
    'Przeszukanie bez filtra („search your library for a card") — kwalifikatora '
    + 'nie ma z definicji efektu.',
  'library_searched.destination':
    'Domyślnym celem przeszukania jest ręka; pole dokładają wyłącznie ścieżki '
    + 'nietypowe (na pole bitwy, na wierzch biblioteki).',
  'library_searched.foundCardId':
    'Przeszukanie zakończone bez znaleziska (brak pasującej karty lub rezygnacja) '
    + '— nie ma karty, której nazwę można podać.',
  'damage_dealt.targetCardId':
    'Obrażenia zadane GRACZOWI: identyfikatorem celu jest `target`, a karty '
    + 'docelowej nie ma.',
  'keyword_granted.untilEndOfTurn':
    'Nadanie TRWAŁE (statyka, licznik) — brak znacznika czasowego oznacza '
    + '„na stałe", więc pole byłoby zawsze false.',
  'trigger_resolved.sourceId':
    'Trigger bez źródła obiektowego (efekt turowy, np. krok upkeepu) — nie ma '
    + 'permanentu, na który można wskazać.',
  'trigger_resolved.noEffect':
    'Znacznik „trigger rozstrzygnął się bez skutku" stawiają wyłącznie ścieżki '
    + 'puste; obecność skutku jest stanem domyślnym.',
  'trigger_target_resolved.remaining':
    'Ostatni cel w kolejce triggerów — reszty do rozstrzygnięcia już nie ma.',
  'trigger_target_resolved.targetId':
    'Rozstrzygnięcie triggera, w którym gracz nie wskazywał celu (brak legalnych '
    + 'celów albo trigger bezcelowy).',
  'card_milled.object':
    'Snapshot obiektu jest zbędny: karta trafia do grobu i konsument czyta ją '
    + 'wprost ze `state.objects` po `objectId`.',
  'explore_resolved.foundCardId':
    'Eksploracja przy pustej bibliotece — nie odsłonięto żadnej karty, więc '
    + 'identyfikatora nie ma.',
  'explore_resolved.isLand':
    'Eksploracja z pustą biblioteką: nie odsłonięto karty, więc pytanie '
    + '„czy to ląd" nie ma odpowiedzi.',
  'hand_creature_choice_resolved.sourceCardId':
    'Wybór inicjowany regułą gry, nie konkretną kartą — karty-źródła nie ma, '
    + 'a log formatuje ten wariant bez nazwy.',
  'devour_choice_resolved.remaining':
    'Ostatnia ofiara devour: kolejka jest pusta, więc pole „ile jeszcze" '
    + 'nie niesie informacji.',
  'ability_activated.keyword':
    'Zwykła zdolność aktywowana nie pochodzi od słowa kluczowego (equip, cycling), '
    + 'więc pola nie ma czym wypełnić.',
  'ability_activated.effectTypes':
    'Lista typów efektów jest podpowiedzią diagnostyczną dla bota; ścieżki '
    + 'proste jej nie wyliczają, a konsument traktuje ją jako opcjonalną.',
  'ability_activated.targets':
    'Zdolność bez celów („{T}: add {G}") — lista celów byłaby zawsze pusta.',
  'ability_activated.xValue':
    'Zdolność bez X w koszcie aktywacji — wartości X nie ma z definicji.',
  'permanent_cast.manaSpent':
    'Rzut darmowy (discover, kaskada): many nie wydano, a konsument liczący '
    + 'wydatki traktuje brak pola jak zero.',
  'permanent_cast.colors':
    'Emiter pomocniczy (resources.js) opisuje samo zagranie permanentu z ręki; '
    + 'kolory niesie ścieżka rzutu czaru, którą czytają triggery na kolor.',
};

/** Próg: pole uznajemy za część kontraktu, gdy niesie je >= tyle emiterów. */
export const CONTRACT_RATIO = 0.6;

function stripComments(source) {
  return source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Wyciąga wywołania `event('typ', { ... })` wraz z polami najwyższego poziomu. */
export function collectEmitters(source, file) {
  const found = [];
  const re = /event\(\s*'([a-z_]+)'\s*,\s*\{/g;
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
    // Komentarze usuwamy PO wycięciu ciała: inaczej `// ...` zjada pole
    // stojące za nim i analizator zgłasza fałszywy brak.
    const body = stripComments(source.slice(re.lastIndex, index - 1));
    const line = source.slice(0, match.index).split('\n').length;
    const fields = new Set();
    let level = 0;
    let current = '';
    const flush = () => {
      const name = current.match(/^\s*(?:\.\.\.)?([a-zA-Z_$][\w$]*)\s*(?::|,|$)/);
      if (name) fields.add(name[1]);
      current = '';
    };
    for (const ch of body) {
      if ('{(['.includes(ch)) level += 1;
      if ('})]'.includes(ch)) level -= 1;
      if (ch === ',' && level === 0) flush();
      else current += ch;
    }
    flush();
    found.push({ type: match[1], file, line, fields });
  }
  return found;
}

/** Zwraca listę naruszeń kontraktu (pomijając uzasadnione wyjątki). */
export function auditEventContracts({ rootDir = '.', files = AUDITED_FILES } = {}) {
  const emitters = [];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(rootDir, file), 'utf8');
    emitters.push(...collectEmitters(source, file));
  }
  const byType = new Map();
  for (const emitter of emitters) {
    if (!byType.has(emitter.type)) byType.set(emitter.type, []);
    byType.get(emitter.type).push(emitter);
  }
  const violations = [];
  for (const [type, list] of byType) {
    if (list.length < 2) continue;
    const counts = new Map();
    for (const emitter of list) {
      for (const field of emitter.fields) counts.set(field, (counts.get(field) ?? 0) + 1);
    }
    for (const [field, count] of counts) {
      const ratio = count / list.length;
      if (count < 2 || ratio < CONTRACT_RATIO || ratio >= 1) continue;
      const key = `${type}.${field}`;
      if (key in CONTRACT_EXCEPTIONS) continue;
      violations.push({
        type,
        field,
        have: count,
        total: list.length,
        missing: list.filter((e) => !e.fields.has(field)).map((e) => `${e.file}:${e.line}`),
      });
    }
  }
  return violations.sort((a, b) => (b.have / b.total) - (a.have / a.total));
}

export function formatViolations(violations) {
  return violations.map((v) => (
    `${v.type}.${v.field}: niesie ${v.have}/${v.total} emiterów, BRAK w:\n`
    + v.missing.map((m) => `    ${m}`).join('\n')
  )).join('\n');
}

/**
 * Drugi wymiar analizatora: ŚCIEŻKI OMIJAJĄCE CHOKE POINT STREF.
 *
 * `moveObjectDirectly` (objects.js) to jedyne legalne przejście między
 * strefami — niesie reguły, o których łatwo zapomnieć: unearth/flashback
 * (CR 702.83b/702.34b), `removeFromCombat` (CR 506.4), reset stanu obiektu
 * (CR 400.7), korektę kontrolera na właściciela (CR 400.3 + 110.2a).
 *
 * Ścieżka mutująca `state.zones` wprost omija je wszystkie. Czasem jest to
 * uzasadnione (przetasowanie biblioteki, kolejność scry — to nie zmiana
 * strefy), ale usunięcie permanentu z pola bitwy albo skasowanie obiektu
 * nigdy nie powinno pomijać listy konsumentów (L43).
 *
 * Błąd #25 (M273): dwie ścieżki kasujące token z pola bitwy zostawiały
 * wiszące id w `state.combat`.
 */
export function auditBattlefieldDeletions({ rootDir = '.', files = AUDITED_FILES } = {}) {
  const violations = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.resolve(rootDir, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const deleted = line.match(/state\.objects\.delete\(([^)]+)\)/)?.[1]?.trim();
      if (!deleted) return;
      const window = lines.slice(Math.max(0, index - 12), index + 8).join('\n');
      const escaped = deleted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const removesFromBattlefield = new RegExp(
        `zones\\.battlefield = state\\.zones\\.battlefield\\.filter\\(\\(id\\) => id !== ${escaped}\\)`,
      );
      if (!removesFromBattlefield.test(window)) return;
      if (/removeFromCombat/.test(window)) return;
      violations.push({ file, line: index + 1, objectRef: deleted });
    });
  }
  return violations;
}

// Uruchomienie bezpośrednie: raport dla człowieka (npm test woła funkcję).
if (process.argv[1] && process.argv[1].endsWith('event-contract-audit.mjs')) {
  const violations = auditEventContracts();
  const deletions = auditBattlefieldDeletions();
  if (violations.length === 0) {
    console.log('Kontrakty zdarzeń: brak naruszeń.');
  } else {
    console.log(formatViolations(violations));
    console.log(`\nRAZEM naruszeń kontraktu: ${violations.length}`);
  }
  if (deletions.length === 0) {
    console.log('Kasowanie obiektów z pola bitwy: brak naruszeń.');
  } else {
    for (const d of deletions) {
      console.log(`${d.file}:${d.line} — delete(${d.objectRef}) z pola bitwy bez removeFromCombat`);
    }
  }
}
