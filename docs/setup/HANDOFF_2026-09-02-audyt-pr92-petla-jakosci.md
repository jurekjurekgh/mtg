# Handoff — audyt PR #92 + pętla jakości (M281), 2026-09-02

Gałąź sesji: `arena/01a06193-mtg` · PR: **https://github.com/jurekjurekgh/mtg/pull/93**
(open, NIE scalony — scalenie to decyzja właściciela, preferowane „Squash and merge”).
Baza sesji: `db0c493` (= squash PR #92, `main`).

## Stan na koniec sesji

- **Wszystkie znaleziska z audytu PR #92 naprawione i zielone.** Pięć defektów w
  trzech klasach (odcisk stanu, „stan zamiast zdarzenia”, oferta ≠ walidacja) +
  strażnicy klasy w `tools/`. Raport: `docs/audits/AUDYT_PR92_2026-09-02.md`.
- **Bramy na HEAD tej gałęzi (`22dfba3`):** `npm test` **4147/4147**,
  `npm run test:all` **4157/4157** (0 fail, ~188 s — brama PR, ADR 0019),
  `npm run build`
  **57 modułów / 3084,1 kB**, `node --test test/bot-benchmark.test.js` 10/10,
  `tools/event-contract-audit.mjs` i `tools/family-audit.mjs` — brak naruszeń,
  `tools/oracle-coverage.mjs --only` dla 9 kart batchu 52 → 100%.
- **Zero zmian w katalogu kart, w UI, w wycenach bota** (golden-master nietknięty:
  naprawy nie zmieniły scoringu, tylko legalność ruchów).
- Plan sesji odhaczony w całości: `docs/plans/PLAN_2026-09-02-audyt-pr92-i-petla-jakosci.md`
  (w tym punkt 2.3 z M277, który wisiał od dwóch sesji).

## Co zrobiono (commity, każdy osobno zielony)

| commit | treść |
|---|---|
| `6c9a3b8` | plan sesji (ADR 0020/0021) |
| `fb92c01` | znaleziska 1+2 — strażnik L16 odzyskuje zęby, `pendingWardPay` + `pendingExileCast` w odcisku |
| `094a8c0` | znalezisko 3 — porządek dobrania w zdarzeniu (`recordCardDrawn` jako choke point, `drawNumberThisTurn`) |
| `0b409fd` | znalezisko 4 — grupowe triggery dedupowane po instancji zdolności (CR 603.3) |
| `10f7a39` | znalezisko 5 — `outsideHandCastScope`: jeden filtr oferty i walidacji darmowego rzutu |
| `d5eba18` | strażnicy klasy (rodzina `draws`, `CONTRACT_REQUIRED_FIELDS` + piny anty-vacuous) |
| `22dfba3` | raport + M281 + historia + L48 + backlog + handoff + liczby README |

## Gdzie szukać dalej

1. **`docs/audits/AUDYT_PR92_2026-09-02.md` §7 „Otwarte / rekomendacje”** — pięć
   punktów, każdy z rozpoznaniem, żeby następna sesja nie liczyła od zera:
   - siostrzana grupa `leftBattlefield` (też dedup po kontrolerze — ta sama klasa
     co znalezisko 4, ale wymaga listy kart, które ŚWIADOMIE chcą jednego
     triggeru na kontrolera);
   - Treasure Vaana składany ręcznie zamiast z katalogu tokenów (klasa L107);
   - `state.log === state.events` (delegat — świadoma redundancja);
   - snapshoty `docs/cards/scryfall-*.json` NIE mają `rulings`, więc audyt
     „zgodne z rulingami WotC” nie da się zrobić offline — to punkt dla
     właściciela (albo narzędzie dopisujące `rulings`);
   - kicker na instant/sorcery (Merfolk Falconer) — decyzja zakresu (ADR 0022).
2. **`docs/backlog.md` §2** — te same rozpoznania zapisane jako pomysły (nie
   kolejka zadań!); §5 — dług `rulings`.
3. **Neue klasy warte polowania:** (a) wszędzie, gdzie licznik „ile razy / który
   raz w turze” jest czytany ze STANU po komendzie, a powinien iść ze zdarzenia
   (znalezisko 3 — `permanentEnterBattlefieldCount`? `triggerFiredThisTurn`?
   skan: `grep -rn "ThisTurn" src/engine/triggers.js` i porównać z `processTriggers`
   biegnącym po całej komendzie); (b) grupy triggerów z `return true` po pierwszym
   dopasowaniu (znalezisko 4) — policzyć, które są poprawne.
4. **Jeśli właściciel każe scalać PR #93** — opis PR jest kumulatywny i aktualny;
   po scaleniu warto dopisać w `docs/PROJECT_HISTORY.md` informację o squash SHA
   (sesja nie scala, bo to decyzja właściciela).

## Pułapki (aktualne, zweryfikowane w tej sesji)

- **Sandbox bez egressu HTTPS z kodu** — `curl`/`fetch` z poziomu basha
  failuje (SSL_ERROR_SYSCALL/kod 000), ale `fetch_page` DOCIERA do API
  Scryfalla, w tym `https://api.scryfall.com/cards/<set>/<numer>/rulings`.
  Ściągnięte rulingi leżą w snapshotach (`docs/cards/scryfall-*.json`, pole
  `rulings`); narzędzie: `tools/fetch-card-rulings.mjs` (idempotentne, CLI
  odcięte od importu). Nie uznawaj braku egressu za blokadę.
- **`addObject` odrzuca pola spoza kontraktu** (L21) i tylko ostrzega na stderr:
  test, który chce `playableUntilTurn`, `plotted` itp., musi je położyć
  `state.objects.set(id, Object.freeze({ ...obj, pole }))` — inaczej dostaje
  mylący odrzut „To nie jest rzucalny czar z ręki…”.
- **`edit_file` potrafi zepsuć polskie znaki** w długich wstawkach; zapis przez
  `python3` + `Path.write_text(encoding='utf-8')`, z `assert count == 1` na
  anchorze. Uwaga: w `docs/*.md` cudzysłowy bywają ASCII (`"`) zamiast „ ” —
  anchor musi to oddawać, bo assert failuje bez wyjaśnienia.
- **Heredoc z `”` w_message commita** zniekształca tekst — message pisać
  pythonem do pliku i `git commit -F`.
- **`git checkout -- <plik>` cofa też NIEzacommitowane zmiany** — przy
  weryfikacji mutacyjnej własnych (jeszcze niecommitowanych) poprawek używaj
  kopii `cp /tmp/x.bak`, nie checkoutu.
- **`CONTRACT_RATIO = 0.6` w `tools/event-contract-audit.mjs`** — dla rodzin
  o 1–2 emitterach reguła większościowa milczy; pola o znaczeniu regułowym
  deklaruje się w `CONTRACT_REQUIRED_FIELDS` (patrz raport §4a).
- **Reguła L48 w obie strony:** zawężenie OFERTY bez walidacji (albo odwrotnie)
  nie jest naprawą — jeden predykat, cztery miejsca wołania (raport §4).


## Stan po turze 2 (2026-09-02, godz. popołudniowa) i co dalej polować

Cztery rozstrzygnięcia właściciela wdrożone (szczegóły: §9 raportu audytu, M282
w kamieniach milowych): rulingi w repo, „Start your engines!" jako akcja
stanowa, okno rzutu z exile = decyzja, jeden deskryptor Skarba + zdolność w
katalogu tokenów, kicker na instant/sorcery, deklaratywne `trigger.groupPer`.
Bramy na HEAD `eca0337`: `npm test` **4168/4168** (152 s), `npm run test:all`
**4178/4178**, 0 fail (268 s — brama PR, ADR 0019), `npm run build` 57 modułów /
**3097,4 kB**, `family-audit` i `event-contract-audit` bez naruszeń, strażnicy
dokumentacji 23/23, CI `test` **pass** (3m32s), `oracle-coverage` dla 9 kart
batchu 52 = 100%.

**Uwaga techniczna dla następnej sesji (nie jest to błąd projektu):** w trakcie tej
sesji sandbox został przebudowany — `.git` zastąpiono świeżym klonem na bazie
`db0c493`, przez co 13 lokalnych commitów zniknęło z gałęzi, choć pliki przetrwały.
Ratunek był tani i bezpieczny: `git fetch origin arena/01a06193-mtg` +
`git reset --mixed FETCH_HEAD` (bez `--hard`!) zwrócił historię, a delta w drzewie
okazała się dokładnie tym, co nie zdążyło zostać zpushowane. Naprawione commity to
`8ff69ae` (grupa `trigger.groupPer`) i `eca0337` (dokumentacja); reszta historii to
`db0c493..3d07dc0`. Po przebudowie `node_modules` nie było — `npm ci` (1,7 s).
Wniosek do powtórzenia: **push po każdym commicie** (ADR 0020 D) i nie trzymaj
niczego cennego wyłącznie w drzewie roboczym.

Wątki, które sama ta tura odkryła i zostawia (kolejność = spodziewany zysk):

1. **Cienie danych karty w rdzeniu przy Skarbie.** `mana-sources.js:46` ma
   `'token_treasure'` w mapie kolorów, choć komentarz w tym pliku mówi, żeby
   kart z darmowym `{T}: Add` do mapy NIE wpisywać; `resources.js:623,847`
   porównuje `object.cardId !== 'token_treasure'`. Czyste rozwiązanie:
   deskryptor zdolności jako źródło (albo jawna flaga na tokenie) + migracja
   6 literali `create_token` po stronie kart. Ryzyko: dotyka rozliczania many i
   wycen bota (golden-master), więc osobna tura.
2. **12–13 argumentów pozycyjnych w `castSpell`.** `buyback, payAltCost,
   xValue, phyrexianPayWithLife, abilityWindowCast, kicked` — każde kolejne
   uprawnienie dokłada pozycję, a pomyłka w kolejności jest niema. Propozycja do
   decyzji właściciela: zamienić ogon na `options` (jak `castPermanent`).
3. **Semantyka kontr-zaklęcia przy `pendingExileCast`.** Ścieżka odrzucona
   (`target_unsupported`) zwraca priorytet i zostawia kartę w exile; przy
   kontrze całego triggeru nie powinno być ani wygnania, ani Skarbu (Całokształt
   to „exile … If you do" — CR 118.13/608.2a). Nie ruszone, bo wymaga testów
   kontrzenia zdolności, których dziś nie ma.
4. **Rodzina pól `speed` i `draws` działają; `playableUntilTurn` nie.** Ten
   ostatni zapisują dwa miejsca w `effects.js` (impuls i — już nie — Vaan), więc
   dryf jest mało prawdopodobny; jeśli wróci trzeci pisarz, warto dodać rodzinę
   z próbkami `bypass`/`legal` (wzorzec `speed`).
5. **Pułapki harnessu** (L116): `createGameState` bez talii = puste strefy,
   mana tylko przez `addMana(...{colors})`, skutki triggerów po drenażu
   priorytetu, a przy agregatach liczyć WYZWANIA, nie efekty (L115).
6. **Budżet lektury startowej jest wyczerpany** (~99,84k z 100k;
   `test/dokumentacja-budzet-lektury.test.js`). Każda nowa lekcja w
   `docs/LESSONS.md` wymaga zwolnienia miejsca u kogoś innego. Trzy wyjścia do
   wyboru przez właściciela: podnieść próg, rozpisać trwały podział
   rejestr↔`docs/LESSONS_PRZYPADKI.md`, albo wynieść klasy pilnowane przez
   automaty do podręczników obszarowych. Ta sesja progu NIE podnosiła.
7. **Narzędzia do powtórzenia:** rodzina pól w `family-audit` za każdym razem,
   gdy naprawa wprowadza choke point (bez tego strażnik jest vacuouski —
   L113); kontrola mutacji w stronę ZACISKAJĄCĄ bramkę (L114).

## Stan po turze 3 (2026-09-02, godz. wieczorna): cztery wątki z listy zamknięte

Z siedmiu wątków powyżej sesja wzięła 1, 2, 3 i 4 — wszystkie są w kodzie, z testami i
pushnięte osobno: `9d0ba7b` (A: `castSpell` przez `options`), `5d7b3f4` (B: Skarb
czytany z deskryptora zdolności, nie z ID karty), `62e03e6` (C: choke point
`src/engine/impulse-window.js` + rodziny `impulse-window`/`impulse-free-cast` w
audycie), `9f1c37c` (D: Stifle, `ability_on_stack`, `counter_ability`,
`abilityEffects` w `playerView`). Narracja i liczby: §10 raportu
`docs/audits/AUDYT_PR92_2026-09-02.md`, M283 w `docs/ENGINE_MILESTONES.md`.

Status dawnej listy:

1. **zamknięte (B).** `MANA_SOURCE_MAP` nie ma wpisu dla Skarba; `resources.js`
   nie porównuje `cardId`; kolory są DANĄ definicji tokena (sześć efektów
   `create_token` też je dostało). Napomknienie: golden-master wycen bota nie
   drgnął, bo `getSourceForObject` zwraca dokładnie to co wcześniej.
2. **zamknięte (A).** Sygnatura `castSpell` to 7 pozycyjnych + `options`;
   `CAST_SPELL_OPTIONS` jest zamrożone, a skan źródła pilnuje, że każda flaga w
   ciele funkcji jest na liście i każda opcja jest użyta.
3. **zamknięte (D) + jedno sprostowanie.** Pytanie „co z `pendingExileCast`
   przy kontrze całego triggeru" ma test: skontrowana zdolność się nie
   rozstrzyga — brak wygnania, brak Skarbu, brak decyzji (CR 118.12/608.2a).
   Natomiast zdanie „ścieżka odrzucona (`target_unsupported`) zwraca priorytet i
   zostawia kartę w exile" jest NIEAKTUALNE: `target_unsupported` nie istnieje w
   silniku (grep po `src/` daje tylko `unsupported:<cardId>` w deck-builderze i
   status rejestru). Natomiast samo pozostanie karty w exile po rezygnacji z
   rzutu jest ZGODNE z kartą (Vaan nie ma klauzuli zwrotu), więc nie ma czego
   naprawiać.
4. **zamknięte (C).** Pula pól impulsu ma właściciela i dwie rodziny w audycie.
   Uwaga dla następnej tury: rodzina pól bez `bypass`/`legal` w
   `test/family-audit.test.js` jest martwa (L113), a skan audytora jest
   tekstowy i liczy się z KOMENTARZAMI — literał `'token_treasure'` w
   komentarzu `resources.js` RED-ował bramkę (słusznie: komentarz z ID karty to
   pierwszy krok do kodu z ID karty).
5. nietknięte — pułapki harnessu (L116) aktualne; tura 3 dorzuciła dwie własne,
   opisane w komentarzach `test/audyt-kontrzenie-zdolnosci.test.js`
   (`gameObjectDataOf` nie przenosi podtypów → trigger Vaana nie wpada; komendy z
   `playerView` nie niosą `cardId` → filtr po `cardId` daje pusty pin).
6. **nadal czeka na właściciela** — budżet lektury startowej (455 B zapasu).
   Tura 3 celowo NIE dopisała lekcji do `docs/LESSONS.md`; narracja poszła do
   raportu audytu. Trzy wyjścia (próg / trwały podział rejestr↔przypadki /
   wyniesienie klas pilnowanych przez automaty) pozostają do wyboru.
7. nietknięte, zastosowane w praktyce (rodziny pól przy C, kontrola mutacji przy
   B i C).

Czego NIE robić w ciemno: `docs/LESSONS.md` bez zwolnienia miejsca (pkt 6);
`git push --force`; scalania PR-a #93; „poprawiania" faktu, że zdolność many nie
wchodzi na stos (to CR 605.1a i ono realizuje klauzulę „Mana abilities can't be
targeted" — zob. test 4 w `test/audyt-kontrzenie-zdolnosci.test.js`).

**Bramy na koniec tury 3:** patrz §10 raportu audytu (tam są świeże liczby
`npm test` / `test:all` / build / benchmark / strażników dokumentacji).

## Stan po turze 4 (2026-09-02, noc): budżet startowy ma zapas, rejestr ma strażnika kondensacji

Właściciel rozstrzygnął wątek 6 (budżet lektury): **próg zostaje 100k tokenów**,
sesja ma zwalniać miejsce streszczeniem. Wykonane w `19ab3ed` i `dbf5b16`.

| wątek z tury 2/3 | status po turze 4 |
|---|---|
| 6. budżet lektury startowej | **ZAMKNIĘTE** — rejestr 151 441 → 113 852 B, lektura 242 564 / 280 000 B, zapas ~37 kB (≈26 medianowych lekcji); przepis „jak odzyskać miejsce" wpisany w `AGENTS.md` §0 |
| 1–4 (options, Skarb, okno impulsu, kontr-zdolności) | zamknięte w turze 3 (`9d0ba7b`, `5d7b3f4`, `62e03e6`, `9f1c37c`) |
| 5. talie z generatora | stosowane w praktyce; bez zmian |
| 7. numery w docs brać z pomiaru, nie z pamięci | **nadal aktualne i znowu pomocne**: message `dbf5b16` podał 240 265 / 39 735 B zmierzone przed ostatnią edycją nagłówka rejestru; poprawne liczby są w M284 i §11 raportu. Reguła: mierzyć PO ostatnim zapisie, a w message commita wpisywać liczby policzone przez skrypt |
| nowe: rulingi dla reszty katalogu | **czeka na decyzję właściciela** — stanowisko sesji i pomiar: §11.5 raportu oraz wpis w `docs/backlog.md` |

Jak czytać rejestr po kondensacji (to nie jest powrót do starego stanu):
`docs/LESSONS.md` = reguły i strażnicy, `docs/LESSONS_PRZYPADKI.md` = pełna
narracja pod tym samym numerem (`grep -n '## L48' docs/LESSONS_PRZYPADKI.md`).
Nowa lekcja: nagłówek + `**Przypadek:**` (jedno zdanie z kartą/testem/CR) +
`**Reguła:**` + `**Strażnik:**`; jeśli trzeba więcej miejsca — skondensuj
najgrubszy wpis, nie podnoś progu.

Czego nie robić w ciemno (pułapki potwierdzone w tej turze):
1. **Ścieżki względne w `write_file`/`edit_file` liczą się od `/home/user`, a nie
   od `cwd` podanego w `bash`** — jedyny sposób, by nie pisać obok repo, to ścieżka
   bezwzględna `/home/user/mtg/...`.
2. **`cd repo && (coś) & python3 <<Heredoc`** wysyła całe `cd` w tło, więc reszta
   komendy leci w `/home/user` (`FileNotFoundError` zamiast pracy). Jedna komenda =
   jeden `cwd`.
3. **Transformacje tekstu rejestrów robić skryptem w pliku, nie heredokiem** z
   cudzysłowami; i **nie szukać „pierwszego zdania" regexem z `.*?` na pliku
   100 kB** — przy braku dopasowania potrafi się zapętlić (timeout 300 s).
   Kontrole mutacyjne odpalać w kopii drzewa w `/tmp/mut`, nigdy w repo.
4. **Strażnik formy wpisu** (`test/docs-decisions.test.js`) RED-uje, jeśli wpis z
   odsyłaczem straci `**Reguła**`/`**Zasada**`/`**Wniosek**`/`**Strażnik**` —
   skracając rejestr, zostawiaj któryś z nich.
5. **Dodanie karty do katalogu** nadal wymaga `node tools/generate-plan-decks.mjs`
   (ADR 0023) i wpisu w `src/cards/mana-costs-data.js` (bez niego `coloredPipsOf`
   = 0); nie edytować `decks/*.txt` ręcznie.

Bramy końcowe tury 4: `npm test` 4187/4187 · `npm run test:all` 4197/4197 (0 fail) ·
build 58 modułów / 3111,8 kB · strażnicy dokumentacji 24/24 · CI `test` pass
dla `0197792` (`gh pr checks 93`), dla `19ab3ed`/`dbf5b16` do odczytu w następnej
turze.

---

## Tura 5 (2026-09-02): ADR 0028 + audyt bota przez remisy punktowe

**Zapadło:** ADR 0028 (`681049d`) — rulingi WotC nie sa hurtowo dociągane, tylko
„przy kartce" i kolejką priorytetu; w README wiersz, w `docs/cards/HOW_TO_ADD_CARD.md`
odnośnik. **Zmierzono:** `tools/bot-tie-audit.mjs` — 5340 decyzji, 30,4% remisów na
maksimum (block 188, play_land 75, attack 35). Żywy Tester równolegle: 8 gier,
„brak zgłoszeń" w 8/8 transkryptach. **Naprawiono:** wybór lądu (`16fec68`) —
`landPlayDelta` + `landAnaliza` + `tieProjection` + karta w śladzie; benchmark quick
83,6% (przed 82,7%), `npm test` 4192/4192.

**Następny krok (kolejność wg wartosci, nie wg liczby remisów):**
1. `tieProjection` dla `declare_attackers` i `declare_blockers` — bez projekcji nie
   da się odróżnić `block` 186 (prawdopodobnie benign: `block[]` vs `pass_priority`,
   ten sam no-op) od realnych przeoczeń; dopiero potem decyzja, czy wyceniać przypisania.
2. `cast_permanent`/`cast_spell` (13) i `activate_ability` (8) — projekcja per karta.
3. Drobne `resolve_*` po 1–7 — doraźnie, przy zgłoszeniach z partii.
4. `docs/setup/ENVIRONMENT.md`: poprawic stwierdzenie o egressie (rejestr npm dziala,
   `api.scryfall.com` blokowany → `ECONNRESET`) — mylące dla kazdego, kto planuje
   sciaganie danych.

**Uwagi praktyczne:** transkrypty testera NIE trafiaja do repo (decyzja wlasciciela,
`docs/setup/TESTER_STOLU.md:419`), narzedzie odpalac przez `node tools/bot-tie-audit.mjs
--gry=1 --top=3` (~7 s na 12 partii); `--gate=<kind>` z kodem wyjscia gotowe do CI.

---

## Tura 6 (2026-09-02): audyt bota #2 — pomiar pomiaru

**Zrobione (`cf978f0`):** klasyfikacja `no-op` w `tools/bot-tie-audit.mjs`
(208 z 308 remisów to nadwyżka oferty silnika, udowodniona testem regułowym, nie
założona), odrzucanie opcji bez projekcji (wcześniej zacierały findingi),
saturacja projekcji ataku na lethalu, `tieProjection` dla `declare_attackers` i
`declare_blockers`, grzechotka `<= 4` w `test/audyt-bot-walka-remisy.test.js`.
Stan: 100 remisów między realnymi wariantami (12,4% decyzji akcyjnych), 0 groźb
`play_land`, 4 przejrzane (2 polityka bota, 2 do benchmarku). `npm test`
4195/4195, benchmark quick bez zmian (83,6% / 28,9%) — zero zmian wag.

**Następny krok:**
1. `attack`: zaostrzenie wyceny na drobnych różnicach (siła ponad potrzebną,
   obrona zostawiana w domu przy atakach nieśmiertelnych) — **wymaga benchmarku**,
   nie testu jednostkowego; wejściowo: `node tools/benchmark.mjs` przed/po, próg
   przyjęcia = brak regresji. To jedyna z czterech groźb, która jest realnie
   do ruszenia.
2. `cast_permanent` (8) / `cast_spell` (5) / `activate_ability` (8) /
   `resolve_discard_choice` (7) — projekcje per karta, potem analogiczna grzechotka.
   Dziś `bez-danych` = `akcyjne` dla tych klas, więc pomiar nic o nich nie mówi.
3. Żywy Tester: partia z `--steps 300` po każdej zmianie wag (nie odpalona w tej
   turze, bo kod bota nie zmienił ścieżek wykonania — tylko metadane śladu).
4. `docs/setup/ENVIRONMENT.md` — wciaż do sprostowania: rejestr npm działa,
   `api.scryfall.com` blokuje (`ECONNRESET`); to jedyna znana nieprawda w docs.

**Uwaga o narzędziach:** `gh pr edit --body-file` w tym sandboxie nie stosuje
zmiany (zwraca 0!), PATCH przez `gh api -X PATCH repos/.../pulls/93 --input plik.json`
działa — ciało PR-a #93 ma sekcje Tura 1–5, do uzupełnienia o 6.

---

## Tura 7 (2026-09-02): audyt bota #3 — cena many weszła do wyceny rzutu

**Zrobione (`a951461` + commit dokumentacyjny):** `creatureManaCostWeight` (1/pt
many) w gałęzi `cast_permanent` — wcześniejsza formuła znała korpus, ale nie cenę,
więc 2/2 za {2} i 2/2 za {6} były tym samym wyborem. Akceptacja **liczbowa z
baseline'em na tej samej próbie** (`git worktree` na `HEAD`): 2016 meczów
85,7% → 85,5% (Δ = −3 mecze = szum), quick 83,6% → 83,8%. Przyjęto ze względu na
lukę modelową, nie na win-rate (próg planu = brak regresji). Projekcje `tieProjection`
dla `cast_*` i `activate_ability` (21 remisów przestało być „bez danych", wszystkie
wyszły równe ⇒ 0 groźb) i dwie korekty samej metryki (`materialna` jako suma P/T —
model gorszy od mierzonego kodu; `obronaWDomu` — fałsz regułowy wg CR 502.3).
Żywy Tester po zmianie: 12 gier, „brak zgłoszeń" w 12/12.

| brama | wynik |
|---|---|
| `npm test` / `npm run test:all` | **4199/4199** · **4209/4209** (0 fail) |
| `npm run build` | 58 modułów / 3126,4 kB |
| benchmark `--seeds 24` | heuristic 85,5% (baseline 85,7%) — neutralne |
| benchmark quick | heuristic 83,8% (baseline 83,6%) |
| grzechotka remisów | `play_land` 0, `cast_*` 0, `activate_ability` 0; sufity `attack` ≤ 4, `block` ≤ 4 |

**Kolejny krok, w tej kolejności:**
1. **Decyzja właściciela (nie techniczna):** czy trzymamy `creatureManaCostWeight=1`
   przy zmierzonej neutralności. Argument „za": zniknęła arbitralność wyboru i jest
   punkt zaczepienia dla tunera B6; „przeciw": każda waga to powierzchnia ataku dla
   kolejnych dostrajań. Można też podnieść do 2 (równo wadze siły) i zmierzyć
   ponownie — wtedy pytanie brzmi, czy bot zacznie przesadnie preferować tanie
   szczury (test 3 w `test/audyt-bot-cena-stwora.test.js` pilnuje, żeby nie).
2. `resolve_*` (discard 7, trigger_target 3, search 3, exploit 3, graveyard_top 3 …)
   — wciąż `bez-danych = akcyjne`. Potrzebują projekcji „wybór spośród obiektów":
   dla każdego kandydata jego `waluta`/ciało/koszt, nie tylko id.
3. Block/attack: jedyne sensowne zaostrzenie to **asymetria wymiany** (czy ginie
   stwór o większej wartości niż ten, którego zabijamy) — dziś model używa mocy jako
   jedynej proxy. Zmiana wymaga benchmarkerów (przynajmniej 2016 meczów), bo na
   quicku efekt rzędu 0,2 pp jest nieodróżnialny od szumu.
4. `--seeds 24` warto wpisać do `package.json` jako `npm run benchmark:duzy` —
   dzisiejszy A/B robiło się ręcznie na worktree, a to jest jedyny uczciwy sposób
   mierzenia małych zmian wag.

**Uwagi praktyczne z tej tury:**
- `git worktree add --detach /tmp/mtgbase HEAD` = tani baseline pod benchmark
  (uruchamiać `cd /tmp/mtgbase && node tools/benchmark.mjs`; po wszystkim
  `git worktree remove`). Działa, bo `benchmark.mjs` liczy ścieżki od siebie.
- Po przebudowie sandboxa `dist/mtg-table.html` znika, a Żywy Tester bez niego
  nie startuje (`BŁĄD: Brak artefaktu`) — `npm run build` przed pierwszą partią.
- Item „ENVIRONMENT.md kłamie o egressie" był **nieaktualny** (plik ma poprawną
  sekcję od M202); doprecyzowałem tylko kod błędu `fetch` na `ECONNRESET`.
- Rozszerzanie `summarize` o `cardId` dla `cast_*` zostało **cofnięte**: ~19 testów
  parsuje `cast_*(objectId)`. Przy grze z formatem śladu najpierw `grep -rn
  "cast_spell(\|cast_permanent(" test/ | wc -l`.


---

## Tura 8 (2026-09-02): uwagi z żywej gry — modal wielocelowy, hover, equip bota, nakładka

**Co właściciel zgłosił (dokładnie te cztery uwagi były osią):** A — „modal Knockout
Maneuver jest inny niż modal blokowania; przeróbcie na jeden wspólny helper do
efektów wielocelowych (logika per efekt, wygląd wspólny)"; B — „karty specjalne
(Undercity, Day/Night, Poison) mają powiększać się po hover jak zwykłe stwory";
C — „bot w jednej turze przełożył Thieves' Tools dwukrotnie, bez sensu — ukrócić";
D — „w nakładce końca gry dopiszcie życia końcowe i wyczerpanie biblioteki, jeśli to
jego przyczyna".

**Commity (każdy zielony i pushnięty osobno, bez force):** `74b8172` plan,
`6d30844` B, `41bce48` D, `d8fde3f` A, `69a86df` C, `f6900b5` poprawka D.

**Jak to obejrzeć rękami:**
- A: stół ze spellem wielocelowym (`Knockout Maneuver`, Fireball na 3 cele) albo
  mulliganem z odłożeniem (Kaervek) — wiersze to `<label>` z natywnym `<input>`;
  klik w nazwę otwiera pełny ekran karty; przy pozycjach z Oracle wiersze danej
  pozycji dzielą `name`, więc zachowują się jak radio;
- C: `play-heuristic`, Thieves' Tools na własnym 2/1 i Marut 7/7 w ręce — przed
  naprawą bot wydawał {2} na przeniesienie (ocena +11,00), po naprawie veto
  −10,00 i dobiera inną akcję; helper `ocenyEquipu` w
  `test/uwagi-tura8-bot-equip-nie-przenosi-prozno.test.js` wypisuje wszystkie oceny;
- D: doprowadź partię do końca (albo odpal gremlina — remisy przez deck-out) —
  nakładka: „Koniec partii — wygrywa X · Gracz: N ż. · Bot: M ż. · X wyczerpał
  bibliotekę" (dokładnie taki tekst emituje `src/table/main.js`).

**Liczby, które trzymają naprawę:**
- `node --test test/uwagi-tura8-*.test.js` = 33/33 (picker 10, hover 5, nakładka 11,
  equip 7);
- brama C na reżimie bota (`test/bot-*.test.js test/audyt-bot-*.test.js
  test/equip-do-obecnego-nosiciela.test.js test/m244-equip-heurystyka.test.js
  test/m270-*.test.js test/m272-*.test.js`) = **227/227**; golden-master
  `bot-decyzje-fixtures.json` bez regeneracji, grzechotka remisów nietknięta;
- benchmark A/B na tej samej próbie (`--seeds 24`, 2016 meczów; baseline z
  `git worktree` na `ae8bc24`): heuristic **85,5% (1724) → 85,5% (1723)**, Δ = −1
  mecz = szum; aggro 24,5% → 24,6%, random bez zmian → próg planu (brak regresji)
  spełniony; C przyjęte dla spójności modelu, nie dla win-rate;
- `npm test` po A = 4224/4224, `npm run build` = 59 modułów / 3144,5 kB;
- `npm run test:all` = **4242/4242, zero failów** (po C i po poprawce D) · Żywy Tester (12 partii, 4 pary decków × 3
  profile, seedy 781+) = **12/12 do końca, `DETEKTORY: brak zgłoszeń` w każdej**; w 4 partiach
  koniec przez deck-out, więc nakładka mówi `Bot wyczerpał bibliotekę`; kreator
  poświęcenia doszedł do `rzucono:` pierwszy raz (3 otwarcia kreatora na 12 partii).

**Nowe rzeczy, o których następna tura musi pamiętać:**
1. `src/table/picker.js` — KAŻDY ekran „wybierz pozycje/cele/odrzucenia" idzie przez
   `renderPickerRow`; nie wracamy do znaczników `[ ]`/`[x]` w tekście ani do osobnego
   przycisku „Podgląd" (wycofane świadomie, L120).
2. Hover kart specjalnych montuje `attachSpecialCardHover` w `main.js`; `render.js`
   pozostaje od niego czysty — pilnują tego dwa strażniki w
   `test/uwagi-tura8-hover-kart-specjalnych.test.js`.
3. Tester klika `.multi-target-toggle` i czyta `checked` (fallback na „[x]"), nazwę z
   `.picker-name`; zmiana markupu pickera = zmiana testera w tym samym comicie.
4. `equipValuation` jest jedna dla obu gałęzi equipu (nowy sprzęt i przeniesienie);
   kolejne premie/kary za sprzęt dokładamy w niej, nie w `score` gałęzi (L28).

**Czego świadomie NIE zrobiliśmy (nie dokańczać bez nowego zgłoszenia):** limitu
„jeden equip na turę" (zakaz poza zasadami, blokowałby naprawę błędnie
wyposażonego stworzenia); przeniesienia na picker chipów `.look-wizard-card`,
stepperów podziału obrażeń i `mana-wizard` (to nie listy wyborów — wpis w
`docs/backlog.md` §4); liczby tur i seeda w nakładce (kontrakt `KONIEC PARTII`
testera jest celowo krótki).

**Lekcja tury (L120, rejestr + archiwum):** opcjonalna zależność komponentu to
dziura w drucie — zielony test komponentu z podanym stubem nie dowodzi, że
aplikacja tę zależność podaje; każda rodzina klas DOM musi mieć regułę CSS.

**Własny błąd procesowy z tej tury (nie dotyczy kodu, ale warto znać):** commit
`d5bb962` zrobiłem przez `git commit -m "..."` z cudzysłowem podwójnym, więc bash
wykonał zawartość backticków w treści komunikatu i dwa cytaty zniknęły z message
(zostało „… wyszukiwała ofertę ;"). Poprawki nie ma: zmiana message
wymagałaby force pushu, a go nie robimy. Reguła potwierdzona na żywym ciele:
**komunikaty przez `git commit -F <plik>`** — tak powstało sześć wcześniejszych
commitów tury i żaden się nie rozleciał.


---

## Tura 9 (2026-09-02): pytanie kontrolne o equip — drabina `wornByMine` obciążona testem

**Pytanie właściciela (w skrócie):** „Naprawiłeś to, żeby nie przerzucał na
kreaturę, której equipment nic nie daje, i super. Ale gdyby były dwie kreatury,
którym obu ten equipment daje pompę — czy zablokowane jest bezsensowne wydawanie
many na dwukrotne przerzucanie? Chodzi o to, żeby wybrał najlepszy cel i tam już
zostawił."

**Odpowiedź: tak, jest zablokowane, i to jest własność strukturalna.** Cztery
szczeble w `src/controllers/heuristic-bot.js` (gałąź `wornByMine`, ~linia 3830):
nic-nie-dodaje → −12; ładunek wyraźnie większy (budzi martwy efekt) → +4 +różnica;
ciało ≥ 2 siły większe i ładunek nie gorszy → +4 +delta; reszta (w tym dwa równe
ciała z tą samą pompą) → −6, więc wygrywa pass. Każdy szczebel jest
antysymetryczny, zatem X->Y i Y->X nie mogą być jednocześnie dodatnie — nie ma jak
powstać ping-pong.

**Jak to powtórzyć:** `node --test test/uwagi-tura9-bot-rowne-ciala-equip.test.js`
(7/7). Numery z pomiaru: Wooden Stake na 2/1 vs kandydat 2/2 → −4,00 przy passie
0,00; Brawler's Plate (+2/+2, trample, equip {4}) na tej samej parze → −4,00;
schody 2/1 → 2/2 → 7/7 → `->marut = +10,00`, `->dryada = −4,00` (jeden krok, nie
dwa opłacone equipy); Monastery Flock (0/5, defender) → Undead Servant → +8,00
(naprawa dozwolona). Test T9/3 sam wypisuje pary, jeśli drabina przestanie być
antysymetryczna, i wymaga ≥3 dozwolonych awansów, żeby nie przejść „przez pusto".

**Czego NIE zrobiliśmy i dlaczego:** nie zmieniliśmy żadnej wagi (pytanie było o
pokrycie, nie o błąd), więc nie było benchmarku A/B ani nowego milestonu; nie
dodaliśmy kary za „ruch boczny" między równymi ciałami — one już są pod
progiem; dwie granice modelu (patrz §13.6 raportu) wpisaliśmy do `docs/backlog.md`
§3 jako zmiany wymagające `--seeds 24`.

**Uwaga o warsztacie (też L120 z innej strony):** pierwsza wersja scenariuszy
nadpisywała `power`/`toughness` i `cantAttackStatic` wprost na obiektach — `playerView`
projektuje wyłącznie pola liczone przez silnik (`power` nosiciela zawiera już
pompę ze sprzętu, a `cantAttackStatic` ustawia `staticAttackPrevented`), więc
„reprezentacja" milczała o 1 sile i nie pokazywała defendera w ogóle. Pomiary
przepisaliśmy na same prawdziwe karty; `addObject` przy okazji przypomniał
ostrzeżeniem L21, że pola spoza kontraktu giną.


---

## Tura 10 (2026-09-02): druga strona weta C — `equipValuation` liczy spożytkowanie pompy

**Skąd:** pytanie kontrolne właściciela (13.6) o dwa ciała profitujące z pompy.
Blokada ruchu bocznego była potwierdzona, ale ten sam pomiar ujawnił, że drabina
weta więzi pompę na ciele, które nie umie jej użyć (defender 3/2 z Wooden Stake
przeciw atakującemu 3/2 obok: −4,00, czyli „stój" tam, gdzie ruch jest poprawką).

**Zmiana (jedyne miejsce):** w `equipValuation` waga siły zależy od tego, czy atak
nosiciela ma sens — `cantAttackStatic` albo obrażenia zapobiegane przez ochronę
blokerów (`attackerNeutralizedByProtection`, CR 702.16c) → połowa wagi `pumpPower`.
`ofensywne` pozostaje zerowane dla ciał nieatakujących. Brak zmian w progach drabiny
(−12 / +4+różnica / `delta >= 2` / −6), brak osobnej wagi kosztu aktywacji.

**Jak powtórzyć:** `node --test test/uwagi-tura9-bot-rowne-ciala-equip.test.js`
(8/8). T9/5 i T9/6 to obie strony medalu (schodzi znad defenddera; nie kursuje
między równymi atakującymi), T9/3 to antysymetria na 40 parach, T9/8 pilnuje, że
waga ma jedno miejsce w pliku.

**Bramy:** subset reżimu bota 242/242 · `npm test` 4240/4240 · benchmark A/B na `--seeds 24`
(2016 meczów, baseline z worktree na `54c4371`): **Werdykt: agregat identyczny** — heuristic 85,5% (1723/2016) w obu gałęziach, aggro 24,6% (248/1008), random 4,5% (45/1008). To nie jest dowód „nic nie zmieniliśmy": ta pozycja (sprzęt na ciele, które nie atakuje, z równym co do siły kandydatem obok) nie zdarza się w talach benchmarku, więc win-rate nie ma czego mierzyć. Dowodem działania naprawy są stoły w `test/uwagi-tura9-bot-rowne-ciala-equip.test.js`, a benchmarkiem zamknęliśmy tylko tylną furtkę (że nic nie zepsuliśmy w reszcie gry bota).. Progiem planu był brak
regresji, nie wzrost.

**Nowa lekcja:** L121 — każde „nie płać za X" ma dwie osie: czy odcina ruch
bezwartościowy i czy nie odcina ruchu, który realnie poprawia stan. Druga oś nie
generuje zgłaszalnego błędu, tylko cicho utracone poprawki, więc trzeba ją pisać
testem w tej samej turze co pierwszą.

**Wpadka narzędziowa tej tury (do zapamiętania):** pierwsza wersja wklejenia L121 do
`docs/LESSONS.md` liczyła pozycję końca wpisu przez `find('\n## ')`, który zwrócił
−1 (L120 był ostatnim wpisem) i w efekcie wstawił nową lekcję NA POCZĄTEK pliku, a
poprawka slice'iem starła nagłówek rejestru. Ratunek: `git checkout docs/LESSONS.md` i
wklejenie na KONIEC (rejestr jest chronologiczny: L119, L120, L121 na końcu). Przed
każdym masowym cięciem doków — `git show HEAD:<plik> | head -3` do porównania.
