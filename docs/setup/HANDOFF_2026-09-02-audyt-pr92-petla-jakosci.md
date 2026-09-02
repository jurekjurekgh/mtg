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
