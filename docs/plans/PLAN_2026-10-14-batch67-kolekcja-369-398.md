# Plan — Batch 67: kolekcja 369–398, 10 kart (zgłoszenie właściciela 2026-10-14)

Zadanie: dodać dokładne druki 369ELD, 371WAR, 378PIP, 380DTK, 390BRO,
391ELD, 392MBS, 394ALA, 397SOS, 398EOE wraz z planami świata (kolumna „Plan"
właściciela — **wiążąca, przepisywana 1:1**), grafikami, testami negatywnymi,
kolekcją oraz pełnymi bramami. Źródło reguł: snapshoty Scryfalla pobrane
2026-10-14 (ADR 0010 §2a) + `.arena/cr-raw.txt` (mirror `nwgarne/mtg-data`,
commit `3257633`, CR 2026-09-25).

## Zakres kart (druk + plan właściciela)

| artId | karta / druk | koszt, typ, P/T | Plan | mechanika |
|---:|---|---|---|---|
| 369 | Improbable Alliance — ELD #193 | `{U}{R}`, Enchantment | Eldraine | „second card each turn" → token 1/1 Faerie flying; `{4}{U}{R}`: dobierz, odrzuć |
| 371 | Spellkeeper Weird — WAR #69 | `{2}{U}`, Creature — Weird, 1/4 | Ravnica | `{2},{T},Poświęć:` zwróć wybrany instant/sorcery z własnego grobu do ręki |
| 378 | Sentry Bot — PIP #24 | `{4}{W}`, Artifact Creature — Robot, 2/5 | Star Wars | flash; taniej o `{1}` za każde atakujące nas stworzenie; ETB energia za każde; początek walki: opcjonalna opłata `{E}{E}{E}` → +1/+1 wszystkim naszym stworom |
| 380 | Artful Maneuver — DTK #4 | `{1}{W}`, Instant | Tarkir | +2/+2 do końca tury; Rebound |
| 390 | Battlefield Butcher — BRO #86 | `{2}{B}`, Creature — Human Soldier, 1/4 | Wiedźmin | `{5},{T}`: każdy przeciwnik traci 2 życia; koszt mniejszy o `{1}` za każde stworzenie w naszym grobie |
| 391 | Wolf's Quarry — ELD #184 | `{4}{G}{G}`, Sorcery | Eldraine | trzy tokeny 1/1 Boar z „gdy ten token umiera, stwórz Food" |
| 392 | Kuldotha Ringleader — MBS #70 | `{4}{R}`, Creature — Giant Berserker, 4/4 | Mirrodin | Battle cry; atakuje w każdej walce, jeśli może |
| 394 | Cancel — ALA #33 | `{1}{U}{U}`, Instant | Amonkhet | Kontr cel czar |
| 397 | Render Speechless — SOS #220 | `{2}{W}{B}`, Sorcery | Arcavios | wróg odsłania rękę, wybieramy nie-ląd → odrzuca; dwa +1/+1 na „up to one target creature" |
| 398 | Intrepid Tenderfoot — EOE #193 | `{1}{G}`, Creature — Insect Citizen, 2/2 | The Edge | `{3}`: +1/+1 na sobie, tylko jak sorcery |

## Rozpoznanie mechanik (stan silnika przed kodem)

- **Istnieje i wystarcza:** `you_draw_second_card_each_turn` (Jolrael, MKC),
  `create_token` + `token_food`, `get_energy` i koszt `{E}` w kosztach
  zdolności (Batch 56), `counter_spell`, `rebound: true` na zdolności,
  `mustAttack: true` (createAbility), `costReduction` na zdolności
  aktywowanej, wzorzec „reveals their hand → wybór nie-lądu → discard"
  (4 karty w katalogu), wzorzec „return target instant or sorcery card from
  your graveyard to your hand", cel „up to one target".
- **Do dodania (generycznie, ADR 0002):**
  1. token **Faerie 1/1 U flying** (tokeny są wyjątkiem ADR 0029 pkt 2),
  2. token **Boar 1/1 G** z triggerem `dies` → `create_token` Food,
  3. keyword **Battle cry** (CR 702.90: atak → każde inne atakujące stworzenie +1/+0 do końca tury),
  4. warunek redukcji kosztu **za kartę-stwora w grobie** (Battlefield Butcher; rozszerzenie `costReduction.condition`),
  5. redukcja kosztu **rzutu** za liczbę atakujących nas stworzeń + opcjonalna
     opłata energii na początku walki (Sentry Bot) — o ile nie pokrywa tego
     istniejący deskryptor; rozpoznanie w E6.

## Etapy (jeden etap = jeden zielony commit + push, ADR 0020)

