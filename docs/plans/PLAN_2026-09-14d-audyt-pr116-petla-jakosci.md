# PLAN 2026-09-14d — audyt PR #116 (batch 55 + koszty zdolności) + pętla jakości

Zlecenie: „Kontynuujemy projekt” — prompt **nie nazywa tematu**, więc obowiązuje
pętla domyślna z [ADR 0021](../decisions/0021-default-session-work-no-queue-question.md):
PR na starcie (0020 A) → audyt poprzedniego scalonego PR (0020 B / 0016) →
niedokończony plan z `main` → pętla jakości. Sesja `arena/01a09fcc-mtg`.

## 0. Stan wejściowy (zmierzony, nie przepisany)

- `main` = `4ccc055` („Sesja arena/01a09c9e: audyt PR #115 + znaleziska właściciela A/B + batch 55 (10 kart: Gift, Embalm, Duskmantle Seer) + audyt kosztów zdolności (4 poprawki) (#116)”),
  PR #116 scalony 2026-09-14 11:54 UTC; `main` na originie = ten sam SHA.
- Gałąź sesji `arena/01a09fcc-mtg` **nie istnieje na originie** (świeży branch od `main`).
- `npm test` (szybki rdzeń, pomiar tej sesji): **5482/5482, 0 fail, 155,6 s**.
- Rozmiar audytowanego PR: `gh pr view 116` = **+5173/−406**, 23 pliki `src/`
  (`card-data.js` +234/−11, `effects.js` +155/−10, `heuristic-bot.js` +101/−11,
  `render.js` +77/−21, `spells.js` +60/−5, `game-state.js` +58/−20,
  `session.js` +33/−5, `registry.js` +11/−3, `materialize.js` +10/−1,
  `permanents.js` +9, `triggers.js` +13/−6, `identity.js` +10/−5,
  `mana-costs-data.js` +11, `deck.js` +4, `abilities.js` +5/−5,
  `combat.js` +6/−6, `resources.js` +2/−2, `objects.js` +2/−2,
  `state-based.js` +1/−1, `zones.js` +1/−1, `types.js` +1/−1,
  `card-images.js` +2/−2, `main.js` +4/−4), nowe testy (`ability-cost-pips`,
  `koszty-generyczne-zdolnosci`, `cr-numery-mechanik-straznik`, batch 55),
  10 snapshotów Scryfall, regeneracja talii, dokumenty.
- **Brak niedokończonego planu na `main`:** dwa najnowsze plany
  (`PLAN_2026-09-14-batch55-23-609-617.md`, `PLAN_2026-09-14c-koszty-zdolnosci.md`)
  mają etapy odhaczone i sekcje Wyniki; jedyny `[ ]` w batchu 55 to B0a
  (plan — commit `8151e3c` już istnieje). Punkt 3 pętli ADR 0021 nie ma czego
  podjąć, wchodzi punkt 4 po audycie.
- Lektura startowa wykonana w całości: `AGENTS.md`, wszystkie ADR-y
  (`docs/decisions/`, 0001–0030 + README), `docs/LESSONS.md` (2347 linii,
  wszystkie lekcje L1–L142), `docs/setup/ENVIRONMENT.md`, handoff
  `HANDOFF_2026-09-14.md` (211 linii), PR #116 (opis, lista plików, commity).

Otwarte z handoffu (niezapomniane, nie kolejka): `[Trigger:]` w linii stosu
(kandydat UX, nie zakres batcha); S-1 (literalne `\n` w `oracleText`, 20 kart)
— **nie ruszane bez zlecenia właściciela**; D1/O1/O2 z audytu PR #115 —
nieblokujące, do sprzątnięcia przy okazji zmiany danego pliku.

## 1. Zakres audytu PR #116 (ADR 0020 B) — kolejność wg blast radius

Audyt obejmuje **każdy zmieniony plik `src/`**; kolejność wynika z ryzyka
regułowego. Karty batcha 55 weryfikowane wobec Oracle/rulingów ze snapshotów
w `docs/cards/scryfall-*.json` (ADR 0010 §2a, ADR 0028) i, tam gdzie zmiana
dotyka CR, wobec źródeł online (ADR 0030).

1. **`src/engine/effects.js` (+155/−10)** — nowe mechaniki:
   `create_token_copy_of_source` (Embalm, CR 702.128a), Gift
   (`condition.wasGifted`, Food przed innymi efektami),
   `reveal_top_each_player_lose_life_mana_value` (Duskmantle Seer:
   odsłonięcie jawne, utraty życia jednoczesne CR 104.4b, ruch do ręki
   BEZ `card_drawn`, mana value z druku — L85),
   `add_counter_to_creatures_you_control.requireCounter`,
   `condition.controlsArtifact`. Zero gałęzi po nazwie karty (ADR 0002).
2. **`src/engine/spells.js` (+60/−5) + `game-state.js` (+58/−20)** —
   Gift: wariant `cast_spell` (`gifted`, `giftRecipientId`), przenoszenie
   obietnicy przez `OBJECT_FIELDS` i widok ręki (L21/L84, cztery warstwy),
   stos (`wasGifted`). Oferta ≡ walidacja (L48).
3. **`src/cards/registry.js` + `materialize.js` + `deck.js`** — freeze
   deskryptora `gift`, materializacja gałęzi permanentu I czaru, transport
   pól na obiekt (klasa L21).
4. **`src/cards/card-data.js` (+234/−11) + 10 snapshotów** — 10 kart
   `supported` vs Oracle (Act of Treason, Douse in Gloom, Gearsmith Prodigy,
   Lifecrafter's Gift, Hunt the Weak, Jungleborn Pioneer, Tah-Crop Skirmisher
   Embalm {3}{U}, Brightwood Tracker {5}{G}, Crumb and Get It Gift,
   Duskmantle Seer). Koszty zdolności po K1 (4 poprawki). `limitations`
   wyłącznie fakty strukturalne (ADR 0022). Proweniencja: artId ∈ kolekcji
   (ADR 0029).
5. **`src/table/render.js` + `session.js`** — etykiety Gift (`obiecuje dar`),
   grupy panelu `…:gift:<odbiorca>`, log, Z1c (czasownik w czasie teraźniejszym
   + `DRUGA_OSOBA`), H7/`EMPTY_RECEIVER_EFFECTS`. Kandydat `[Trigger:]`.
6. **`src/controllers/heuristic-bot.js` (+101/−11)** — wycena Gift, Embalm,
   odsłonięcia; klasyfikacja nowych typów efektów (M157/`REVIEWED_UNVALUED`,
   `STACKING_ACTIVATED_EFFECTS`); brak wyjątków po nazwie.
7. **Testy i strażnicy** — `ability-cost-pips.test.js` (pipy + generyk,
   pominięcia literalnego `\n` z licznikiem), `koszty-generyczne-zdolnosci.test.js`
   (granice ±1 many), `cr-numery-mechanik-straznik.test.js`, testy batcha 55.
   Czy mierzą to, co deklarują (RED→GREEN, L13).
8. **Talie i golden master** — generator ADR 0023/0024, re-podział Wiedźmina,
   dwa churny snapshotu z atrybucją (skład `tarkir-bg` / `ravnica`).
9. **Dokumenty i liczby** — README, HANDOFF, PROJECT_HISTORY, L142
   (proweniencja znaleziska). Liczby z pomiaru, nie przepisane (L92).

Metody: czytanie diffu plik po pliku; testy celowane na HEAD `main`;
weryfikacja twierdzeń regułowych wobec Oracle/CR ze źródeł online (ADR 0030);
pary „oferta == walidacja” (L48), FoW (ADR 0003/0017), determinizm (ADR 0005),
brak wyjątków po nazwie (ADR 0002).

## 2. Etapy i kryteria ukończenia

- [ ] **E0. Plan + PR sesji** (ADR 0020 A). Ten plik wypchnięty osobnym commitem
      PRZED kodowaniem; PR otwarty na GitHubie (choćby z samym planem).
- [ ] **E1. Audyt PR #116** — raport `docs/audits/AUDYT_PR116_2026-09-14.md`
      z werdyktem, tabelą znalezisk (ID, miejsce, treść, werdykt) i sekcją
      odtwarzalności; znaleziska blokujące naprawione u root cause osobnymi
      commitami (test RED→GREEN + weryfikacja mutacyjna).
- [ ] **E2. Pętla jakości — Żywy Tester** na świeżym `dist/` (L76), partie
      taliami z obszaru zmian (Gift/Embalm/Seer, talie batcha 55), ręczna
      lektura transkryptów po trzech osiach (`TESTER_STOLU.md`), naprawy
      u root cause + detektory. Kandydat: `[Trigger:]` w linii stosu.
- [ ] **E3. Polowanie na niezgodności z CR** inną ścieżką niż poprzednie sesje
      (obszar wskazany przez E1: Embalm/Gift/odsłonięcie/koszty zdolności) —
      z cytatem reguły w komentarzu strażnika (ADR 0030).
- [ ] **E4. Bramki**: `npm test` po każdym commicie; na koniec `npm run test:all`,
      `npm run build`, quick benchmark (`node tools/benchmark.mjs`) i golden
      master bota — churn tylko świadomy, z tabelą atrybucji (L124).
- [ ] **E5. Domknięcie**: `docs/setup/HANDOFF_2026-09-14d.md`, wpis w
      `docs/PROJECT_HISTORY.md`, README (liczby z pomiaru, L92), opis PR
      aktualizowany kumulacyjnie. Pełne B0 wyłącznie na komendę właściciela
      (ADR 0018).

## 3. Kolejność commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. ten plan; 2. raport audytu PR #116 (z werdyktem); 3…N naprawy/znaleziska
osobno per finding; N+1 pętla jakości (tester + detektory); N+2… dokumenty
zamknięcia. Każdy commit wypchnięty od razu (ADR 0020 C/D, L136).

## 4. Ryzyka i pułapki

- **Sandbox potrafi zresetować workspace w środku tury** (ENVIRONMENT §2, L136):
  po każdym commicie `git log --oneline -1` + push; przed każdym `git checkout
  <plik>` sprawdzić `git diff --stat -- <plik>`.
- Gift przenosi deskryptor przez **cztery warstwy** (L21/L84) — audyt sprawdza
  każdą, nie tylko `effects.js`.
- Embalm: wygnanie z grobu to KOSZT (ruling 2017-04-18) — efekt czyta obiekt
  już z exile; druga aktywacja tej samej karty niemożliwa.
- Duskmantle Seer: **nie** emituje `card_drawn` (miracle nie widzi dobrania);
  utraty życia jednoczesne (CR 104.4b). Pamięć treningowa nie jest źródłem
  (ADR 0030) — cytat CR przed claimem.
- S-1 (literalne `\n`) i nowe karty do katalogu — **zakaz** bez listy
  właściciela (ADR 0029).
- Nie odpalać pełnego B0 (ADR 0018); benchmark szybki bez `| tail`.
- `gh pr edit` na tym repo bywa odrzucane → `gh api -X PATCH`.
