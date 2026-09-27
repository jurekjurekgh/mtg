# Zapis komentarzy AI do Arkusza Google — instrukcja wdrożenia

Aplikacja sama dopisuje każdy udany komentarz AI jako wiersz do Twojego
arkusza. Błędy (sieci, modelu, klucza) NIGDY nie są wysyłane. Jeden tryb
AI = jedna karta w arkuszu (`lore-bot`, `player-bot`, …) — karty tworzą
się same z nagłówkiem `ts | game_id | turn | model | chars | response`.

Całość robi się RAZ, ~10–15 minut, z Twojego konta Google.

---

## Krok 1 — nowy Arkusz

1. Wejdź na <https://sheets.google.com> i utwórz **pusty arkusz**
   (przycisk „+”, albo bezpośrednio <https://sheets.new>).
2. Nazwij go np. `MTG AI log` (lewy górny róg).
3. Z paska adresu przeglądarki **skopiuj ID arkusza** — to długi fragment
   między `/d/` a `/edit`, np.:
   `https://docs.google.com/spreadsheets/d/`**`1AbC…xYz`**`/edit`
   → ID to `1AbC…xYz`. Zapisz je w notatniku na chwilę.

## Krok 2 — wklejenie skryptu

1. W arkuszu wybierz **Rozszerzenia → Aplikacje Apps Script**.
   Otworzy się edytor skryptu (nowa karta) z gotowym plikiem `Code.gs`
   zawierającym przykładową funkcję — **całą jego zawartość usuń**.
2. Otwórz plik **`docs/ai-appscript/Code.gs` z tego repozytorium**
   (np. na GitHubie: `docs/ai-appscript/Code.gs`, przycisk „Raw” → kopiuj),
   wklej całość do edytora zamiast usuniętego przykładu.
3. Na górze wklejonego kodu znajdź linię:
   `const SHEET_ID = 'WSTAW-ID-ARKUSZA';`
   i wstaw między cudzysłowy **ID z kroku 1**.
4. Zapisz: **Ctrl+S** (przy pierwszym zapisie edytor poprosi o nazwę
   projektu — wpisz np. `MTG AI log`).

## Krok 3 — wdrożenie jako aplikacja internetowa

1. W edytorze skryptu (prawy górny róg): **Wdróż → Nowe wdrożenie**.
2. Kliknij ikonę koła zębatego przy „Wybierz typ” i wybierz
   **Aplikacja internetowa**.
3. Ustaw dokładnie tak:
   - Opis: np. `MTG AI log v1` (dowolny),
   - **Uruchom jako: Ja**,
   - **Dostęp: Każdy** (wymagane — statyczna strona-aplikacja nie potrafi
     logowania Google; sam URL wdrożenia jest niezgadywalny i działa jak
     klucz — trzymasz go jak pół-sekret, tylko w swojej przeglądarce).
4. Kliknij **Wdróż**. Google poprosi o autoryzację:
   - wybierz swoje konto,
   - zobaczysz „Aplikacja nie została zweryfikowana przez Google” —
     to normalne dla własnego skryptu: kliknij **Zaawansowane**,
     potem **Przejdź do strony … (niebezpieczne)**,
   - kliknij **Zezwól** (skrypt dostaje dostęp tylko do arkuszy).
5. Pojawi się okno z **adresem URL aplikacji internetowej** —
   wygląda tak: `https://script.google.com/macros/s/DLUGI-TEKST/exec`.
   **Skopiuj go** (przycisk kopiowania obok). To najważniejszy artefakt
   całej instrukcji.

> ⚠️ Bierz URL kończący się na **`/exec`**, NIE na `/dev`.
> Wersja `/dev` działa tylko dla Ciebie jako programisty i wymaga
> logowania — aplikacja musi wołać `/exec`.

## Krok 4 — wklejenie URL-a do aplikacji

1. Otwórz aplikację stołu, rozwiń **Konfiguracja AI** (na dole strony).
2. W pole **AppScript URL** wklej URL z kroku 3 i wyjdź z pola
   (zapisuje się sam do localStorage TEJ przeglądarki).
3. Puste pole = zapis do Drive wyłączony (aplikacja w pełni działa bez
   niego — nic nie woła, nic nie zgłasza).

## Krok 5 — test

1. Włącz toggle **AI** (✨) w górnej belce, wybierz tryb i model.
2. Zacznij partię i **dograj do końca dowolnej tury**.
3. Wróć do arkusza: powinna pojawić się karta o nazwie trybu
   (np. `lore-bot`) z nagłówkiem i pierwszym wierszem komentarza.

---

## Diagnostyka (gdy wiersze nie przychodzą)

- **Sprawdź URL**: kończy się na `/exec`? Wkleił się cały, bez spacji?
- **Sprawdź ID arkusza** w `SHEET_ID` (bez spacji, między cudzysłowami).
- **Wykonania**: w edytorze skryptu lewy pasek → **Wykonania**.
  Każde dopisanie to wpis `doPost`. Brak wpisów = aplikacja nie woła
  (zły/pusty URL w konfiguracji). Wpisy z błędem = czytaj komunikat
  (najczęściej zły `SHEET_ID`).
- **Po KAŻDEJ edycji kodu** trzeba wdrożyć od nowa: **Wdróż →
  Zarządzaj wdrożeniami → ✏️ (edytuj) → Wersja: Nowa wersja → Wdróż**.
  Bez tego `/exec` woła STARĄ wersję kodu.
- **Dostęp cofnięty?** Konto Google → Bezpieczeństwo → Dostęp innych firm →
  usuń projekt i przejdź autoryzację z kroku 3 od nowa.
- Aplikacja przy nieudanym zapisie **niczego nie pokazuje** (celowo —
  zapis ma nigdy nie przeszkadzać w grze); ślad jest tylko w konsoli
  przeglądarki (`[ai-drive] …`).

## Prywatność

- URL `/exec` to klucz-zdolność: kto go zna, ten dopisze wiersz do
  Twojego arkusza. Nie publikuj go; trzymaj tylko w swojej przeglądarce.
- Do arkusza trafiają: treść komentarza, model, numer tury, id partii
  i znacznik czasu. Klucz API **nigdy** nie opuszcza Twojej przeglądarki
  (leci wyłącznie do OpenRouter razem z zapytaniem).