- **E0 — snapshoty Scryfall + rulingi (10 kart).** `docs/cards/scryfall-*.json`
  z jednego pobrania na druk (`set=`), rulingi osobno. Bramka: JSON parsuje,
  `set` zgadza się z adresem obrazu. *(wykonane)*
- **E0b — ten plan** jako osobny commit (T0).
- **E1 — fala A: karty na istniejących mechanikach.** Cancel, Artful Maneuver
  (rebound), Intrepid Tenderfoot, Spellkeeper Weird, Render Speechless.
  Dane + `test/real-cards-batch67.test.js` (RED → GREEN), po jednym scenariuszu
  legalnym i nielegalnym na kartę.
- **E2 — fala B: Improbable Alliance.** Token Faerie + trigger drugiej karty.
- **E3 — fala C: Wolf's Quarry.** Token Boar z triggerem śmierci → Food.
- **E4 — fala D: Kuldotha Ringleader.** Keyword Battle cry + przymus ataku.
- **E5 — fala E: Battlefield Butcher.** Warunek `perCreatureCardInGraveyard`
  w `costReduction` + „każdy przeciwnik traci 2 życia" ( istniejący deskryptor
  albo nowy typ efektu — rozpoznanie na wejściu etapu).
- **E6 — fala F: Sentry Bot.** Energia + redukcja kosztu rzutu + opcjonalna
  opłata `{E}{E}{E}` na początku walki.
- **E7 — raport talii.** Generator i README idą już z KAŻDĄ falą (patrz nota
  E1 niżej), więc E7 = **raport: do jakich talii trafiła każda karta**
  (odpowiedź dla właściciela) + domknięcie opisów.
- **CSV idzie RAZEM z każdą falą** (nie w E7): strażnik
  `test/proweniencja-katalogu.test.js` (ADR 0029 §4) wymaga, by każda
  taliowalna karta katalogu miała `artId` z `tools/collection-art-ids.csv`
  oraz zgodną nazwę i plan — więc wiersz kolekcji i definicja muszą wejść
  w tym samym etapie (inaczej brama jest czerwona).
- **NOTA E1 (2026-10-14) — czego plan nie przewidział (bramy `all`):** fala,
  która dokłada WSPIERANE karty, rusza pięć strażników poza zestawem „dane
  katalogu”, więc każda fala musi domknąć je w swoim commicie:
  1. `test/repo-decks.test.js` (M178 + M33+): karta musi być w talii ⇒
     `node tools/generate-plan-decks.mjs` **w każdej fali** (generator sam
     przelicza też podstawowe lądy pod pipy — nie korygować ręcznie);
  2. `test/m203-talie-testera-i-dokumentacji.test.js` (M203/7): liczności
     talii w `README.md` muszą zgadzać się z `decks/*.txt` — po generatorze
     policzyć i podmienić tylko zmienione wiersze;
  3. `test/bot-scoring-snapshot.test.js` (golden-master): zmiana zawartości
     talii zmienia ślady partii ⇒ `node tools/bot-scoring-snapshot.mjs --write`
     (dowód przed zapisem: ze starą talią fixture odtwarza się bit w bit);
  4. `test/art-ids-tool.test.js`: piny liczby pozycji słownika
     (583→588, 580→585) i liczby kart z `artId`;
  5. `test/m138-audyt-stolu.test.js` (Z5) + `test/m255-petla-jakosci.test.js`
     (C1) + `test/cr-numery-istnienie-straznik.test.js`: nowa specyfikacja celu
     z parametrem wymaga gałęzi w `targetTypeLabel`, nowy typ efektu zdolności
     aktywowanej — wpisu w `ABILITY_EFFECT_LABELS`, a cytat CR musi istnieć
     w zweryfikowanej tabeli (kontr to **701.6/701.6a**, nie 701.5 = Cast).
- **E8 — dokumentacja i bramy końcowe.** `ENGINE_MILESTONES.md`,
  `PROJECT_HISTORY.md`, status tego planu; bramy: batch 67, `npm test`,
  `run-tests.mjs all`, build, `check-card-printings`, `git diff --check`;
  pętla jakości (ADR 0021) na kartach z nowymi mechanikami.

## Polityka zatrzymania (polecenie właściciela)

Po każdym etapie commit + push. Gdy kończy się kontekst — zatrzymanie
z raportem: które etapy zamknięte, co zostało, jakie talie zmienione.
Następna sesja kontynuuje od pierwszego niezamkniętego etapu.

## Ryzyka i uwagi

- Pole `Plan` jest wiążące także dla nowych planów („Star Wars", „The Edge");
  generator talii rozstrzyga, do jakiej talii trafia karta — **nie korygować**.
