# PLAN 2026-09-12f — Znaleziska z testów: rodzina Crew (A1–A4) + Battle-Rattle Shaman (B)

Zlecenie właściciela z 2026-09-12 (dwa znaleziska z żywej gry). Sesja `arena/01a096f0-mtg`.

## 0. Stan wejściowy (zmierzony, nie przepisany)

- Baza: `main@c1f1e6b` (PR #114 scalony).
- Karty Crew w katalogu (3): `irontread-crusher` (Crew 3), `bomat-bazaar-barge`
  (Crew 3), `balamb-garden-airborne` (Crew 1, tył DFC). Wspólną ścieżkę
  (`crewPower`/`saddlePower` → `crewCreatureIds`) dzieli też Saddle
  (np. Trained Arynx) — poprawka mechanizmu obejmuje obie mechaniki.
- Snapshoty: `scryfall-balamb-garden-airborne.json` NIE istnieje (tylko przód
  `scryfall-balamb-garden-seed-academy.json`); `irontread-crusher`,
  `bomat-bazaar-barge`, `battle-rattle-shaman` nie mają klucza `rulings`
  (do uzupełnienia wg ADR 0028 „przy kartce" — zachowanie tych kart dotykamy).

## 1. A1–A3: oferta Crew — przyczyny źródłowe (rozpoznanie)

1. **Silnik enumeruje podzbiory** (`legalCrewSubsets`, `src/engine/abilities.js`):
   zachłanny + maski bitowe do cap 32, a przy **n > 6 grywalnych — TYLKO JEDEN**
   podzbiór zachłanny (gałąź `if (n <= 6)`). Przy 7 stworach na stole gracz
   dostaje więc dokładnie jedną ofertę — „silnik sam podjął decyzję" (A3).
2. **Zachłanny = najsłabsze pierwsze**, bez wykluczania mocy 0: dla Crew 1 bierze
   Wizarda (0) + Hero — dwa tapnięcia zamiast jednego (A3). Nigdy nie jest
   minimalny liczebnie ani nie preferuje stworów z chorobą przywołania.
3. **Etykieta grupy** (`choiceGroupLabel`, M103/C2): `Aktywuj: <nazwa>` — bez
   nazwy zdolności i efektu (A1). Warianty z kolei wypisują każdy podzbiór
   z osobna (ściana kombinacji, A2) — bo `multiTargetPlanOf` nie zna kształtu
   `crewCreatureIds` i grupa spada do listy przycisków.
4. Pojedyncza oferta (n > 6) idzie wprost przyciskiem z pełnym podzbiorem
   w etykiecie — stąd A3.

## 2. Decyzja architektoniczna (do wykonania)

Precedens: **M66/R + W3/W4/W5** (przydział obrażeń) — silnik oferuje JEDEN
wariant domyślny, człowiek dostaje wizard, silnik WALIDUJE dowolny legalny
wybór (`validateBlockerDamageAssignment`). Mapowanie na Crew jest 1:1:

- **Silnik**: jedna oferta aktywacji Crew/Saddle z **mądrym domyślnym
  podzbiorem** (`defaultCrewSubset`, deterministyczny, ADR 0005); walidacja
  dowolnego legalnego podzbioru BEZ ZMIAN (`performActivation` już ją ma,
  `abilities.js:1411-1423`) — oferta mówi „da się załogować", walidacja
  sprawdza wybór (L48).
- **Domyślny podzbiór** (reguła jawna, testowana): (1) stwory o mocy 0 NIGDY
  (nic nie wnoszą); (2) jeśli same stwory z chorobą wystarczą — minimalny
  ich podzbiór (nie mogą atakować, więc tap jest darmowy); (3) wpp. podzbiór
  minimalny liczebnie, rozstrzygnięcia: więcej chorych, potem mniejsza moc
  tapnięta. Brute force przy n ≤ 12, greedy + prune powyżej.
- **UI**: wpis otwiera **picker wielowyborowy** (ptaszki + suma mocy +
  „Zatwierdź", domyślny podzbiór zaznaczony) zamiast ściany kombinacji;
  po zatwierdzeniu komenda z wybranym podzbiorem jedzie do silnika.
  Picker czyta grywalnych helperem SILNIKA (UI importuje engine — precedens
  w `main.js`), zero duplikacji filtra (L41).
- **Etykieta (A1)**: `Aktywuj: <nazwa> (koszt załoga N) — <efekt> — wybierz
  załogę…` (dla Saddle: „osiodłaj"/„wybierz…", ten sam mechanizm).
- **Boty**: jedna oferta = brak rankingu podzbiorów; heuristic ocenia
  aktywację jako całość (strażnik M230 `animatedUntilEOT` i kara za tap
  niedoszłego atakującego już istnieją). Aggro/random do zweryfikowania.

## 3. A4: badge po Crew (do potwierdzenia repro)

- `animatePermanentUntilEndOfTurn` ustawia `kind/types/power/toughness`
  (`permanents.js:1345`), a kafel czyta typy ze stanu (M138/Z6) — DLACZEGO
  „typ: artifact creature" nie widać, wyjaśni repro (transform + crew →
  `cardInfo`). Podejrzenie do sprawdzenia, nie fakt.
- Badge'a animacji BRAK (nic w `render.js` nie czyta `animatedUntilEOT`;
  `linkedAnimationLabel` dotyczy animacji linkowanych, a crew animuje SIEBIE).
  Precedens: `saddledNow` → „osiodłany". Plan: badge dla animacji
  nielinkowanej (copy do ustalenia przy implementacji, krótki jak reszta).

## 4. B: Battle-Rattle Shaman — przyczyna i plan

- Przyczyna: `resolve_trigger_target` friendly = `30 + value + (attackingNow ?
  25 : 0)` (`heuristic-bot.js`, obie gałęzie). Na początku walki (przed
  deklaracją) `attackingNow` jest fałszem dla WSZYSTKICH, więc wygrywa
  największy stwór — także z chorobą, który nie zaatakuje, a buff +2/+0
  przepada. Gałęzie cast/activate ten bonus mają (`canAttackNow`,
  linie ~2317/2384/2983/4013) — gałąź triggerowa nie (klasa L102).
- Plan (wzór `cmd.debuff`, M150): adnotacja oferty `triggerTargetPumpOf`
  (`{power, toughness}` z deskryptora, generycznie, ADR 0002) + bonus bota
  za `canAttackNow` odbiorcy, GDY buff daje moc (power > 0) i jest sens
  atakować (własna tura, faza przed deklaracją). Buffy czysto defensywne
  (+0/+X) bez zmian. Obie gałęzie (jedno- i wielocelowa, L41).

## 5. Etapy i kryteria ukończenia

- [x] **E0. PR sesji + audyt PR #114** (ADR 0020 A/B). PR #115 otwarty PRZED
      kodowaniem; `docs/audits/AUDYT_PR114_2026-09-12.md` (13 plików `src/`
      czytane w całości, 18 testów, 4 tools, snapshoty narzędziem + Scryfall
      API na Enter the Enigma; przebiegi: 118/118 celowanych, 5283/5283 all,
      build co do joty, benchmark co do meczu). Werdykt APPROVE, 7 znalezisk
      nieblokujących (D1–D5, S1, T1, O1). Komentarze na PR #114.
- [x] **E1. CR + rulingi** (ADR 0030, ADR 0028). CR 2026-08-07 (TXT z
      media.wizards.com, pobrane 2026-09-12): **Crew = 702.122** (kod cytował
      błędne 701.36 — do podmiany przy fixie), **Saddle = 702.171** (kod ma
      dobry numer); oba: „Tap any number of **other** untapped creatures you
      control with total power N or greater" — silnik już wyklucza źródło
      (`id !== id`, walidacja), więc zachowanie OK, tylko cytaty do naprawy.
      Fabricate = 702.123 (PR #114 cytuje 702.122a → D5 na PR #114). Oracle
      (Scryfall API): Balamb back face (Crew 1, 5/4 Flying, attack-draw),
      Irontread Crusher (Crew 3, 6/6), Bomat Bazaar Barge (Crew 3, ETB-draw),
      Battle-Rattle Shaman („target creature", BEZ „you control" —
      do weryfikacji modelu celu przy fixie B). Rulingi Balamb: tylko
      DFC-generyczne (2025-06-06), brak crew-specyficznych. Dosłowne cytaty
      trafią do commitów i komentarzy strażników (ADR 0030 §3–4).
- [ ] **E2. Silnik: domyślny podzbiór Crew/Saddle.** Kryterium: jedna oferta
      z mądrym defaultem (testy: Crew 1/3, choroba, moc 0, n > 6, saddle,
      determinizm); stare testy pinujące enumerację zaktualizowane
      z uzasadnieniem (świadoma zmiana zachowania na zlecenie właściciela);
      `npm test` + `npm run build` zielone.
- [ ] **E3. UI: picker + etykiety (A1/A2).** Kryterium: testy DOM (picker
      wielowyborowy, preselekcja defaultu, bramka sumy mocy, wysyłka jawnego
      podzbioru, etykieta grupy); saddle komplementarnie; `npm test` + build.
- [ ] **E4. A4: badge + linia typów.** Kryterium: repro (transform Balamb →
      crew → kafel) PRZED naprawą; badge animacji + typy; testy; build.
- [ ] **E5. B: Shaman.** Kryterium: testy (chory vs zdrowy, tapped, buff
      defensywny bez zmiany, wielocelowo); mutacje L13; `npm test` + build.
- [ ] **E6. Pętla jakości.** Kryterium: quick benchmark (oczekiwana brak
      regresji / pomiar), golden master — jeśli churn, to ŚWIADOMY
      z uzasadnieniem jak W4; Żywy Tester na świeżym `dist/` (partie taliami
      z pojazdami: final-fantasy, kaladesh + zendikar/Shaman); 0 detektorów.
- [ ] **E7. Domknięcie.** Handoff, PROJECT_HISTORY, opis PR, README jeśli
      liczby.

## 6. Ryzyka / pułapki

- Golden master `bot-scoring-snapshot` i progi benchmarku mogą drgnąć (mniej
  ofert Crew) — regeneracja TYLKO z tabelą atrybucji (L124), nie `--write`
  z rozpędu.
- Aggro-bot: sprawdzić, czy bierze pojedynczą ofertę crew z sensem
  (nie crewuje co turę w kółko — M230 jest heuristic-only).
- enumeracja `legalCrewSubsets` może być pinowana w wielu testach — każdy
  pin przeczytać (L13: pin utrwalający stare zachowanie → aktualizacja
  z uzasadnieniem, nie kasowanie).
- Picker: FoW nietknięta (własne stwory są jawne dla siebie); `noop-probe`
  i `summarize` nie znają nowego kształtu — brak nowego TYPU komendy,
  więc L131 nie gryzie (to samo `activate_ability`).
- DFC: Balamb na stole to obiekt tyłu — repro A4 iść przez prawdziwy
  transform, nie `putCard` tyłu (L21 pkt 3).
- Budżet: nie odpalać pełnego B0 (ADR 0018).

## 7. Kolejność commitów (każdy: `npm test` + `npm run build` + push)

1. Ten plan. 2. Audyt PR #114. 3. CR/rulingi. 4. E2 silnik. 5. E3 UI.
2. E4 badge. 7. E5 Shaman. 8. E6 pomiary. 9. Dokumenty zamknięcia.
