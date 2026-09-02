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
Bramy: `npm test` 4168/4168, `npm run test:all` 4178/4178 (~250 s), build
57 / 3097,4 kB.

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
