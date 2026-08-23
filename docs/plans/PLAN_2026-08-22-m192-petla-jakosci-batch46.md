# PLAN M192 — pętla jakości Żywym Testerem: Batch 46 (2026-08-22)

Zlecenie właściciela: „po dodaniu batcha 46 pora na pętlę jakości Żywym
Testerem". Metoda jak M180/M184/M186: `npm run build` → `tools/table-tester`
→ transkrypty z DETEKTORAMI → zgłoszenia → naprawy u ŹRÓDŁA (osobne zielone
commity, testy RED→GREEN) → rebuild → weryfikacja do 0 zgłoszeń.

## Baseline (start, HEAD `79bcfaa`)

- build: **52 moduły / 2446.9 kB** (świeży artefakt dla testera).
- `npm test` z końca M191: **2834/2834**, benchmark regresji 9/9.
- PR sesji: **#70** (otwarty) — ADR 0020 A spełnione.

## Priorytety pokrycia — talie z kartami Batchu 46

| Karta (Batch 46) | Talia |
|---|---|
| Cathartic Reunion, Gila Courser, Glint-Sleeve Artisan | worek-dziki |
| Bring Low, Rediscover the Way | tarkir |
| Manor Gate | forgotten-realms |
| Bone Shredder | mirrodin |
| Infectious Horror | alara |
| Guildscorn Ward | ravnica |
| Roiling Regrowth | zendikar |

Dodatkowo świeże z M190: **graf Undercity** (forgotten-realms — inicjatywa),
opisy zdolności many (Manor Gate/Heap Gate — bramy), wizard many bez
tapnięcia siebie (Basilisk Gate), equip (Thieves' Tools).

## Kroki

- [ ] K0: build + `npm i` w table-tester; plan (ten plik) → commit/push
- [ ] G1: worek-dziki vs tarkir (fabricate, echo? nie — impulse, saga, Bring Low)
- [ ] G2: forgotten-realms vs mirrodin (Manor Gate, Undercity, Bone Shredder)
- [ ] G3: ravnica vs alara (Guildscorn Ward — ochrona po jakości; Infectious Horror)
- [ ] G4: zendikar vs worek-dziki (Roiling Regrowth, Cathartic Reunion)
- [ ] G5: tarkir vs forgotten-realms, inny profil/seed (saga III + trigger tury)
- [ ] G6: mirrodin vs ravnica (echo — koszt na starcie upkeepu)
- [ ] G7+: dogrywki pokrycia kart, których nie widziano w G1–G6
- [ ] Przegląd DETEKTORÓW + ręczny grep nazw kart Batchu 46 w transkryptach
- [ ] Naprawy: każde znalezisko osobnym commitem (root cause + test RED→GREEN)
- [ ] Rebuild + weryfikacja v2/v3 na tych samych seedach → 0 zgłoszeń
- [ ] Dokumentacja: ten plan (wynik), PROJECT_STATE, opis PR #70, LESSONS

## Ryzyka / pułapki (z LESSONS + ENVIRONMENT)

- **Tester gra na ARTEFAKCIE** — po każdej naprawie `npm run build` przed
  weryfikacją (M180), inaczej weryfikujesz stary kod.
- **Detektor musi działać w OBU trybach** (`--quiet` i `--snapshot-every 1`) —
  rozjazd wyników to błąd detektora (M99/M104).
- **Zgłoszenie detektora to hipoteza, nie werdykt** — każde potwierdzić
  w kodzie; część to artefakty jsdom (brak CSS/obrazów).
- **Ograniczenie ≠ usprawiedliwienie** — jeśli tester czegoś nie rozegra
  (`[STOP] brak akcji`), naprawiamy TESTER, nie omijamy talii.
- **L50/L51**: nowe efekty Batchu 46 muszą mieć wycenę w heuristic-bocie —
  brak wyceny widać w partii jako losowe zagranie.
- **Reset workspace** (9× w historii) — commit + push po każdym zielonym kroku.
- Polskie znaki: edycje plików tekstowych przez `python3`, nie `edit_file`.

## Wynik

(uzupełniany w trakcie)
