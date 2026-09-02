# Handoff — audyt PR #92 + pętla jakości (M281), 2026-09-02

Gałąź sesji: `arena/01a06193-mtg` · PR: **https://github.com/jurekjurekgh/mtg/pull/93**
(open, NIE scalony — scalenie to decyzja właściciela, preferowane „Squash and merge”).
Baza sesji: `db0c493` (= squash PR #92, `main`).

## Stan na koniec sesji

- **Wszystkie znaleziska z audytu PR #92 naprawione i zielone.** Pięć defektów w
  trzech klasach (odcisk stanu, „stan zamiast zdarzenia”, oferta ≠ walidacja) +
  strażnicy klasy w `tools/`. Raport: `docs/audits/AUDYT_PR92_2026-09-02.md`.
- **Bramy na HEAD tej gałęzi:** `npm test` **4147/4147**, `npm run test:all`
  **patrz sekcja „Bramy” raportu** (brama PR, ADR 0019), `npm run build`
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
| (ostatni) | strażnicy klasy (rodzina `draws`, `CONTRACT_REQUIRED_FIELDS`) + raport + dokumentacja |

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

- **Sandbox bez egressu HTTPS** — Scryfall tylko przez `fetch_page`, nie
  `curl`/`fetch` z kodu. `docs/cards/scryfall-*.json` offline = jedyne źródło
  Oracle w sesji (i ono nie ma rulingów).
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
