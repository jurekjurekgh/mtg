# Zapis komentarzy AI do Dokumentu Google — instrukcja wdrożenia

Aplikacja sama dopisuje każdy udany komentarz AI na końcu karty
o nazwie trybu (`lore-bot`, `player-bot`, `observer`, `lore-observer`,
`skit`). Każdy wpis to linia metadanych (tura, model, długość, czas,
partia) + treść komentarza + rozdzielnik. Błędy (sieci, modelu, klucza)
NIGDY nie są wysyłane.

Całość robi się RAZ, ~10–15 minut, z Twojego konta Google.

> Zmiana z Arkusza (AI-R5): Arkusz był niewygodny w czytaniu, więc log
> przeniósł się do Dokumentu. Jeśli wdrażałeś już wersję arkuszową,
> po prostu wykonaj poniższe kroki od nowa (nowy dokument, nowy URL) —
> stare wdrożenie możesz usunąć albo zostawić (aplikacja woła tylko
> URL wpisany w konfiguracji).

---

## Krok 1 — nowy Dokument

1. Utwórz pusty Dokument Google: wejdź na <https://docs.new>
   (albo Docs → „+ Nowy dokument”) i nazwij go np. `MTG AI log`.
2. Z paska adresu przeglądarki **skopiuj ID dokumentu** — to długi fragment
   między `/document/d/` a `/edit`, np.:
   `https://docs.google.com/document/d/`**`1AbC…xYz`**`/edit`
   → ID to `1AbC…xYz`. Zapisz je w notatniku na chwilę.

## Krok 2 — 5 kart (ręcznie, 2 minuty)

Skrypt **nie potrafi zakładać kart sam** (ani Apps Script, ani Docs API
nie mają takiej metody) — robisz to raz ręcznie:

1. W dokumencie pokaż panel kart (jeśli go nie widać: **Widok → Pokaż
   panel kart** albo ikona kart w lewym górnym rogu).
2. Klikaj **„+”** przy kartach i twórz kolejne karty o **DOKŁADNIE**
   takich tytułach (małe litery, myślniki — skrypt szuka po tytule):
   - `lore-bot`
   - `player-bot`
   - `observer`
   - `lore-observer`
   - `skit`
3. Gdy w przyszłości dojdzie nowy tryb, dopisz mu kartę tak samo.

> Gdy karty dla trybu zabraknie, wpis i tak nie ginie — ląduje
> w pierwszej karcie z nagłówkiem „⚠️ Brak karty …”. Załóż kartę,
> a kolejne wpisy pójdą już do niej.

## Krok 3 — wklejenie skryptu

1. W dokumencie wybierz **Rozszerzenia → Aplikacje Apps Script**.
   Otworzy się edytor skryptu (nowa karta przeglądarki) z gotowym plikiem
   `Code.gs` zawierającym przykładową funkcję — **całą jego zawartość usuń**.
2. Otwórz plik **`docs/ai-appscript/Code.gs` z tego repozytorium**
   (np. na GitHubie: `docs/ai-appscript/Code.gs`, przycisk „Raw” → kopiuj),
   wklej całość do edytora zamiast usuniętego przykładu.
3. Na górze wklejonego kodu znajdź linię:
   `const DOC_ID = 'WSTAW-ID-DOKUMENTU';`
   i wstaw między cudzysłowy **ID z kroku 1**.
4. Zapisz: **Ctrl+S** (przy pierwszym zapisie edytor poprosi o nazwę
   projektu — wpisz np. `MTG AI log`).

## Krok 4 — wdrożenie jako aplikacja internetowa

1. W edytorze skryptu (prawy górny róg): **Wdróż → Nowe wdrożenie**.
2. Kliknij ikonę koła zębatego przy „Wybierz typ” i wybierz
   **Aplikacja internetowa**.
3. Ustaw dokładnie tak:
   - Opis: np. `MTG AI log v2 (Dokument)` (dowolny),
   - **Uruchom jako: Ja**,
   - **Dostęp: Każdy** (wymagane — statyczna strona-aplikacja nie potrafi
     logowania Google; sam URL wdrożenia jest niezgadywalny i działa jak
     klucz — trzymasz go jak pół-sekret, tylko w swojej przeglądarce).
