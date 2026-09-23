# MTG Engine

> **Agent / nowa sesja:** jedyny plik startowy, niezależny od wiadomości
> w czacie, to [`AGENTS.md`](AGENTS.md). Czytasz go cały, potem **wszystkie**
> ADR-y (`docs/decisions/`, w tym [0020](docs/decisions/0020-mandatory-session-workflow-pr-audit-incremental.md)),
> potem `docs/LESSONS.md` i `docs/setup/ENVIRONMENT.md` — **zanim** napiszesz
> do właściciela albo zaczniesz kodować.

Headless, rozwijalny silnik do rozgrywania partii **Magic: The Gathering** dla kontrolowanego, stopniowo rozszerzanego zbioru kart. Docelowo silnik będzie zasilał samodzielny Wirtualny Stół, walidował wszystkie działania i umożliwiał grę człowieka z przeciwnikiem sterowanym algorytmicznie.

> Projekt nie próbuje obsłużyć wszystkich istniejących kart MtG ani od razu zaimplementować całych Comprehensive Rules. Obsługiwany zakres rośnie karta po karcie, wraz z testami wymaganych mechanik.

## Status

Headless engine działa: zamknięte milestone'y **M1–M5** (odtwarzalny sandbox, zasoby,
combat, warstwa danych i pierwsza pionowa ścieżka UI — przez stołowy HTML rozgrywa
się pełną partię człowiek–bot), a na nim **M8–M43: Batche 1–21 (138 wspieranych kart
realnych**, pełne mechaniki — od liczników, morph i ninjutsu po Adventure, Kicker,
Crew, double strike, lifelink, Station (EOE Spacecraft), Sagę CR 714 (Jill//Shiva),
Metalcraft, prewencję „this turn", must-attack, kontrczary na dowolny czar, ping-pong
kontroli, inicjatywę, clash, phyrexian manę, czary wielocelowe, aury Enchant player,
defender, flash, Food, discover, explore, craft, Escape, modal Choose one, Tarmogoyf)
oraz **M31–M32: kreator talii singleton** — max 1 kopia (lądy podstawowe dowolnie),
min. 15 nielandowych; **9 talii** (green/black/red/innistrad/azorius/wiedzmin/graveyard/tokens/spellslinger)
zastąpiło dotychczasowe, **M34/M39–M42: UX stołu** — czary za manę produkowalną z auto-tapem,
wskaźnik tury jako warstwa fixed, kreator many, mulligan londyński, pauza po zagraniu bota
(klik „Rozumiem"), swipe karuzeli, polskie logi, tyły DFC poza taliami, mirror match,
oraz **M44–M48 / T1–T6: weryfikacja reguł MtG** — kolorowe koszty zdolności, finality dla każdej
przyczyny, dies/leaves, discard/hand-top wybory gracza, Unstable Frontier podtypy (CR 305.6),
search choice z fail-to-find, pay-or-sacrifice, optional pay, Moonlit, Lyre X, hexproof,
choroba + {T}, hand size 7, first-turn bez draw, anihilacja liczników, rozdział obrażeń
(CR 510.1c), mana per step, tokeny, legend face-down, morph koszty z pipami, permanenty
na stosie, cele triggerów jako wybór gracza (resolve_trigger_target), auto-tap pipów właściwą
maną, triggery na stosie, regeneracja.
B0 harness (B1–B5 bota, tune-bot), ilustracje Scryfall, ChoiceRequest i benchmark.
Bieżący stan: szybki rdzeń **6179/6179**, pełna brama **6189/6189**, artefakt **59 modułów / 4049,7 kB** (**sesja 2026-09-23 — porządki danych na zgłoszenie właściciela: 71 wierszy `STO` usuniętych ze słownika kolekcji (573→502), status `limited` zlikwidowany — tokeny mają status `token`, tylne strony DFC `back` (stąd brak w katalogu jakiejkolwiek niedokończonej karty), legacy `card_viewer` usunięty z repozytorium — **M417–M419**; wcześniej w tej samej sesji — audyt scalonego PR #133 (58 plików, werdykt APPROVE) + naprawy znalezisk F-1..F-4: martwe odwołania do emerytowanej flagi `cantBeBlocked` w cleanupie (→ `cantBeBlockedUntilTurn`), piny restrykcji bloku i odcisku stanu na nowym polu, dar ewazji bez podwójnego bonusu aury (moc efektywna) — **M416**); (sesja 2026-09-22 — uwaga z gry N: aura warunkowa („+2/+2 dopóki podtyp, w przeciwnym razie nie może atakować ani blokować”) wyceniana względem GOSPODARZA — koniec z darowaniem przeciwnikowi +2/+2 — **M412**); **sesja 2026-09-22 — uwagi z gry K/L/M: combat trick z riderem Scry nie jest palony poza walką, zdolność blokująca z {X} od mocy celu czeka na największe zagrożenie, cele rzutu za flashback w modalu zamiast w panelu — **M411**); **sesja 2026-09-22 — uwagi z gry G/H/I/J: pip w koszcie triggera liczy się do tożsamości kolorystycznej talii (Panic Spellbomb → BRG), opłacony kicker widoczny w logu i „Rozgrywka”, blokowanie stworów z first strike liczone z kolejnością obrażeń (CR 510.4/702.7b), trucizna drugim zegarem przegranej także w obronie — **M410**); **sesja 2026-09-22 — uwaga z gry F: Pristine Talisman znów działa — źródło many z korzystnym riderem liczy się do oferty rzutu i auto-tapu (rider wykonywany), a wyciszane w panelu są tylko czyste „{T}: Add …” — **M409**); (sesja 2026-09-22 — uwagi z gry C/D/E: koszt musi mieć adresata — Sequestered Stash tylko przy 30+ kartach biblioteki, >8 lądach i drogim artefakcie w talii; koszt-discard oddaje najpierw karty niegrywalne kolorem, nie „rewelacyjne kreatury”; załoga pojazdu wyłącznie w oknie ataku (przy realnym zamiarze) albo przed blokami — **M408**); (sesja 2026-09-22 — uwagi z gry B: dar „can't be blocked this turn” celuje atakiem, nie najmniejszym powerem — klasa cant_be_blocked zamknięta: klasyfikacja intencji + adapter rozdziałów Sag + cantBeBlockedTargetValue + wygaszanie „this turn” + pula Oracle „Target creature” — **M407**; uwaga A: wszystkie czary modalne bez „pierwszego z brzegu” targetu — **M406**); (sesja 2026-09-21c — uwagi z gry A/B/C: Twiddle penalizowany scoringowo, „Mana Wizard” konwerterów many, Vandalize „Choose one or both” + dopisek CR 601.2c — **M405**); (audyt scalonego PR #132 — 114 plików, werdykt APPROVE; łowy CR → **H-1** w CR 704.5m — **M404**; gospodarz-GRACZ aury (CR 303.4f) — **M403**; audyt dokumentacji i cięcia lekcji — **M401/M402**)**;; gospodarz-GRACZ aury (CR 303.4f) — **M403**; audyt dokumentacji i cięcia lekcji — **M401/M402**)**;; audyt dokumentacji startowej i cięcia lekcji — **M401/M402**; uwagi z gry: ikony many w panelu, klik w nazwę z odkrytej ręki, renam „tapnięcie” — **M400**)**;; (**krok 4 sesji 2026-09-21 — gospodarz-GRACZ aury (CR 303.4f „object or player") wykonany**: decyzja `resolve_aura_host` niesie odtąd OBA zbiory kandydatów (`candidatePlayerIds` obok `candidateIds`), `attachments.js` rozdziela predykaty gospodarza (`isLegalAuraHost` milczy dla `enchant: 'player'`, nowy `isLegalAuraPlayerHost`) i daje wspólny zbiór `legalAuraHosts`, a `attachAuraToPlayer` nadaje aurze kształt identyczny z rzutem z ręki (`kind: 'enchantment'` + `enchantedPlayerId`, bez `attachedTo`) i emituje `aura_attached_to_player` (typ + opis logu, strażnik M134); etykieta oferty mówi „Zaczaruj: Ty/Nieprzyjaciel", heurystyk wycenia kandydata-gracza (wroga klątwa na przeciwnika, nigdy na siebie), projekcja pokrycia nie liczy go jako „niewyceniony", aggro też nie zaczarowuje siebie, a re-walidacja przy wykonaniu idzie tymi samymi predykatami co oferta (L48); pin `test/granica-aura-host-2026-09-21.test.js` G/1–G/4, lekcja **L163**, milestone **M403**); (**ciąg dalszy sesji 2026-09-21 (ta sama gałąź) — granica aura–host (CR 303.4f) zmierzona na żywo i naprawiona + audyt dokumentacji startowej**: talia-sonda zmusiła decyzję `resolve_aura_host` (seed 106: Annie Flash → Silken Strength z grobu → „kandydaci: 6" → wizard → Kor Cartographer), a pomiar odsłonił, że aura „Enchant player" wracająca z grobu SIADAŁA NA STWORZE (`isLegalAuraHost` bez gałęzi dla `enchant: 'player'` wpadał w domyślne „wyłącznie stwory") — naprawa u źródła: żaden permanent nie jest gospodarzem takiej aury, więc zostaje w grobie z jawnym `aura_returned_without_host` (gospodarz-GRACZ, CR 303.4f „object or player", odroczony świadomie); pin `test/granica-aura-host-2026-09-21.test.js` G/1–G/2; pętla jakości 8 partii (seedy 71–78): 8/8 naturalnych końców, 0 detektorów; **audyt dokumentacji startowej**: 0 z 30 ADR-ów do archiwum (0006 sprawdzony wobec 0009 — zasada „najpierw audyt" zostaje w mocy), 0 merytorycznie martwych lekcji, naprawione 4 odsyłacze ADR + 3 odsyłacze lekcji, proza rejestru do archiwum (30 wpisów / 7 427 B), budżet lektury **97 007/100 000** — raport `docs/audits/AUDYT_DOKUMENTACJI_STARTOWEJ_2026-09-21.md`, milestone **M401**; **krok 3 (ta sama sesja): twardsze cięcie lekcji** (zlecenie właściciela) — przegląd wszystkich **162 wpisów rejestru**, kryterium „incydent jednorazowy, którego reguła żyje już w innym wpisie”, wynik **9 wpisów → `docs/LESSONS_ARCHIWUM.md`** (L3, L7, L8, L9, L10, L23, L35, L62, L122) z powodem, regułą-żywą-dziś i pełną narracją (nic nie kasowane, numery zostają; sekcja-odsyłacz w rejestrze); dwa szczegóły klasy przeniesione do wpisów-zbiorczych (L54 pkt 5, L152 pkt 4); rejestr **130 431 → 125 524 B**, `LESSONS_PRZYPADKI.md` **161 806 → 158 382 B**, budżet lektury **95 254/100 000** — milestone **M402**); **sesja 2026-09-21, PR #132 — trzy uwagi właściciela z gry (A/B/C), każda u root cause z pinem RED→GREEN i dowodem mutacyjnym**: **A** — czar modalny w „Twoich działaniach” pokazywał surowy koszt `{G}{W}` zamiast ikon many: `choiceGroupTitle` miał JEDEN, tekstowy wariant wyniku, a konsumują go warstwy o różnym kanale zapisu (panel = `innerHTML`, nagłówek modala i intro wizarda = `textContent`, M87) — naprawa dobiera wariant jawnym parametrem `manaHtml`, nagłówek zostaje przy notacji `{…}`; **B** — klik w nazwę karty w modalu wyboru (Toll of the Invasion: karta z ODKRYTEJ ręki przeciwnika) nie otwierał obrazu: wiersz niósł objectId, a `openCardFullscreen` kończy się cicho, gdy obiektu nie ma w widocznych strefach gracza (FoW) — kreator rozpoznaje taki wiersz i prowadzi podgląd drogą `cardId` (`hiddenObjectCardId`), z wyjątkiem obiektu widocznego (karuzela strefy bez zmian) i biblioteki (zakryty wierzch zostaje zakryty); **C** — „zatapianie celu” → „tapnięcie celu”: rodzina „zatap-*” wyszła z całej warstwy produktu (86 plików / 260 linii: etykiety efektów, triggerów, celów i warunków na kaflach, nazwy trybów kart, linie logu), a regex detektora fałszywego „brak skutku” zna nowe brzmienie logu (L160); pomiar na artefakcie: panel renderuje `<span class="ms ms-g">`+`ms ms-w` dla Selesnya Charm, klik w nazwę w modalu Toll daje `pełny ekran=true` + `img` Scryfalla, a log forecastu Piercing Rays mówi „Aktywujesz zdolność: Piercing Rays — tapnięcie celu → cel: Highland Game”; bramy: szybki rdzeń **6074/6074**, pełna brama **6084/6084**, budżet lektury **99 405/100 000** — lekcja **L162**, milestone **M400**, handoff [2026-09-21](docs/setup/HANDOFF_2026-09-21.md)); (**sesja 2026-09-20e, PR #132 — audyt scalonego PR #131 (ADR 0020 B) + pętla jakości (ADR 0021)**: piętnaście znalezisk F1–F15 z pinami RED→GREEN i dowodem mutacyjnym (matryca 31/34 RED + N19–N23; trzy zielone mają zmierzony powód — M11/M12 to bramki osłonowe, N18 to no-op przy domyślnej wadze `ability: 1`): Delve (bramka kosztu z kosztu całkowitego, atomowość płatności, kolejność zdarzeń powrotu aury, gospodarz spoza listy), wycena Craft w grobie (F7 — `objectOnBoard` na karcie w grobie → `zoneCard`), ślad bota bez nazw i projekcji (F8/F8b), ślepy pin czaru modalnego (F9 — `ok !== undefined` przechodzi dla `false`), niepinowany warunek `stack.length > 0` (F10), niezmiennik otwartej decyzji aury (F11–F13), **F14**: wizard bloków pozwalał zaznaczyć tego samego blokera pod dwoma atakującymi (silnik odrzucał komendę PO wysłaniu, a legalny wyjątek Cenn’s Tactician był nieosiągalny) — widok niesie `blockerSlots` z `buildBlockerView`, wizard liczy użycia z `blockedBy`, oraz **F15** z pętli jakości: log prewencji Ethersworn Shieldmage mówił „chronionym obiektom” bez zakresu (karta: artefaktowe stwory) — naprawa u źródła, deskryptor niesie `description`, silnik przenosi je do zdarzenia i filtra stanu, sesja używa go z fallbackiem; **E3**: 8 partii Żywym Testerem (seedy 71–78) = 8/8 naturalnych końców, 0 zgłoszeń detektorów, 0 niewycenionych, pokrycie 201 akcji widzianych / 190 klikniętych; **granica pokrycia**: decyzja gospodarza aury (CR 303.4f) nie zaszła w 14 partiach (8 + 6 celowanych) — warstwę pokrywają piny silnika; bramy: `node tools/run-tests.mjs all` **6073/6073**, bot-benchmark **10/10**, benchmark `--quick` **672 mecze / 0 niedokończonych**, budżet lektury **98 822/100 000** (kondensacja rejestru lekcji — rozbudowane Strażniki L86–L138 do archiwum narracji)); (sesja 2026-09-20d, PR #131 — pomiar pozycji „otwarte, nienaprawiane świadomie" z audytu PR #130 §6**: właściciel zakwestionował tę kategorię („błędy powinny być natychmiast naprawiane"), więc każda pozycja dostała pomiar — trzy były źle zakwalifikowane (dziura w pinie albo kopia reguły), jedna realnym defektem warstwy gracza; **E6**: `legalBlockerOptions` ponad `COMBAT_OPTION_CAP` kończy się `slice(0, cap)`, a wizard bloków brał kandydatów z SUMY OFERT — legalny blok był nieosiągalny dla człowieka (pomiar braków: 6×6 → 5 par, 8×8 → 33, 10×10 → 69), naprawa rozdziela menu od puli: nowy `blockCandidatePool` (legalność z `blockAssignmentViolation`, M387), pole widoku `blockCandidates` (tylko broniący, tylko krok deklaracji bloków) i wiersze wizarda z puli uzupełnionej ofertami (CR 509.1b); **D/5**: niezmiennik pipów zdolności domknięty dla kart KOLOROWYCH (D/4 pomijał je przez `continue`) — pomiar 25 talii dał 2 naruszenia, oba to konflikty dwustronne, więc są nazwane, zliczone (ratchet w obie strony) i usprawiedliwione mechanicznie (Mournful Zombie B ze zdolnością za {W} w BRG; Dragonbroods' Relic G ze zdolnością za {3}{W}{U}{B}{R}{G}, niepłacalną w żadnej talii 2–3-kolorowej); **E5**: 14 skażeń pismem niełacińskim usuniętych (2 w `src/`, 2 w `test/`, 11 w `docs/` — cyrylica wklejona w polskie słowa, psuła grep) + stały strażnik klasy z jawnymi wyjątkami, ratchetem i dowodem, że detektor działa; **E7**: usunięte `modeFollowUpPlanOf` — lustro kaskady panelu z `main.js` (4 z 11 planów, kolejność odwrotna niż wymaga M300/1), wołane wyłącznie przez testy; testy M2/2–M2/4 pinują odtąd funkcje produkcji; bramy: `node tools/run-tests.mjs all` **6058/6058**, szybki rdzeń **6048/6048**, bot-benchmark **10/10**, benchmark `--quick` **672 mecze / 150,9 s, 0 niedokończonych**, heuristic **85,9%** (bez regresji wobec 85,9%), budżet lektury **99 966/100 000** (wpis **L158** opłacony kondensacją, próg bez zmian); raport: dodatek §9 w `docs/audits/AUDYT_PR130_2026-09-20.md`, milestone **M398**, sekcja F planu `docs/plans/PLAN_2026-09-20b-audyt-pr130-i-petla-jakosci.md`, handoff: [2026-09-20c + aktualizacja d](docs/setup/HANDOFF_2026-09-20c.md)); (sesja 2026-09-20c, PR #131 — audyt PR #130 (ADR 0020 B)**: cztery znaleziska reguł naprawione z pinami RED→GREEN i dowodem mutacyjnym — **A**: Delve na permanentie odbierał rzut przy pustym grobie (CR 702.66a — wygnanie jest opcjonalne; reguła w jednym `affordableDelveCounts`), **B**: limit Delve liczony z kosztu wydrukowanego zamiast części generycznej kosztu całkowitego (CR 702.66a/b, ruling KTK 2021-03-19 — `delveGenericMana` jako jedno źródło, strażnik sumy PRZED pierwszą mutacją, `producibleMana` w `castSpell`; wcześniej odrzucona komenda zostawiała karty grobu w exile), **C**: licznik „pierwszy instant/sorcery w turze" (Baral and Kari Zev, ruling TDC 2023-04-14) bez resetu przy zmianie tury — trigger raz na partię, **D**: gospodarza aury wracającej z grobu wybierał AUTOMAT zamiast gracza (CR 303.4f, ruling OTJ 2024-04-12) — decyzja `pendingAuraHost`/`resolve_aura_host` przeprowadzona przez siedem warstw (oferta, walidacja przy wykonaniu, `firstPendingDecision`, odcisk, widok, log/etykieta/grupowanie, oba boty); **pętla jakości**: 8 partii Żywym Testerem na `dist/` (8/8 naturalnie zakończonych, 0 zgłoszeń detektorów, `== NIEWYCENIONE == brak`) + dwa znaleziska z ręcznej lektury transkryptów (L27): Delve NIEMY na kaflu i w podglądzie (`cardInfo`/`renderCardPreview`/`rulesText`) oraz intro modalu w transkrypcie zlewające etykiety opcji (`modalIntroText` w narzędziu — artefakt pomiaru, L12); 20 mutacji (PA–PH, P1–P7, Q1–Q5) wykrytych; lekcja **L48 pkt 8** (nowy `pending*` ma siedem bramek do zmutowania); benchmark `--quick` 672 mecze / 0 niedokończonych, heuristic **85,9%** (bez regresji); budżet lektury 99 953/100 000; raport `docs/audits/AUDYT_PR130_2026-09-20.md`, plan: `docs/plans/PLAN_2026-09-20b-audyt-pr130-i-petla-jakosci.md`, handoff: [2026-09-20c](docs/setup/HANDOFF_2026-09-20c.md)); (sesja 2026-09-19b, PR #130 — batch 57 (kolekcja 64–125)**: 10 kart właściciela (artId 64, 66, 70, 77, 80, 82, 85, 88, 90, 125; Phyrexian Rager w DWÓCH drukach — DMU/75 i APC/85, zgłoszenie właściciela 15: istniejący wpis zostaje, nowy druk to osobny wpis katalogowy) — mechaniki: warunkowy flying z liczników, pipy hybrydowe `{G/U}` w rozkładzie landów generatora, inkubacja po wygnaniu celu, Delve (CR 702.66), powrót permanentu z grobu z wyborem gospodarza aury przed wejściem (CR 303.4f) i okno „play this turn", licznik „pierwszy instant/sorcery w turze" + darmowy rzut z ręki (bez kosztu many/pipów/phyrexianu, koszty dodatkowe płacone) i ścieżka „If you don't" → token First Mate Ragavan 2/1 z haste do końca tury; przy okazji domknięta luka generyczna: zdarzenia z WNĘTRZA komendy (tapnięcie przez ATAK) nie docierały do skanu triggerów (L153). Etapy B0a–B7 z commitem i pushem po każdym; talie generatorem (kaladesh 26/9/17 → 27/9/18), golden master bez zmian; pomiar quick-25: **5952/5952 mecze, 0 niedokończonych**, heuristic **86,7%** (5162/5952), aggro 24,4%, random 2,2%; lekcje **L153–L154**; plan: `docs/plans/PLAN_2026-09-19c-batch57-kolekcja-64-125.md`, handoff: [2026-09-19b](docs/setup/HANDOFF_2026-09-19b.md)); (sesja 2026-09-19, PR #130: audyt scalonego PR #129 (raport `docs/audits/AUDYT_PR129_2026-09-19.md`, 16 mutacji) — trzy znaleziska naprawione z pinami: F-1 `castFireball` niesie `xValue` w `spell_cast` (uwaga B1 działa dla każdego czaru X), F-2 pin reprezentanta max-X grupy tapX (od niego zależy sonda noop Żywego Testera), F-3 pin dedup logu zawężony do dokładnej postaci; **uwagi właściciela A/B/C**: A — wybory bez alternatywy automatyczne (Lodestone Needle z jedynym kandydatem rozstrzyga craft bez pytania, 0 kandydatów = no-op, 2+ = decyzja; jedno źródło wykonania `resolveCraftExileOutcome`), B — decyzja „cel wskazuje przeciwnik” nazywa kartę i efekt („Cuombajj Witches — 1 obrażenie (cel wskazuje przeciwnik)” w panelu i logu), C — tutor uszczupla własną bibliotekę, więc bot nie poświęca Dawntreader Elka po ląd przy 4 kartach biblioteki (`LIBRARY_SEARCH_EFFECTS` + `searchLibraryLoss` w drabinie `libraryLossPenalty`); **pętla jakości**: oferta bloków kompletna — bloker o 3 slotach dostaje w ofercie potrójny blok (cap tnie liczbę opcji, nie legalność), pełny diff katalog↔snapshot po 480 kartach wykrył literalne „\n” w `oracleText` 20 wpisów i w 7 snapshotach (naprawione po obu stronach, strażnik + licznik pominięć = 0 w strażniku kosztów aktywacji), Żywy Tester 5 partii bez `[STOP]` i 0 zgłoszeń detektorów; lekcje L150–L152; plan: `docs/plans/PLAN_2026-09-19-audyt-pr129-i-petla-jakosci.md`, handoff: [2026-09-19](docs/setup/HANDOFF_2026-09-19.md)); (**uwagi właściciela z testów 2026-09-18/19, PR #129**: C1/C2 — Merchant's Dockhand: kreator X (stepper 0–N + zaznacz dokładnie X artefaktów, X=0 legalne), przy jednej odsłanianej karcie efekt bierze ją automatycznie bez modala; D — pin regresyjny Malamet fight w buforze „Rozgrywka” (objaw nieodtwarzalny po M386); E — pin: bot nie atakuje lataczem w blokera z reach z aury bestow/grant EOT; Żywy Tester kaladesh s99: kreator tapX 3× E2E, 0 zgłoszeń; plan: `docs/plans/PLAN_2026-09-18d-uwagi-z-testow-dockhand-malamet-reach.md`, handoff: [2026-09-18d](docs/setup/HANDOFF_2026-09-18d.md); A — bot liczył detained/cantBlock stwory przeciwnika jako blokerów i nie atakuje (`untappedEnemyBlockers` czyta teraz centralne zakazy), B — Epic Experiment bez wyceny efektu padał za X=0 (teraz X>0 rośnie z maną, ogranicza go tylko dno biblioteki), B1 — wartość X rzucanego czaru w logu i warstwie „Rozgrywka”; plan: `docs/plans/PLAN_2026-09-18c-uwagi-z-testow-detain-atak-i-epic-experiment.md`, handoff: [2026-09-18c](docs/setup/HANDOFF_2026-09-18c.md)) (batch 56 ukończony, **10/10 kart** (artId 25–63) — energia {E} jako zasób gracza (`cost.energy`, „Pay {E}”), pojedynki usuwające (`exile_permanent` bez tranzytu przez grób; cel „artifact or land” + cycling), aury warunkowe (pomp/zakazy po podtypie czytane read-time; `tap_enchanted_permanent`), trigger ataku pojazdu („another target artifact or creature you control”) z crew 2, nowe zdarzenie drugiej fazy głównej z intervening-if i LKI, tokeny Goblin + ląd bliźniaczy; plan etapów: `docs/plans/PLAN_2026-09-17b-batch56-25-63.md`; **znaleziska właściciela A–J z gier testowych 2026-09-17c (etapy E1–E6, M369)**: stopka w strefie czytelnika, obraz tokenu Morph dla zakrytych permanentów, ilustracja tokenu Servo, etykiety decyzji i panel bez zdolności many, kontrola z chwili śmierci (LKI, lekcja L148), wymóg ataku a runda passów (Ramroller/goad), wycena exploita jako opłacalnej wymiany; plan: `docs/plans/PLAN_2026-09-17c-uwagi-wlasciciela-a-j.md`, handoff: [2026-09-17c](docs/setup/HANDOFF_2026-09-17c.md); **znalezisko L48 z E7 domknięte 2026-09-17d (M374, `55e0461`; dokumentacja z pozostawionego PR #127 wcielona do #126)**: grant lądu (Nature’s Embrace) płacił w fazie pipów „za 1”, a oferta obiecywała 2 — teraz płatność produkuje tyle, ile obiecała oferta, a nieudana płatność nie zostawia śladu (CR 601.2h); quick-25 (5 952 mecze, komenda z E7) przechodzi bez przerwania i bez powrotu seeda 2039 (0 niedokończonych; heuristic 87,1% w przebiegu sesji #126 i 87,0% w przebiegu #125); lekcja **L149**, plan: `docs/plans/PLAN_2026-09-17d-l48-grant-w-pipach.md`, handoff: [2026-09-17d (M374)](docs/setup/HANDOFF_2026-09-17d-m374-grant-w-pipach.md); znaleziska właściciela A–G wdrożone w PR #120; audyt PR #120 — APPROVE z zastrzeżeniami, PR #121 2026-09-15: naprawy F1 (wycena optional-trigger) i F2 (kreator many vs Powerstone), F3 sprzątanie, F4 cytaty CR, F5 domknięcie dokumentacji; port z równoległego audytu PR #122 (A4 okno Spare, O1 martwa gałąź, etykieta fire/skip; golden-master bit w bit zgodny z #122); Żywy Tester celowany w naprawy: Z1 Scholar — dobór z pustej biblioteki przegrywał na miejscu (draw_then_discard bez wyceny activate_ability), Z2 tokeny bez zdolności w rejestrze + niewidoczna restrykcja spendOnly — raport AUDYT_PR121_ZYWY_2026-09-15; audyt PR #121 — APPROVE, PR #123 2026-09-15: sprostowanie cytatów CR (G1 okno A4: podstawa CR 509.2 nie 510.1, G2 M172/C 509.4→509.2, G3 M221/E 4× 702.16c→702.16e; wyłącznie komentarze, raport AUDYT_PR121_2026-09-15; znalezisko A 2026-09-15 (ten sam PR): wymuszony discard całości bez modala — Reunion 2/2, koszty/efekty/sekwencje, madness w tej samej komendzie; lekcja L144; dźwięki czarów 2026-09-15 (ten sam PR): synteza Web Audio per typ, ikonki-toggle w belce, domyślnie dźwięki OFF / hi-gfx ON; 15g w tym samym PR: dźwięki per kolor 7×7, scryfall na warstwie bez KON, minima landów z pipów + regen 5 talii); **M359–M361 2026-09-16 (PR #123)**: odznaki regułowe Brąz/Srebro/Złoto — 15 błędów CR (M359 cleanup 514.3/514.3a + mentor/backup/delirium na stos 603.3; M360 Negate kontruje bestow-Aurę 702.103b, podtyp Aura w danych, dwa kroki obrażeń first/double strike 510.4+510.3, Station czyta LKI, ninjutsu w end_of_combat; M361 exploit źródłem własnym, Talion's Messenger 2 triggery, land drop z exile 701.18a/b, speed przy utracie życia, modalne cele przy rezolucji 608.2b); **audyt PR #123 — APPROVE z zastrzeżeniami** (raport AUDYT_PR123_2026-09-16), **PR #124 2026-09-16**: naprawa A1 — SBA wykonane w cleanupie otwierają priorytet (CR 514.3a dosłownie, dowody SBA w strumieniu zdarzeń), naprawa A2 — pendingCombatSecondPass trafia do odcisku stanu (L16/M323-F3), E3/O5 — 24 sprostowania kontekstu cytatów 702.16 po pełnym przeglądzie przeciw literalnemu CR 2026-08-07). Pełny zestaw: **5656/5656** (0 fail); bot-benchmark **10/10** (macierz w budżecie). Dopisek 3 (zlecenie właściciela): numeracja kopii nazw na polu bitwy — „Island #1, Island #2" na kaflu, w modalach i etykietach (strażnik unikalności + mutacja L13). Dopisek (ta sama sesja, zlecenie właściciela): domknięcie wszystkich obserwacji audytów #123 i #121 — O1 landSplit (jawny błąd zamiast NaN), O2 strażnik L16 engine-wide, O1–O4 z #121 (kreator many fail-closed, pełna tablica efektów may-trigger w widoku i wycenie F1, dokładne zbiory tokenów, badge mechanikowy). Dopisek 2 (ta sama sesja, znaleziska właściciela z testów): A1 tytuł wyboru koloru purpose-aware („produkcja many", nie „np. ochrona"), A2 badge „Wybrany kolor: Czarny" na karcie, A3 aktywacja Manor Gate produkuje i obiecuje {G} LUB wybrany kolor (union w effects.js + etykieta), B „The Undercity" wielką literą (nazwy wirtualnych kart w mapie sesji). **Audyt PR #124 — APPROVE bez nowych błędów** (raport AUDYT_PR124_2026-09-17; sondy mutacyjne potwierdziły, że strażniki A1/A2 realnie czerwienieją), **PR #125 2026-09-17**: O1 audytu — numeracja kopii nazw grupuje po nazwie WYŚWIETLANEJ (`battlefieldNameNumbers(objects, displayedNameOf)`; dwa wydruki jednego permanentu numerują się jak kopie, test sesyjny na klonie rejestru), E3 pętla jakości — Żywy Tester domyka warstwę wysoko-graficzną (`art-showcase` pauzuje grę przez `awaitingArtAck`), która kończyła partie fałszywym `[STOP]` i fałszywym detektorem „sam Poddaj partię" (luka narzędzia odtworzona na #123 i #124; po naprawie 4 partie po 400 kroków kończą się naturalnie, 0 zgłoszeń); **batch 56 2026-09-17b (ten sam PR)**: pomiar quick 25 talii wyłapał CZTERY bugi silnika — regeneracja blokowanego atakującego kasowała klucz `combat.blockers` (`3f4986f`), auto-tap zjadał jednostkę odłożoną na pip płatności (`51e5bef`, lekcja L147), kasowanie tokenu nie odpinało załączników living weapon (`038cc50`), oferta celów zdolności omijała wspólne źródło kandydatów i proponowała cudzy hexproof (`3453593`, kotwica L48); każdy zamknięty u root cause z pinem czerwieniejącym bez fixa, a detektor Żywego Testera przestał zgłaszać echo logu (`48087d5`) — 10 partii na taliach z nowymi kartami bez zgłoszeń. Integracja i znane uwagi jakościowe: [handoff 2026-09-17b](docs/setup/HANDOFF_2026-09-17b.md). **Sesja 2026-09-17d (PR #126)**: audyt scalonego PR #125 (`docs/audits/AUDYT_PR125_2026-09-17.md`, werdykt APPROVE — jedyne znalezisko F1 `effectTargets` w `get_energy` naprawione pinem M375) i domknięcie pomiaru quick 25 talii po naprawie `M374/1` — **5952/5952 meczów, 0 niedokończonych**, bez powrotu `illegal_spell` seeda 2039, heuristic **87,1%** (5183/5952; referencja 86,0%), aggro 23,5%, random 2,3%; pętla jakości Żywym Testerem dała dwa znaleziska z pinami: **M376** (aktywacja pompy musi poprawić wymianę — kopie na stosie wchodzą do wyceny) i **M377** (martwe okno detektora testera musi się powtarzać), a E5 potwierdził zgodność ścieżek `{E}`/CR 122, `beginning_of_second_main`/CR 603.4 i LKI kontroli przy śmierci (CR 603.10a) — `tools/family-audit.mjs` i `tools/event-contract-audit.mjs` bez naruszeń; E7 (dopisek): do PR wcielono zaległą dokumentację M374 z pozostawionego PR #127 (lekcja L149, plan F1–F4, handoff `2026-09-17d-m374`) — #127 zamknięty bez scalania. Szczegóły:
[docs/ENGINE_MILESTONES.md](docs/ENGINE_MILESTONES.md) i [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md).

```bash
npm test          # szybki rdzeń (node tools/run-tests.mjs fast)
npm run test:all  # pełna brama PR, łącznie z regresją bota
npm run build     # skleja moduły w jeden plik HTML (dist/mtg-table.html)
```

### Jak zagrać

- **Przez adres URL:** artefakt publikuje się automatycznie na GitHub Pages po scaleniu
  do `main` (workflow `pages.yml`) — wejdź na adres strony z dowolnego urządzenia.
- **Z pobranego pliku:** uruchom `npm run build` i otwórz `dist/mtg-table.html`
  bezpośrednio w przeglądarce (moduły są sklejone, więc działa też z `file://`,
  np. na iPadzie — ADR 0011).

Na stronie wybierz seed i talie (są wstrzyknięte z katalogu `decks/`), naciśnij
„Rozpocznij partię" i graj przyciskami akcji: sesja sama rozgrywa ruchy bota
i przewija okna, w których masz do wyboru wyłącznie pass. Zapis partii (seed + komendy)
eksportujesz do pliku i importujesz w celu weryfikacji — replay odtwarza partię
komenda po komendzie.

Aktualny stan i rzeczy otwarte: **najnowszy [handoff sesji](docs/setup/)** oraz ostatni PR.
Dziennik przebiegu prac (historia sesji): [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md).

## Cel

System ma rozdzielać cztery odpowiedzialności:

1. **Engine** — autorytatywny stan gry, reguły, legalność działań, stos, priorytet, combat i efekty.
2. **Cards** — definicje obsługiwanych kart oraz mechaniki wielokrotnego użytku.
3. **Controllers** — ten sam interfejs decyzji dla człowieka, bota deterministycznego, bota przeszukującego i opcjonalnego agenta LLM.
4. **Game Table** — interfejs prezentujący dozwolony widok gry i wysyłający intencje, bez samodzielnego rozstrzygania reguł.

Najważniejsza granica systemu:

```text
kontroler → legalna intencja/wybór → engine → zdarzenia i nowy widok → UI
```

Kontroler ani UI nie modyfikują bezpośrednio autorytatywnego stanu.

## Zakres projektu

- obecny docelowy katalog właściciela to około 400 kart;
- karty będą implementowane pojedynczo lub małymi partiami;
- pierwsze testowe rozgrywki powinny być możliwe po obsłużeniu około 20 odpowiednio dobranych kart;
- każda obsługiwana karta musi mieć jawny status i testy;
- ukryte informacje mają być filtrowane zgodnie z zasadami MtG (Fog of War);
- początkowym przeciwnikiem będzie bot algorytmiczny; LLM pozostaje opcjonalnym kontrolerem na później.

## Dokumentacja

- [Karta projektu i zakres](docs/PRODUCT.md)
- [Docelowa architektura](docs/ARCHITECTURE.md)
- [Audyt istniejącej aplikacji](docs/AUDIT_LEGACY_APP.md)
- [Roadmapa](docs/ROADMAP.md)
- [Historia projektu (dziennik sesji)](docs/PROJECT_HISTORY.md)
- [Rejestr decyzji architektonicznych](docs/decisions/README.md)
- [Zasady współpracy](CONTRIBUTING.md)
- [Workflow pracy w repozytorium](docs/WORKFLOW.md)
- [Polityka bezpieczeństwa](SECURITY.md)
- [Instrukcja dla agentów](AGENTS.md)

## Talie

Talie **buduje generator** `tools/generate-plan-decks.mjs` (źródło prawdy
przydziału karty do talii); `test/repo-decks.test.js` pilnuje zgodności plików
w `decks/` z generatorem. Zasady: talie per PLAN
([ADR 0023](docs/decisions/0023-decks-per-plan-and-benchmark-sample.md)),
obowiązkowy podział kolorystyczny talii ≥30 kart nielandowych
([ADR 0024](docs/decisions/0024-deck-split-by-colors-and-rotating-benchmark.md)).
Zasady nadrzędne: singleton (1× karta poza basic-landami), basic-lądy ~2:1 do
reszty, min. 15 kart nielandowych na talię.

**Ta lista jest aktualizowana przy każdej zmianie zestawu talii** (liczności
liczone z plików `decks/*.txt`).

### Talie jednoplanowe

| Plik | Nazwa | Kolory | Kart łącznie | w tym basic-lądy | nielandowych |
|---|---|---|---:|---:|---:|
| `alara` | Alara | WUBRG | 38 | 13 | 25 |
| `dominaria-brg` | Dominaria (BRG) | BRG | 27 | 9 | 18 |
| `dominaria-wu` | Dominaria (WU) | WUB | 23 | 8 | 15 |
| `final-fantasy` | Final Fantasy | WUBRG | 26 | 9 | 17 |
| `forgotten-realms` | Forgotten Realms | WUBRG | 36 | 12 | 24 |
| `innistrad-brg` | Innistrad (BRG) | BRG | 29 | 10 | 19 |
| `innistrad-wu` | Innistrad (WU) | WU | 29 | 10 | 19 |
| `ixalan` | Ixalan | UBRG | 23 | 8 | 15 |
| `kaladesh` | Kaladesh | WUBRG | 27 | 9 | 18 |
| `mirrodin-brg` | Mirrodin (BRG) | BRG | 32 | 11 | 21 |
| `mirrodin-wu` | Mirrodin (WU) | WU | 26 | 9 | 17 |
| `ravnica` | Ravnica | WUBRG | 38 | 13 | 25 |
| `srodziemie` | Śródziemie | WUBRG | 32 | 11 | 21 |
| `tarkir-bg` | Tarkir (BG) | UBG | 35 | 12 | 23 |
| `tarkir-wur` | Tarkir (WUR) | WUR | 32 | 11 | 21 |
| `theros` | Theros | WUBRG | 26 | 9 | 17 |
| `warhammer-ubr` | Warhammer Fantasy (UBR) | UBR | 35 | 12 | 23 |
| `warhammer-wg` | Warhammer Fantasy (WG) | WG | 26 | 9 | 17 |
| `wiedzmin-bg` | Wiedźmin (BG) | BG | 27 | 9 | 18 |
| `wiedzmin-wur` | Wiedźmin (WUR) | WUR | 26 | 9 | 17 |
| `zendikar` | Zendikar | WURG | 35 | 12 | 23 |

### Worki (małe plany — przejściowe, ADR 0023)

| Plik | Nazwa | Kolory | Kart łącznie | w tym basic-lądy | nielandowych |
|---|---|---|---:|---:|---:|
| `worek-basni` | Worek: Baśnie | WUBRG | 38 | 13 | 25 |
| `worek-dziki` | Worek: Dzikie Światy | WUBRG | 30 | 10 | 20 |
| `worek-legend` | Worek: Legendy | WUBRG | 23 | 8 | 15 |
| `worek-mroczny` | Worek: Mroczne Światy | WUBRG | 27 | 9 | 18 |

Szczegóły formatu i manabazy: [`decks/README.md`](decks/README.md).

## Jak wprowadzamy zmiany

Gałąź `main` jest chroniona. Każda zmiana — także dokumentacyjna i także wykonana przez agenta —
trafia do `main` wyłącznie przez Pull Request:

- bezpośredni push i force push do `main` są zabronione, bypass list jest pusta;
- wymagane approvals: 0, ale wszystkie komentarze w PR muszą być rozwiązane;
- scalanie wykonuje właściciel świadomą decyzją, metodą `Squash and merge`;
- required status checks włączymy po zbudowaniu stabilnego CI.

Prosta instrukcja krok po kroku: **[docs/WORKFLOW.md](docs/WORKFLOW.md)**.
Uzasadnienie: [ADR 0007](docs/decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Stos technologiczny i uruchamianie

Czysty JavaScript w standardzie ES Modules, bez bibliotek i bez bundlera. Testy uruchamia
wbudowany `node --test`, kontrakty opisuje JSDoc, a pilnują ich testy inwariantów.

Źródła są modularne, ale **do grania dostarczamy jeden plik HTML** generowany automatycznie
przez CI. Powód: moduły ES nie działają po otwarciu pliku z dysku (`file://`), a właściciel
gra na iPadzie, gdzie nie da się uruchomić lokalnego serwera.

| Tryb | Jak uruchomić | Ilustracje |
|---|---|---|
| Online | wejście na adres GitHub Pages | Scryfall |
| Lokalnie | otwarcie pobranego pliku HTML | własne z `./img/`, fallback Scryfall |

Reguły, talie i przebieg partii są w obu trybach identyczne. **Właściciel nie instaluje
ani nie buduje niczego** — sklejaniem zajmuje się CI.

Uzasadnienie i lista świadomych kompromisów:
[ADR 0011](docs/decisions/0011-modular-sources-single-file-artifact.md)
oraz [ADR 0008](docs/decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona, ale
jej sekcja o kompromisach JavaScriptu nadal obowiązuje).

## Uruchomienie

```bash
npm test      # testy jednostkowe (node --test, bez zależności)
npm run build # sklejenie modułów -> dist/mtg-table.html
```

Zbudowany plik otwiera się dwuklikiem — także na iPadzie i iPhonie, bez serwera.

> **Konfiguracja publikacji:** włączenie CI i GitHub Pages wymaga uprawnień właściciela
> (agent nie ma `workflows` ani `pages`). Instrukcja: [docs/setup/URLOP_CHECKLISTA.md](docs/setup/URLOP_CHECKLISTA.md).

## Najbliższy etap

Etapy 1–5 zamknięte, Etap 2/3 przekroczony (492 wspierane karty realne + 8 tylnych stron
kart dwustronnych, poza taliami (status `back`) + 43 tokeny (status `token`) >> docelowe ~20), Etap 4 bota
zamknięty (heurystyka + modelowanie, harness B0, tune-bot), Etap 5 stołu zamknięty
(gra człowiek–bot na iPadzie przez Pages / file://).

Kolejne kroki:
1. **Kolejna lista kart od właściciela** — katalog nie rośnie bez niej (ADR 0029); numer nowego batcha wynika z aktualnego stanu projektu.
2. Dalsze czyszczenie luk MtG z listy właściciela — każda karta 100% Oracle albo niewspierana (ADR 0022), bez specjalnych przypadków po nazwie (ADR 0002).
3. Strojenie bota pod nowe mechaniki (Adventure/Kicker/Crew) i pętla jakości (Żywy Tester / zgodność CR); pełna macierz B0 tylko na komendę właściciela (ADR 0018).

Szczegóły kolejki i blokery: [docs/ROADMAP.md](docs/ROADMAP.md), najnowszy handoff sesji.

## Legacy `card_viewer_12_10_for_Github.html` — usunięty (2026-09-23, M418)

Zamrożony snapshot aplikacji właściciela służył wyłącznie jako materiał audytowy
([ADR 0009](docs/decisions/0009-standalone-game-table-instead-of-extraction.md))
i **został usunięty z repozytorium** decyzją właściciela (kopię ma u siebie).
Zapis rozpoznania zostaje w [docs/AUDIT_LEGACY_APP.md](docs/AUDIT_LEGACY_APP.md) —
fakty o starej aplikacji (liczby linii, pułapki, przepływy) nadal cytowane w lekcjach
i ADR-ach, ale sam plik nie jest już częścią repozytorium ani żadnego testu.

## Ważna uwaga o nazwie i materiałach

To nieoficjalny projekt hobbystyczny, niezwiązany z Wizards of the Coast. Magic: The Gathering i nazwy kart należą do ich odpowiednich właścicieli. Przed dodaniem dużej bazy danych lub grafik kart należy ustalić sposób ich przechowywania i status licencyjny; nie należy umieszczać ciężkich zasobów w Git bez uzgodnienia.
