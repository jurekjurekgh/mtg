# Plan G — architektura „konstruuj + waliduj" zamiast enumeracji kombinacji (2026-11-05)

## Zgłoszenie właściciela

Po zgłoszeniu F (usunięcie limitów enumeracji) właściciel wskazał błąd
w założeniach: „Po co tworzyć wszystkie kombinacje, skoro gracz/bot nigdy
ich nie użyje? Czemu nie sprawdzać legalności jedynie rzeczywistych,
wybranych kombinacji zamiast enumerować wszystkie możliwe kombinacje?
Moim zdaniem to jest jakiś błąd w założeniach."

Decyzja właściciela (pytanie doprecyzowujące, 2026-11-05): migracja
**etapami — najpierw walka**, potem pozostałe decyzje kombinatoryczne.

## Diagnoza (pomiar i kod)

- `legalCommands` (game-state.js) jest dziś wspólnym kontraktem: kompletna
  lista wariantów, z której UI robi menu, a boty wybierają argmax
  (heuristic `scoreCommand`, aggro, random). Gałąź walki materializuje
  każdy podzbiór atakujących i każde przypisanie blokerów jako komendę.
- Koszt jest wykładniczy i płacony przy każdym wywołaniu: zmierzona pełna
  enumeracja bloków 5×5 = 7 776 ofert/0,2 s, 6×6 = 117 649/2,6 s,
  7×7 = 2 097 152/61 s. Gracz realnie wybiera JEDNĄ kombinację.
- Docelowa połowa architektury już istnieje:
  - walidacja wybranej kombinacji niezależna od oferty:
    `declareAttackers`/`declareBlockers` → `blockerDeclarationViolation`,
    `blockAssignmentViolation` (combat.js);
  - kreator bloków człowieka buduje przypisanie parami z
    `blockCandidatePool`, a `completeBlockingAssignment` dowodzi
    dopełnialności pary dopasowaniem dwudzielnym — bez enumeracji deklaracji;
  - kreatory istnieją też dla celów triggera, podziału obrażeń, scry itd.

Wniosek: enumeracja miesza trzy role — (1) legalność, (2) konstrukcję
wyboru człowieka, (3) kandydatów bota. Legalność ma być walidacją wyboru
(kompletna z definicji, bez listy do ucięcia), konstrukcja — kreatorami
przyrostowymi, kandydaci — strategią kontrolera.

## Zasada docelowa

Dla decyzji kombinatorycznych `legalCommands` NIE wylicza wariantów.
Widok niesie opis problemu (kandydaci + ograniczenia + ziarna startowe
liczone solverem w czasie wielomianowym), kontroler konstruuje jedną
kombinację, silnik waliduje ją przy `execute`. Żadna legalna kombinacja
nie jest ucięta, bo nie ma listy, którą można uciąć — polecenie F
(„żadnego ucinania w żadnej gałęzi") jest spełnione konstrukcyjnie.
Decyzje dyskretne (ląd, czar bez celów, pass…) zostają listą jak dziś.

## Etap 1 — walka (ten plan, bieżąca realizacja)

### Silnik (combat.js / game-state.js)

- `attackerDeclarationViolation(state, playerId, ids)` — walidacja samej
  deklaracji ataku wyciągnięta z `declareAttackers` (jedno źródło prawdy;
  `declareAttackers` rzuca jej wynik jak dotąd).
- `attackCandidateIds(state, playerId)` — zdolni do ataku (porządek pola
  bitwy) + wymuszeni z `mandatoryAttackerIds`.
- `blockerSeedAssignments(state, playerId)` — ziarna deklaracji bloków:
  `{}` (bez bloków) + dla każdej pary z puli jedno dopełnienie solvera
  `completeBlockingAssignment`; każde ziarno przefiltrowane tą samą
  walidacją co `declareBlockers` (ograniczenia + maksimum wymogów).
  Liczba ziaren jest wielomianowa (≤ liczba par + 1), nie wykładnicza.
- `legalCommands`: gałęzie `declare_attackers`/`declare_blockers`
  wystawiają ziarna jako komendy (kontrolerzy działają bez zmian
  kontraktu), a nie pełną enumerację. Usunięte `legalAttackerOptions`,
  `legalBlockerOptions` i martwe pomocniki enumeracji.
- `playerView.combatDeclaration`: opis problemu dla kreatorów i botów:
  atak `{ role, candidateIds, mandatoryIds, aloneIds }`; blok
  `{ role, attackerIds, pool, mandatoryIds }`. `blockCandidates` zostaje.

### Kontrolery

- Heuristic-bot: kandydaci ataku = ziarna + własne podzbiory prefiksowe
  (ranking opcjonalnych atakujących po wycenie wariantu jednoosobowego;
  prefiksy k=1..n) budowane WYŁĄCZNIE z deskryptora (kandydaci, wymuszeni,
  reguła „can't attack alone") — legality wynika z konstrukcji, a wycena
  idzie tym samym `scoreCommand`. Bloki: ziarna solvera.
- Aggro: bez zmian logiki (największy atak / najwięcej bloków spośród
  ziaren — ziarno „wszyscy" istnieje).
- Random: losuje spośród ziaren (zawsze legalnych).

### UI

- `renderCombatWizard` dostaje deskryptor `combatDeclaration` (kandydaci,
  wymuszeni, pula) zamiast wywodzić wszystko z sumy ofert; fallback dla
  starych wywołań/testów z samymi `options` zostaje.

### Testy i bramki etapu 1

- Nowy `test/zgloszenie-g-walka-konstruuj.test.js`: ziarna legalne
  (execute przyjmuje każde), dowolna legalna deklaracja spoza ziaren
  przyjęta przez execute (m.in. warianty, które dawny cap ucinał),
  kompletność puli par, bot deklaruje atak/blok w symulacji, brak
  materiału wykładniczego (liczba ofert walki przy 6×6 mała).
- Świadome aktualizacje pinów oferty: m245, block-slots, e6, fix-b,
  audyt-pr129, property-test kontraktu oferty (ziarna ⊆ walidacja +
  kompletność puli zamiast równości zbiorów).
- Golden-master bota: dryf tylko świadomy, z wpisem do rejestru;
  benchmark bota jako kontrola jakości (brak załamania).
- Bramki: pakiet pokrewny, `npm test`, build, `npm run test:all`.

## Etapy następne (osobne realizacje, ten sam wzorzec)

- Etap 2: triggery wielocelowe i czary z podziałem obrażeń (kreatory już
  istnieją; enumeracja `resolve_trigger_target`/`resolve_damage_division`
  schodzi do deskryptora + walidacji).
- Etap 3: mulligan bottom, untap choice, delve/escape exile, czary z {X}
  i Fireball (steppery/wybory przyrostowe zamiast list wariantów).

## Czego etap 1 świadomie NIE robi

- Nie zmienia reguł legalności ani kolejności zdarzeń; zmienia wyłącznie
  sposób wystawiania oferty walki kontrolerom.
- Nie rusza enumeracji pozostałych decyzji (etapy 2–3); zdjęcie limitów
  ze zgłoszenia F tam zostaje do czasu ich etapów.
- Commit F `50e2da3` w części walki zostaje zastąpiony tym etapem;
  w pozostałych gałęziach obowiązuje do etapów 2–3.
