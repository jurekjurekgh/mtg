# Instrukcja startowa — nowa sesja agenta (Wirtualny Stół MtG)

Poniższy tekst to gotowy prompt do wklejenia przy otwieraniu nowej sesji
Arena na repozytorium `jurekjurekgh/mtg`. Jest samowystarczalny: po wklejeniu
nowy agent ma cały kontekst potrzebny do dokończenia zadania `artId` (FOT/KON)
i uniknięcia pułapek.

---

## Prompt startowy (wklej do nowej sesji)

```
Pracujesz w repozytorium jurekjurekgh/mtg — „Wirtualny Stół MtG" (przeglądarkowy
stół do Magic: The Gathering, jeden plik HTML jako artefakt). To nowa sesja
agentska. Zacznij od `git pull` na main (właściciel właśnie scalił PR #17:
ilustracje realnych kart na stole + infrastruktura FOT/KON) i przeczytaj:
docs/PROJECT_STATE.md, docs/ROADMAP.md, docs/ENGINE_MILESTONES.md (M8–M11),
docs/WORKFLOW.md, docs/BOT_ROADMAP.md, docs/setup/ILUSTRACJE_KART.md,
docs/setup/START_NEW_SESSION_2026-08-02.md.

ZASADY SESJI (twarde):
- Odpowiadaj po polsku, konkretnie. Potwierdzaj plan przed kodowaniem.
- Model sesji: 1 sesja = 1 gałąź = 1 PR. NIGDY nie scalaj PR (właściciel
  scalają sam, metoda Squash and merge). Pracuj tylko na bieżącej gałęzi
  roboczej, pushuj TYLKO do niej.
- Przed każdym commitem: `npm test` i `npm run build` muszą być zielone.
- Determinizm bez Math.random (ADR 0005); Fog of War tylko PlayerView (ADR 0003);
  artefakt stołu = jeden plik HTML (ADR 0011); mechaniki generyczne, bez
  warunków po nazwie karty (ADR 0002).
- Każda karta w 100% mechanik, bez wyjątków (niepełne nieakceptowane — jak się
  nie da, TODO na szczyt PROJECT_STATE).

STAN PO SCALENIU PR #17:
- Ilustracje realnych kart na stole DZIAŁAJĄ (druk Scryfall z `imageUri` w
  src/cards/card-data.js, pobrany i zapisany wcześniej — to dane z repozytorium,
  nie live-pobieranie).
- tools/collection.config.json zawiera `csvUrl` = publicznie opublikowany
  arkusz kolekcji właściciela (Google Sheets CSV). To NIE jest sekret
  (właściciel potwierdził 2026-08-02, że arkusz jest jawny) — jest w repozytorium
  celowo.
- tools/fetch-art-ids.mjs czyta URL z env MTG_COLLECTION_CSV_URL, potem z
  collection.config.json.
- `artId` w src/cards/card-data.js: NADAL 0 wpisów. Tory lokalne FOT/KON
  (./img/<artId>FOT.png, ./img/<artId>KON.png, budowane przez localArtUrl w
  src/table/card-images.js) NIE działają — cicho spadają na Scryfall, bo brak
  artId. To główna luka do zamknięcia.

ZADANIE PRIORYTETOWE: uzupełnij `artId` dla kart realnych z arkusza CSV.
- Narzędzie: `node tools/fetch-art-ids.mjs` parsuje CSV (kolumny zawierające
  'ilustracja' i 'nazwa', case-insensitive), dopasowuje wiersze do kart z
  rejestru po nazwie i dopisuje `artId` (prefiks nazwy pliku z kolumny Ilustracja,
  np. `412FOT.png` → 412; warianty KRA/FOT/KON mają ten sam numer bazowy).
  Zapis idempotentny (ponowne uruchomienie nic nie zmienia).
- NAJPIERW SPRAWDŹ SIEĆ w sandboxie:
    curl -sS -I --max-time 8 https://docs.google.com
  Jeśli wyjdzie SSL_ERROR_SYSCALL / brak połączenia → sandbox NIE ma sieci
  (poprzednia sesja potwierdziła blok na poziomie środowiska, nie modelu).
- GDY SIEĆ DZIAŁA: po prostu `node tools/fetch-art-ids.mjs` (czyta csvUrl z
  configu). Najpierw `--dry-run`, potem bez.
- GDY SIEĆ NIE DZIAŁA (pewnie): poproś właściciela o wklejenie zawartości CSV
  (lub przynajmniej wierszy dla 12 kart realnych) do czatu → zapisz jako plik
  i uruchom `node tools/fetch-art-ids.mjs --dry-run --csv plik`, a potem bez
  `--dry-run`. ALBO właściciel uruchamia narzędzie na własnej maszynie (ma sieć)
  i pushuje zmianę w card-data.js.
- UWAGA: jeśli arkusz właściciela używa innych nagłówków kolumn niż
  'Ilustracja'/'Nazwa', narzędzie rzuci czytelny błąd — wtedy zapytaj
  właściciela o dokładne nazwy kolumn.
- PO UZUPEŁNIENIU: `npm test && npm run build` (test art-ids-tool.test.js
  weryfikuje parser i idempotencję; 342 testy obecnie). Commit + push na
  bieżącą gałąź; otwórz nowy PR (lub rozszerz bieżący).

OTWARTE / ZNANE PUŁAPKI:
1. localStorage: src/table/main.js ma `AUTOSAVE_KEY='mtg-table-autosave-v1'` i
   funkcję `autosave()` używającą localStorage (etap M7c: autosave/wznawianie
   partii). To SPRZECZNE z zasadą „brak localStorage". Decyzja właściciela
   wisiała — NIE rusz tego kodu bez wyraźnego potwierdzenia.
2. B1 bota: zmierzony baseline „przed" (anomalia deck-out na talii
   synthetic-abilities — heurystyka przegrywa 0–100% z botem losowym, bo
   wypala własną bibliotekę). To osobny tor zadaniowy, NIE ten task.
3. Przy wznawianiu B1: /tmp/bench-before.json z poprzedniej sesji NIE przetrwa
   (ephemeral) — zmierz baseline na nowo przez `node tools/benchmark.mjs --json`.

PROCEDURA DLA NOWYCH KART (ADR 0010 §2a): Scryfall JSON → docs/cards/ PRZED
kodowaniem → definicje `supported` → testy legalne i nielegalne → talia decks/
→ mechaniki generyczne w engine → etykiety/logi PL → probe partii botów →
docs i benchmark. Opis PR edytuj przez `gh api PATCH` (nie `gh pr edit`).
```

