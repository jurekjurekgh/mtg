# PLAN 2026-09-06 (sesja 01a078a2) — audyt PR #102 + pętla jakości

Sesja: gałąź `arena/01a078a2-mtg`, 1 sesja = 1 gałąź = 1 PR (ADR 0013/0020).
Start: `main` = `dfbc39f` (squash merge PR #102, 46 plików w PR, diff silnikowy
`git diff 6ce4cab dfbc39f` = 44 pliki, +3388/−84), `npm test` **4567/4567**
(zmierzone na starcie), `npm run build` 59 modułów / 3344,7 kB (zmierzone).

## Zakres

1. **Audyt poprzedniego PR (ADR 0020 B)** — PR #102 „Batch M309–M321: kreator
   pozycyjny, station scoring, Veiled Ascension/cloak, etykiety, triki bota\" →
   wynik w `docs/audits/AUDYT_PR102_2026-09-06.md`, naprawy u root cause.
2. **Pętla jakości (ADR 0021 4)** — Żywy Tester na ścieżce innej niż PR #100–#102
   + polowanie na niezgodność z CR inną metodą niż w poprzednich sesjach.
3. **Bez nowych kart** (ADR 0021 4c, ADR 0029) — tam, gdzie trzeba karty-sondy,
   wchodzi karta syntetyczna w pliku testu. Pełny B0 tylko na jawną komendę
   właściciela (ADR 0018/0025).

## Etapy (kolejność commitów)

### E1. Audyt PR #102 → `docs/audits/AUDYT_PR102_2026-09-06.md`
Kryterium: każdy zmieniony plik źródłowy diffu `6ce4cab..dfbc39f` przeczytany;
każde znalezisko ma cytowany tekst Oracle/ruling albo wynik sondy (L13:
udowodnione mutacją, nie opisem); nie-narzeczenia zapisane z dowodem, żeby
nikt ich nie powtarzał. Wynik: 10 znalezisk (F0, F1–F8, F6b) + 6 zamkniętych tropów (Z1–Z6) — patrz
`docs/audits/AUDYT_PR102_2026-09-06.md`. UWAGA o literach: plan używał par
F1=pump/F2=ward, a realizacja (i commity) odwróciły je lokalami (F1=rodzina
wardu, F2=model pumpu), bo kolejność napraw szła wg ryzyka; WIĄŻĄCE są litery
z audytu i z commitów. Do planu doszły w trakcie trzy znaleziska: F0 i F9
(cloak a zdolności karty / punkt zbierający — z sondującej lektury `effects.js`)
oraz F6b (log stołu — z Żywego Testera).

### E2. Naprawy potwierdzonych znalezisk — jeden fix = jeden commit
Kryterium: po każdym commicie `npm test` + `npm run build`; fix u root cause,
bez maskowania (ADR 0016); test RED przed naprawą (L13).

- [x] F2 w literach audytu (bot, rodzina M317; commit **M325**
      `5e7bd75`; pin ŹRÓDŁOWY `test/m325-bot-pump-rodzina.test.js`, dryf
      Zero mierzony benchmarkiem `--quick`): widoczny pump blokerza liczony w dwóch
      bliźniaczych miejscach ze statami SUROWYMI (wyliczenie first-strike
      z trikiem deathtouch, gałąź stwora pożyczonego).
- [x] F1 w literach audytu (bot, rodzina M320; commit **M324** `05faae5`,
      `test/m324-bot-ward-rodzina.test.js`): podatek ward tylko dla 8 typów komend; okna
      darmowego rzutu (`resolve_*_cast`) i `cast_adventure_creature` rzucają
      czar z celem → silnik odpala ward, bot nie. Zestaw typów ma być
      WYPROWADZONY z `COMMAND_TYPES`, nie wyliczany ręcznie.
- [x] F3 (engine, fingerprint; commit **M324** `05faae5` — wjechał tam razem
      z F1 przez `git add -A`, opisane w audycie §4; `test/m323-cloak-odcisk.test.js`):
      `cloakReady` i `ward` poza odciskiem stanu —
      dwa stany różniące się tylko nimi mają identyczny fingerprint (sonda
      „oferta bez skutku\" ślepa, replay ich nie odróżnia).
- [x] F4 + F0 + F9 (engine; commit **M322** `85b736c`,
      `test/m322-cloak-zdolnosci.test.js`): źródło przywracania warda — `faceDownOriginal` nie niesie
      `ward`, więc uncover kasuje go twardym `ward: null` — poprawny wynik
      z niepoprawnego źródła (klasa L104; karta z drukowanym wardem
      straciłaby go po odsłonięciu).
- [x] F5 (narzędzie + snapshot, ADR 0028; commity **M328** `76af12b` i
      **M329** `a4e0eb5` + **M332** `76aa5c9` za cytowania w testach;
      `test/m328-narzedzie-rulingi.test.js`): `tools/fetch-card-rulings.mjs`
      tryb CLI pada (`files is not defined`), a zachowanie cloaku jest
      przypięte do rulingów WotC, których snapshot `veiled-ascension` nie
      niesie.
- [x] F6 + F6b (widok/etykiety, zgodność z rulingiem; commity **M326**
      `e2f3c7a` i **M331** `ab8ceb1`, `test/m326-cloak-przyczyna.test.js` +
      `test/m331-log-przyczyna.test.js`): M319 schował PRZYCZYNĘ
      zakrycia razem z faktem „karta jest stworem\" — przeciwnik czyta
      „(Morph)\" o cloaku, czyli kłamliwą etykietę; ruling WotC wymaga,
      żeby przyczyna zakrycia była rozpoznawalna dla wszystkich.
- [x] F7 (stół, kreator many; commit **M327** `182efb1`,
      `test/m327-wizard-odsloniecie.test.js`): uncover (cloak/manifest) prowadzi przez
      `spendMana` z pipami kolorów, a nie ma deskryptora w kreatorze —
      silnik sam wybiera źródła (klasa M34/M202O).

### E3. Pętla jakości na ścieżce innej niż PR #100–#102 ✓
Kryterium: min. 3 zakończone partie Żywego Testera bez zgłoszeń detektorów,
talie spoza pary użytej w #101; na koniec `test/bot-benchmark.test.js`.
Wynik: 6 ukończonych partii (pary ravnica/tarkir-wur, kaladesh/ravnica,
theros/worek-basni, ravnica/mirrodin-wu + dwie na talii chwilowej
`audyt-cloak`), 0 zgłoszeń detektorów, transkrypty w
`tools/table-tester/audyt-pr103/` (gitignorowane). Partie 5–6 DAŁY nową
znalezione F6b (etykieta w logu + numeracja zakryć lądów) — to jest dokładnie
ten zwrot, dla którego pętla istnieje. Bramki bota: `--quick` bez dryfu
(84,8% = 570/672, jak baza), `test/bot-benchmark.test.js` 10/10,
golden-master bez regeneracji. Uwaga o środowisku: `dist/` i
`tools/table-tester/node_modules` NIE są w snapshotach piaskownicy, więc przed
testerem trzeba `npm run build` + `npm i` w katalogu narzędzia.

### E4. Zamknięcie sesji ✓
`docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-07a.md` (data realna
sesji, nie planowana `06h`), treść PR #103 (REST, ciało przez
`gh api -X PATCH repos/jurekjurekgh/mtg/pulls/103 -F body=@...`), raport w
czacie z blokiem przekazania. Bramka końcowa: `npm test` **4602/4602**,
`npm run build` 59 modułów / 3358,0 kB (po M331/M332), commit `76aa5c9` na
`arena/01a078a2-mtg` (własny PR — NIE scalamy).