4. Kliknij **Wdróż**. Google poprosi o autoryzację:
   - wybierz swoje konto,
   - zobaczysz „Aplikacja nie została zweryfikowana przez Google” —
     to normalne dla własnego skryptu: kliknij **Zaawansowane**,
     potem **Przejdź do strony … (niebezpieczne)**,
   - kliknij **Zezwól** (skrypt dostaje dostęp do dokumentów).
5. Pojawi się okno z **adresem URL aplikacji internetowej** —
   wygląda tak: `https://script.google.com/macros/s/DLUGI-TEKST/exec`.
   **Skopiuj go** (przycisk kopiowania obok). To najważniejszy artefakt
   całej instrukcji.

> ⚠️ Bierz URL kończący się na **`/exec`**, NIE na `/dev`.
> Wersja `/dev` działa tylko dla Ciebie jako programisty i wymaga
> logowania — aplikacja musi wołać `/exec`.

## Krok 5 — wklejenie URL-a do aplikacji

1. Otwórz aplikację stołu, rozwiń **Konfiguracja AI** (na dole strony).
2. W pole **AppScript URL** wklej URL z kroku 4 i wyjdź z pola
   (zapisuje się sam do localStorage TEJ przeglądarki; jeśli był tam
   stary URL wersji arkuszowej — po prostu go nadpisz).
3. Puste pole = zapis do Drive wyłączony (aplikacja w pełni działa bez
   niego — nic nie woła, nic nie zgłasza).

## Krok 6 — test

1. Włącz toggle **AI** (✨) w górnej belce, wybierz tryb i model.
2. Zacznij partię i **dograj do końca dowolnej tury**.
3. Wróć do dokumentu: na końcu karty trybu (np. `lore-bot`) powinien
   pojawić się wpis (meta + komentarz + rozdzielnik).

---

## Diagnostyka (gdy wpisy nie przychodzą)

- **Sprawdź URL**: kończy się na `/exec`? Wkleił się cały, bez spacji?
  Czy to URL NOWEGO wdrożenia (dokumentowego), nie starego arkuszowego?
- **Sprawdź ID dokumentu** w `DOC_ID` (bez spacji, między cudzysłowami).
- **Wykonania**: w edytorze skryptu lewy pasek → **Wykonania**.
  Każde dopisanie to wpis `doPost`. Brak wpisów = aplikacja nie woła
  (zły/pusty URL w konfiguracji). Wpisy z błędem = czytaj komunikat
  (najczęściej złe `DOC_ID`).
- **Wpisy w pierwszej karcie z „⚠️ Brak karty …”** = nie ma karty
  o tytule trybu — załóż ją (krok 2, dokładna nazwa).
- **Po KAŻDEJ edycji kodu** trzeba wdrożyć od nowa: **Wdróż →
  Zarządzaj wdrożeniami → ✏️ (edytuj) → Wersja: Nowa wersja → Wdróż**.
  Bez tego `/exec` woła STARĄ wersję kodu.
- **Dostęp cofnięty?** Konto Google → Bezpieczeństwo → Dostęp innych firm →
  usuń projekt i przejdź autoryzację z kroku 4 od nowa.
- Aplikacja przy nieudanym zapisie **niczego nie pokazuje** (celowo —
  zapis ma nigdy nie przeszkadzać w grze); ślad jest tylko w konsoli
  przeglądarki (`[ai-drive] …`).

## Prywatność

- URL `/exec` to klucz-zdolność: kto go zna, ten dopisze wpis do
  Twojego dokumentu. Nie publikuj go; trzymaj tylko w swojej przeglądarce.
- Do dokumentu trafiają: treść komentarza, model, numer tury, id partii
  i znacznik czasu. Klucz API **nigdy** nie opuszcza Twojej przeglądarki
  (leci wyłącznie do OpenRouter razem z zapytaniem).
