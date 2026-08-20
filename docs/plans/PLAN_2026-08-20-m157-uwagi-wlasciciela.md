# PLAN M157 — uwagi właściciela po przeglądzie PR #66 (2026-08-20)

## Kontekst

Decyzje właściciela w review PR #66:
1. **Zasada nadrzędna:** KAŻDA karta obsługiwana = 100% zgodna z Oracle,
   albo nieobsługiwana. Brak „nie gramy pełnego Oracle" → nowy ADR.
2. **F4:** tylko opcja (a) — wielocelowy trigger ETB dla Weftblade
   Enhancer („up to two target creatures"). Priorytet 1.
3. **L28-pattern:** inwentaryzacja WSZYSTKICH typów efektów vs tabele bota
   (nie tylko triggery — też czary/zdolności) — po poprawie błędów A–F.
4. Plik `docs/audits/AUDIT_BATCH38_ZYWTESTER_2026-08-20.md` — jeśli
   uszkodzony, usunąć (przepisać/naprawić).

## Błędy zgłoszone z testów (A–F)

- **A [UI]:** hover (desktop) i tap (mobile) pokazują przez moment syntetyczną
  „niby-kartę" (zaślepkę z pseudo-tekstem). Artefakt początków — usunąć
  fallback w wszystkich torach (scryfall też).
- **B [dane]:** token Bird Soldier bez grafiki Scryfall → zaślepka. Pobrać
  obraz tokenu (ADR 0010 §2a, fetch_page) i wpisać imageUri.
- **C [engine]:** Skilled Animator (CMR): Oracle mówi „for as long as this
  creature remains on the battlefield" — engine czyści animację w cleanup
  (until EOT). Potwierdzone w danych: oracleText karty = linked duration.
  Fix: `animate_linked` trwa do zejścia ŹRÓDŁA (LTB), nie do końca tury;
  interakcja z station (L46) do sprawdzenia.
- **D [UI/engine]:** Lodestone Needle — po zejściu ostatniego licznika stun
  stwór się ODTAPA (logicznie — zaatakował), ale kafel pozostał zatapowany
  (stary render). Naprawić odświeżenie rysowania po zdjęciu licznika.
- **E [UI]:** „Log partii" czyszczony co 4 pełne tury — NIE czyścić w ogóle,
  cały przebieg ma być widoczny.
- **F [UI]:** liczniki trucizny na graczu/bocie — panel w stylu Undercity/
  Daybound z ilustracją „Poison Counter" (Scryfall) i licznikiem.

## Kolejność commitów (każdy zielony: npm test + build)

1. Plan + ADR 0022 (100% Oracle albo nieobsługiwana) + sprawa pliku audytu.
2. A — usunięcie zaślepki hover.
3. B — imageUri tokenu Bird Soldier (+ test).
4. C — animate_linked duration (RED→GREEN + interakcje station/sync).
5. D — rerender po zdjęciu stun countera.
6. E — brak czyszczenia logu.
7. F — panel trucizny (+ test).
8. F4(a) — wielocelowy trigger ETB (engine+widok+boty+UI) — Weftblade 2 cele;
   usunięcie „uproszczenia" z notes.
9. L28 — inwentaryzacja efektów celowanych czarów/zdolności vs 3 tabele bota
   (rozszerzenie strażnika M156 o ścieżki cast_spell/activate_ability).
10. Domknięcie: PROJECT_STATE, handoff, opis PR.

## Ryzyka/pułapki

- A: `buildFace` może być używane też dla kart JAWNYCH bez obrazka (offline) —
  sprawdzić wszystkie call-site przed usunięciem; testy UI (table-card-art).
- C: `clearStatModifiers`/`syncStationKind` (L46) — animacja linked nie może
  zabić progu Station; naprawiać u root cause, patch chirurgiczny.
- F: obraz tokenu Poison Counter — pobrać przez fetch_page (egress blocked).
- F4(a): zmiana modelu pendingTriggerTargets (drugi cel sekwencyjnie) —
  dotyka fingerprint (L16), botów (L48), UI, guardów; cap wariantów (L19).
