# ADR 0028: Rulingi WotC — ściąga się je „przy kartce", nie hurtowo

- **Status:** Zaakceptowana
- **Data:** 2026-09-02
- **Decydenci:** właściciel projektu (rekomendacja sesji PR #93 przyjęta w całości:
  „Zgadzam się z twoją rekomendacją co do rulingów. Wpisz to jako decyzję")

## Kontekst

ADR 0022 wymaga, żeby karta w katalogu miała pełny tekst Oracle. Od `a072ae4`
snapshot w `docs/cards/scryfall-<slug>.json` niesie dodatkowo `rulings`
(`tools/fetch-card-rulings.mjs`), a **pusta lista znaczy „ściągnięto, WotC nie ma
nic"** — to rozróżnienie jest istotne: odróżnia stan „sprawdzone" od „nikt nie
patrzył".

Pokrycie jest dziś celowo nierówne: na 441 snapshotów (439 unikalnych nazw)
klucz `rulings` ma 10. Kuszło „dociągnijmy resztę" jest realne, bo narzędzie
gotowe, a część rozstrzygnięć NIE wynika z tekstu karty, tylko z rulinga —
cztery przypadki z tej sesji (Vaan: timingi typu ignorowane przy rzucie z
wygnania; Jolrael: licznik per gracz; Leonin Surveyor: „Start your engines!" to
akcja oparta na stanie; Stifle: mana abilities nie są celem) zmieniły sposób, w
jaki silnik liczy.

Przeszkoda jest rachunkowa, nie ideowa: Scryfall nie ma ścieżki masowej —
`/cards/search` zwraca w odpowiedzi listowej wyłącznie `rulings_uri` (sprawdzone
2026-09-02), a `/cards/<id>/rulings` to jedno żądanie na kartę. W sandboxie
Arena `bash` nie ma egressu (potwierdzone tego samego dnia), więc jedyną drogą
jest `fetch_page` narzędzia agenta: ~429 wywołań i ~429 zmienionych plików,
żeby zdobyć dane, których dla przytłaczającej większości kart po prostu nie ma.

## Decyzja

1. **Nie robimy hurtowego przejścia po katalogu.** O tym, czy karta ma dane,
   decyduje kontakt z kartą, nie lista plików do przetworzenia.
2. **Zasada „przy kartce" (wiążąca):** każda karta dodawana lub odświeżana
   dostaje snapshot z `rulings`, choćby pustą listą. Uzupełnia ADR 0022 i punkt
   kontrolny w `docs/cards/HOW_TO_ADD_CARD.md`; pokrycie rośnie samo, dokładnie
   tam, gdzie ktoś kartę dotyka.
3. **Kolejka priorytetu** dla kart już w katalogu, w tej kolejności:
   (a) karty z niepustym `support.limitations`; (b) karty, których zachowanie
   spinamy nietypowym CR (akcje oparte na stanie, efekty zastępcze, okna,
   grupowanie triggerów); (c) karty wskazane przez ustalenie Żywego Testera albo
   przez audyt odznak. Obsługa: `node tools/fetch-card-rulings.mjs --only=<slug>`
   (w sandboxie żądania wykonuje agent przez `fetch_page`, skrypt normalizuje
   zapis).
4. **Gwarancją jest test pokrycia, nie entuzjazm narzędzia:** gdy kolejka (3)
   zostanie przetworzona, wchodzi test „każda karta z niepustym
   `support.limitations` ma w snapshocie `rulings` (choćby `[]`)". Do tego czasu
   do `npm test` nie wchodzi ŻADEN procentowy próg pokrycia — liczby progowe w
   rejestrze są zmianą umowy (ADR 0019) i muszą wynikać ze stanu faktycznego,
   nie z aspiracji.

## Konsekwencje

- Zostaje ryzyko: karta nietknięta od lat i dwuznaczna może mieć złą semantykę
  bez świadka. Ogranicza je to, że dwuznaczność wychodzi przy pierwszym realnym
  użyciu karty (audyt, benchmark, Żywy Tester) — a punkt 2 każe dopisać ruling
  wtedy, nie „kiedyś".
- `docs/cards/` nie rośnie o ~430 plików w jednym PR, a sesja nie spędza godzin
  na przekładaniu danych, które i tak trzeba będzie zweryfikować co do sensu
  (L66: praca ma budżet, nie tylko ambicję).
- Snapshoty są poza lekturą startową, więc pokrywanie kart `rulings` nie kosztuje
  kontekstu agenta — nie ma pokusy, by „dla świętego spokoju" przenieść treść
  rulingów do `docs/LESSONS.md` albo do ADR-ów.
- Stan pokrycia jest mierzalny jednym poleceniem (`grep -l '"rulings"'
  docs/cards/scryfall-*.json | wc -l`), więc punkt 4 da się wprowadzić bez
  odkopywania decyzji.
