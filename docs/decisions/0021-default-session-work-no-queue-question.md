# ADR 0021: Domyślna praca sesji — nie pytaj właściciela o kolejkę

- **Status:** Zaakceptowana
- **Data:** 2026-08-18
- **Decydenci:** właściciel

## Kontekst

Sesja startuje z `main` i tekstu pierwszego promptu (ADR 0013). Gdy prompt
brzmi „kontynuujemy”, „działaj”, „jeśli masz pytania — pytaj”, agent
wielokrotnie **zatrzymywał się i pytał, czym się zająć**.

To jest błąd procesu, nie brak zadania. Dokumentacja już mówi:

- zadania nie biorą się z `docs/backlog.md` (to pomysły, nie kolejka);
- obowiązuje ADR 0020: PR → audyt poprzedniego PR → inkrementalne commity;
- źródłem prawdy jest repozytorium, nie czat.

Brakowało **czwartej, twardej reguły**: co robić, gdy prompt **nie nazywa**
konkretnego tematu. Lukę wypełniało pytanie do właściciela — czyli przerzucenie
na niego pracy, którą dokumentacja miała zdjąć.

Zdanie „jeśli masz pytania, pytaj” oznacza wyłącznie pytania **blokujące**
(nieodwracalna decyzja, nowy powód `limitations`, pełne B0). Nie oznacza
„poproś o listę zadań”.

## Decyzja

**Wejście sesji.** Jedyny plik startowy, niezależny od wiadomości w czacie,
to `AGENTS.md`. Jego pierwsza sekcja (§0) nakazuje przeczytać: ten plik →
**wszystkie** ADR-y (w tym 0020) → `docs/LESSONS.md` →
`docs/setup/ENVIRONMENT.md` — zanim agent napisze cokolwiek do właściciela.
ADR 0020 pozostaje źródłem tego, **co sesja robi**. Ten ADR nie zastępuje
0020; zamyka lukę „nie przeczytałem, więc pytam”.


Gdy pierwszy prompt **nie wskazuje** konkretnego tematu (batch kart, zgłoszenie
z rozgrywki, „odznaka”, konkretny plik/PR), sesja **nie pyta o kolejkę**.
Wykonuje pętlę domyślną, w tej kolejności:

1. **PR na starcie** (ADR 0020 A).
2. **Audyt poprzedniego scalonego PR** (ADR 0020 B / 0016) — plik w
   `docs/audits/`, wynik w opisie PR. Znalezione błędy naprawia od razu.
3. **Niedokończony plan na `main`.** Najnowszy `docs/plans/PLAN_*.md` z
   nieodhaczonymi kryteriami ukończenia — podejmij go w miejscu urwania.
4. **Pętla jakości projektu**, dopóki właściciel nie wskaże czegoś innego:
   (a) audyt Żywym Testerem z perspektywy gracza + naprawy u root cause +
   nowe detektory na znalezione klasy; (b) polowanie na niezgodności z CR
   (odznaka) innymi ścieżkami niż poprzednia sesja; (c) **nie** wymyślaj
   nowego batcha kart — karty tylko z listy właściciela w czacie albo z
   niedokończonego planu, który już tę listę zawiera.

Pytanie do właściciela jest dozwolone wyłącznie gdy dalsza praca jest
**zablokowana** decyzją, której agent nie może podjąć sam (nowy powód
`limitations`, zmiana architektury, pełna macierz B0, sprzeczność ADR).

### Nadrzędność

Ta decyzja jest nadrzędna wobec handoffów, backlogu i grzecznościowego
„pytaj, jeśli nie wiesz”. Nie jest nadrzędna wobec ADR 0020 (PR / audyt /
inkrementalne commity nadal pierwsze).

## Konsekwencje

### Pozytywne

- Sesja nie marnuje pierwszej tury na ankietę.
- Właściciel nie musi za każdym razem wymyślać zadania, żeby agent zaczął.
- „Kontynuujemy” ma jedno, sprawdzalne znaczenie.

### Koszty i ryzyka

- Agent może wziąć plan, który właściciel chciał odłożyć. Koszt niski:
  PR nie scala się sam; właściciel zamyka lub przekierowuje w czacie.
- Pętla jakości bez nowej listy kart jest zamierzona — katalog nie rośnie
  z inwencji sesji.

## Rozważone alternatywy

- Zostawić „pytaj, gdy niepewny” — to właśnie produkowało ankietę o kolejkę.
- Traktować backlog jako kolejkę — odrzucone przez właściciela 2026-08-17.

## Powiązania

- ADR 0013 — izolacja sesji
- ADR 0016 / 0020 — audyt i tryb sesji
- ADR 0018 — B0 tylko na komendę
- `AGENTS.md` § obowiązkowy tryb sesji (reguła 4)
- `docs/LESSONS.md` L49
- `docs/backlog.md` — nie jest kolejką