- Pełnego B0 nie uruchamiamy (ADR 0018); benchmark tylko szybki, gdy zmienia
  się bot (ten batch bot zmieniać nie powinien — jeśli zmieni, wynik w raporcie).
- Tokeny to jedyny dozwolony wyjątek od „katalog rośnie tylko z batchy"
  (ADR 0029 pkt 2) — tokeny Faerie/Boar bez `artId`.
- Karty dodajemy wyłącznie z tego batcha; brak nośnika mechaniki w kolekcji
  = karta synteretyczna w teście (ADR 0029 pkt 3).

## Raport talii (E7, 2026-10-14) — do jakich talii trafiła każda karta

Wynik generatora `tools/generate-plan-decks.mjs` (plan jest wiążący; przy
nowych planach „Star Wars" i „The Edge" to generator rozstrzyga talię,
a nie autor karty — plan nie był korygowany). Sprawdzone skryptem
`.arena/raport-talii-b67.mjs` (odczyt `decks/*.txt` po nazwie karty):

| artId | karta (druk) | Plan (właściciel) | Talia docelowa | Zmiana liczności |
|---:|---|---|---|---|
| 369 | Improbable Alliance (ELD) | Eldraine | `eldraine.txt` | +1 |
| 371 | Spellkeeper Weird (WAR) | Ravnica | `ravnica.txt` | +1 |
| 378 | Sentry Bot (PIP) | Star Wars | `worek-basni.txt` (Worek: Baśnie) | 29→30 kart (10 basic-lądów, 20 pozostałych) |
| 380 | Artful Maneuver (DTK) | Tarkir | `tarkir-wur.txt` (Tarkir WUR) | +1 (Plains 4→5, Island 4→3) |
| 390 | Battlefield Butcher (BRO) | Wiedźmin | `wiedzmin-bg.txt` (Wiedźmin BG) | 30→32 (11 lądów, 21 pozostałych; Swamp 6, Forest 5) |
| 391 | Wolf's Quarry (ELD) | Eldraine | `eldraine.txt` | 26→27 (9 lądów, 18 pozostałych) |
| 392 | Kuldotha Ringleader (MBS) | Mirrodin | `mirrodin-brg.txt` (Mirrodin BRG) | 35→36 (12 lądów, 24 pozostałe) |
| 394 | Cancel (ALA) | Amonkhet | `worek-mroczny.txt` (Worek: Mroczne Światy) | +1 (Plains 3→2, Mountain 2→3) |
| 397 | Render Speechless (SOS) | Arcavios | `worek-legend.txt` (Worek: Legendy) | +1 (Plains 2→3) |
| 398 | Intrepid Tenderfoot (EOE) | The Edge | `the-edge.txt` | +1 (Island 1→2, Mountain 3→2) |

Nowy plan „Star Wars" (jedna karta, próg awansu 15 daleko) dostał worek
według ADR 0023 §4 — motyw + najmniejsza talia: `worek-basni` (19 kart
nie-basic przed dodaniem) z cyberpunkową Kamigawą („Neon Dynasty") jako
najbliższym motywem dla droidów, energii i artefaktów.

## Status etapów

- E0 — snapshoty Scryfall + rulingi: **zamknięte** (`f14706d`).
- E0b — plan: **zamknięte**.
- E1 — fala A (Cancel, Artful Maneuver, Intrepid Tenderfoot, Spellkeeper
  Weird, Render Speechless): **zamknięte** (`9b271a8`).
- E2 — fala B (Improbable Alliance): **zamknięte** (`d805c56`).
- E3 — fala C (Wolf's Quarry): **zamknięte** (`71c73a6`).
- E4 — fala D (Kuldotha Ringleader): **zamknięte** (`1db9819`).
- E5 — fala E (Battlefield Butcher): **zamknięte** (`58922b3`).
- E6 — fala F (Sentry Bot): **zamknięte** (`674c26d`).
- E7 — raport talii: **zamknięte** (ten rozdział).
- E8 — dokumentacja i pętla jakości + bramy końcowe: **zamknięte**
  (`ENGINE_MILESTONES.md` M444, `PROJECT_HISTORY.md` 2026-10-14; 15 partii
  Żywym Testerem bez zgłoszeń detektorów, naprawione dwa kłamstwa kafelka —
  cena `{E}×3` i dynamiczna kwota energii; bramy końcowe: batch 67 42/42,
  fast 8192/8192, all 8458/8458, build 74 moduły / 5146,1 kB,
  `check-card-printings` rc=0, `git diff --check` czysty, benchmark szybki
  90,6%).
