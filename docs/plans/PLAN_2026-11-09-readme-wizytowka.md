# Plan 2026-11-09 — README jako wizytówka, nie dziennik

Status: etap 1 (ten plan) → w toku



Właściciel: strona główna repo to „śmietnik z wklejoną historią wyjętą ze
środka projektu"; ma być krótka wizytówka i lista decków, nie dziennik prac.

Rozpoznanie (pomiar, nie wrażenie):
- README 353 linie / 51,6 kB, z czego sekcja „Status” (linie 13–123,
  ~37,3 kB, 72% pliku) to jeden blok narracji o sesjach PR #120–#183.
- Blok powiela `docs/PROJECT_HISTORY.md` + `docs/ENGINE_MILESTONES.md`:
  0 z 125 fraz ≥80 znaków i 2,7% shingli 5-wyrazowych jest w tych plikach
  DOSŁOWNIE, ale wszystkie 56 numerów milestone'ów, 24 numery PR i 25
  liczb (testy/kB) w nim występują — czyli treść jest rozpoznawalna,
  tylko opowiedziana po raz drugi i rozbieżnie (README: „544 wspierane
  karty”, katalog: 639 supported + 54 tokeny + 9 back).
- Blok jest dodatkowo przestarzały: punkt zaczepienia 2026-11-02, PR #178,
  choć HEAD to PR #184.
- Strażnicy czytający README: m203/7 (liczności talii), docs-decisions
  (w 800 znakach musi być AGENTS.md), audyt-pr177-a47 (linki raportu #177
  w README + liczności). Żaden nie wymaga narracji statusu.

Etapy:
1. Plan + push (ten commit). Kryterium: PR #184 ma nowy commit, drzewo czyste.
2. Przeniesienie treści, która nie jest dziennikiem, do dokumentów tematycznych:
   - `README.md` §Status (narracja sesji) → git history + skrót w
     `docs/PROJECT_HISTORY.md` (nowa pozycja z linkami do raportu #177);
   - instrukcja cichych testów i „Jak zagrać” → zostają w README (to nie dziennik);
   - szczegóły `snd/` → `docs/setup/DZWIEKI_KART.md` + 3-linijkowy skrót w README;
   - sekcja „Legacy card_viewer” → jedno zdanie w README (pełny zapis już jest
     w `docs/AUDIT_LEGACY_APP.md` i HISTORY);
   - „Najbliższy etap” → krótka, aktualna lista 3 pozycji bez liczb, które
     starszeją (liczby pilnuje HANDOFF + L92).
3. Nowe README (cel ~120–150 linii): nagłówek + 1 akapit, jak zagrać (URL/plik),
   co jest w środku (engine/karty/bot/stół — jedno zdanie na warstwę),
   dokumentacja (linki), talie (tabele bez zmian), uruchomienie, zasady zmian,
   licencja/nazwa. Bez dat, bez numerów PR, bez liczników testów.
4. Weryfikacja: `npm test`, `npm run build`, pełny `test:all`; strażnicy
   dokumentacji; `cr-numery`; liczniki talii bez zmian wiersz po wierszu.
5. Dokumentacja domknięcia: HISTORY, HANDOFF §13, opis PR #184 (PATCH REST).

Ryzyka:
- Strażnik a47/dokumentacja wymaga konkretnych napisów — sprawdzić po edycji;
- usunięcie „liczb” z README nie może ukryć stanu: liczby zostają w handoffie
  i HISTORY (L92: aktualizowane na koniec sesji, nie w środku PR);
- talie: tabela bez zmian (pilnuje jej test), tylko nagłówek sekcji skrócony.