---

## Notatki dla właściciela (nie do wklejania do promptu)

- Plik `docs/setup/START_NEW_SESSION_2026-08-02.md` jest celowo w repozytorium,
  żeby nowa sesja (startująca z `main` po scaleniu PR #17) mogła go przeczytać
  poleceniem `read_file('docs/setup/START_NEW_SESSION_2026-08-02.md')`.
- Jeśli wolisz, możesz pominąć odczyt pliku i po prostu wkleić powyższy blok
  `Prompt startowy` jako otwarcie nowej sesji — zawiera ten sam kontekst.
- Kluczowe ryzyko: sandbox nowej sesji **prawdopodobnie też nie będzie miał
  sieci** (blok jest na poziomie środowiska, nie modelu AI). Dlatego w
  instrukcji jest ścieżka „wklej CSV / odpal u siebie" — to jedyna pewna droga
  do `artId` niezależnie od sieci sandboxa.
- `artId` to jedyne brakujące ogniwo FOT/KON: kod przeglądarkowy
  (`localArtUrl`) już buduje `./img/<artId>FOT.png` i `./img/<artId>KON.png`
  i sam spada na Scryfall, gdy pliku nie ma. Po dopisaniu `artId` i dodaniu
  plików `./img/<id>FOT.png` + `./img/<id>KON.png` tory zaczną działać.
