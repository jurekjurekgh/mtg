# PLAN 2026-10-10d — audyt PR #162 i dalsza pętla jakości

Zlecenie właściciela: „Kontynuujemy projekt.” Zgodnie z ADR 0020/0021 sesja
najpierw audytuje ostatni scalony PR **#162**, naprawia każde znalezisko, a po
zamknięciu audytu podejmuje niedokończony plan z `main` albo pętlę jakości.
Gałąź sesji: `arena/8ec8f610-mtg`; jeden PR tej sesji do `main`.

## Stan wejściowy

- `main` / `HEAD`: `dab1488` — squash PR #162; baza audytowanego diffu:
  `1732c3d` (PR #161).
- Zakres PR #162: **59 plików, +4309/−92**. Obejmuje audyt PR #161 i naprawy
  F-1/F-2, batch 65 (10 kart), naprawę Adventure/`kind`, wznowienie czaru po
  ostatniej decyzji blokującej oraz PMSSB-60 z sześcioma falami wyceny bota.
- Baseline bieżącego `main`: `npm test` **8031/8031**, build **73 moduły /
  5010,6 kB**.
- Najnowszy handoff `HANDOFF_2026-10-10.md` opisuje tylko pierwszy fragment PR
  #162 (audyt #161); stan późniejszy rekonstruujemy z net-diffu, commitów PR,
  planów batch65/PMSSB-60 i kodu — handoff nie jest źródłem prawdy.
- Bez pełnego B0: właściciel nie zlecił go w tej sesji (ADR 0018/0025).

## Etapy i kryteria ukończenia

### A. Plan i PR sesji

- [x] Zapisać ten plan jako osobny commit, po zielonych `npm test` + build.
- [x] Pushnąć commit przyrostowo i otworzyć PR tej sesji przed zmianami kodu.
- [x] W opisie PR utrzymywać kumulatywnie wynik audytu i kolejne naprawy.

**Commit 1:** `docs(plan): roadmapa audytu PR #162 i pętli jakości`.

### B. Audyt pełnego diffu PR #162 (ADR 0020 B)

- [x] Przejrzeć **każdy z 59 zmienionych plików**, z rejestrem w raporcie:
  1. dokumentacja/plany/handoff i zgodność deklarowanych pomiarów;
  2. snapshoty 10 kart, słownik kolekcji, definicje, koszty, talie i README;
  3. nowe/zmienione mechaniki engine: dynamic damage, target
     creature-or-planeswalker, affinity, selektywne blokowanie, Zombie Boa,
     Adventure `kind`, zawieszone czary;
  4. UI daru i publiczne pola widoku;
  5. PMSSB-60 — wyceny, kontrfaktyki, pokrętła i zakres fal;
  6. wszystkie testy: czy mierzą deklarowaną regułę i czerwienieją po rewersie.
- [x] Zweryfikować Oracle/rulingi dziesięciu kart wobec źródeł zapisanych w
  snapshotach i niezależnego źródła dostępnego przez GitHub; sprawdzić `plan`,
  `artId`, druk i pełne Oracle 1:1 (ADR 0010/0022/0028/0029).
- [x] Zweryfikować cytaty CR dla zmian regułowych z dosłownym aktualnym tekstem
  CR pobranym online z dozwolonego źródła GitHub (ADR 0030), szczególnie CR
  107.4c, 205.2a, 400.7, 608.2h, 702.41, 702.114, 715.3b/715.4.
- [x] Odtworzyć kluczowe scenariusze produkcyjnymi ścieżkami, nie helperami
  omijającymi `execute`/SBA (L68/L111): Adventure, ostatnia decyzja czaru,
  affinity, trigger Zombie Boa i dynamiczne obrażenia.
- [x] Sprawdzić generyczność (zero branchy po nazwie/ID karty w core), FoW,
  determinizm, kompletność `PlayerView` i zgodność oferta↔walidacja.
- [x] Uruchomić baseline `node --test test/bot-benchmark.test.js` oraz właściwe
  testy celowane; pełne logi wyłącznie do `.arena/`.
- [x] Zapisać raport `docs/audits/AUDYT_PR162_2026-10-10.md` z werdyktem,
  rejestrem 59 plików, dowodami i findingami.

**Kryterium:** każdy plik ma jawny wynik przeglądu; każdy claim regułowy ma
źródło; każdy finding ma reprodukcję przed naprawą.

### C. Naprawy findingów audytu

Dla każdego znalezionego defektu, osobny mały przyrost:

1. test/reprodukcja RED na stanie `main`;
2. minimalna naprawa u root cause, bez przypadku po nazwie karty;
3. GREEN + mutacja rewersu naprawy (L13);
4. `npm test` + `npm run build` na zamrożonym drzewie;
5. osobny commit i natychmiastowy push.

- [x] Findingi kodu/reguł naprawione.
- [x] Findingi testów/strażników naprawione.
- [x] Dokumentacja audytu aktualizowana po każdym przyroście.

**Commity 2…N:** po jednym na samodzielnie zielony finding; bez squasha i bez
force-pusha.

### D. Domyślna kontynuacja po audycie (ADR 0021)

- [x] Skonfrontować najnowsze plany na `main` ze stanem faktycznym. PMSSB-60
  nie ma checkboxów realizacji, więc jego kryteria weryfikujemy w audycie;
  nie powtarzamy wykonanych fal tylko dlatego, że handoff jest niepełny.
- [x] Jeśli plan ma realnie otwarte kryterium — podjąć je w miejscu urwania.
- [x] W przeciwnym razie wykonać jedną celowaną pętlę jakości na rodzinach
  dotkniętych PR #162: Żywy Tester/sonda headless + ręczna lektura wyniku,
  audyt innej osi CR i naprawa każdego wykrytego błędu.
- [x] Nie dodawać kart bez nowej listy właściciela (ADR 0029).

**Kryterium:** dalsza praca wynika ze stanu repo, nie z backlogu ani wymyślonego
batcha; znaleziony błąd ma root-cause fix i strażnika.

### E. Brama końcowa i dokumentacja

- [x] `npm test` (cicho), `npm run build` (cicho).
- [x] `npm run test:all` jako pełna brama CI, cicho do `.arena/` (ADR 0019).
- [x] `node --test test/bot-benchmark.test.js` po zmianach bota/enumeracji.
- [x] `node tools/cr-numery.mjs --cr` po zmianach regułowych/cytatach.
- [x] Zaktualizować plan (checkboxy + podsumowanie), raport audytu,
  `docs/PROJECT_HISTORY.md`, nowy handoff sesji i opis PR.
- [x] Potwierdzić czyste drzewo, zgodność lokalnego HEAD ze zdalną gałęzią i
  zielone checki GitHub.

**Ostatni commit:** dokumentacja stanu i handoff po wszystkich zielonych
przyrostach; push przyrostowy.

## Ryzyka i pułapki

- PR #162 jest squash-em wielu etapów; audytujemy **net-diff 1732c3d..dab1488**
  oraz historię commitów PR, nie historyczne drzewo całego repo.
- 59 plików / sześć niezależnych obszarów: „testy zielone” nie zastępują
  rejestru plików ani weryfikacji mutacyjnej.
- Snapshot Scryfall w repo jest dowodem pomocniczym, nie niezależnym źródłem;
  druk/set/rulingi trzeba zestawić z drugim źródłem.
- `accepted()` jest wspólnym choke pointem wielu decyzji: naprawa zawieszonych
  czarów może podwójnie wznowić czar albo ominąć dalszą decyzję — wymagane oba
  kierunki testu i pełna brama slow.
- Wyceny PMSSB są podatne na pozorne piny arytmetyczne i dryf fixture; najpierw
  `--dump`/kontrfaktyk, regeneracja fixture wyłącznie po świadomym pomiarze.
- Żywy Tester mierzy `dist/`; zawsze build przed pomiarem i żadnych
  transkryptów w Git.
- Testy są uruchamiane cicho; brak końcowego wyniku = wynik nieznany, nie GREEN.

## Podsumowanie realizacji

Audyt zamknął **15 findingów** (12 kod/kontrakt/UX/dokumentacja + 3 jakość
testów) w 10 przyrostach naprawczych. Celowana pętla jakości po audycie objęła granice
Batcha 65: semantykę self-target no-op Drone, faktyczne obrażenia Blitza
Creature Planeswalkerowi i poprawną podstawę zejścia Impulse ze stosu.
PMSSB-60 było wykonane, ale dostało brakujący pin C4 decyzji koloru; razem
26 pinów. Raport: `docs/audits/AUDYT_PR162_2026-10-10.md`.

## Dopisek 2026-10-11 — uwaga z gry A

- [x] RED: Withstand rzucony w upkeepie bez zagrożenia mimo że draw jest tylko riderem.
- [x] Root-cause fix w `preventShieldValue`, wspólna kara przedwczesnej prewencji.
- [x] Rozdzielenie lethalu i nielethalnego pinga na stosie.
- [x] Produkcyjny fixture Shocka (`playerView` + `execute` + priorytet).
- [x] Targeted 32/32, fast 8042/8042, benchmark 10/10.
- [x] Golden master zbadany (pierwszy rozjazd = naprawiany upkeep) i świadomie odnowiony.
- [x] Końcowe `test:all` 8306/8306, build 73 moduły / 5019,3 kB i dokumentacja.
- [x] GitHub CI **SUCCESS** — run `38165106753`.

## Dopisek 2026-10-11 — uwaga z gry B / Skilled Animator

- [x] RED: trzy duże własne kreatury i zero artefaktów → błędny rzut 1/3, score 63,9009.
- [x] RED: samo duże 4/4 artifact creature błędnie liczone jako pełny payoff, score 72,9009.
- [x] Fix po `animate_linked`, bez id/nazwy karty; mierzenie realnego zysku celu.
- [x] Kara `linkedAnimationFutilePenalty` z dowodem pokrętła ×0.
- [x] Wyjątek tylko wtedy, gdy nowe ciało zmienia lethal kontrataku w przeżycie.
- [x] Targeted 9/9 i animacje 67/67; fast 8051/8051; golden 4/4 bez regeneracji; benchmark 10/10; build 73 / 5025,4 kB.
- [x] Końcowe `test:all` 8315/8315 i dokumentacja.
- [x] GitHub CI **SUCCESS** — run `38173232995`.
