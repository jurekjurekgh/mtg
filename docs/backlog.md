# Backlog — pomysły na przyszłość

**Czym ten plik JEST, a czym NIE JEST** (decyzja właściciela, 2026-08-17):

> „Pełni on rolę bardziej pomysłów, które kiedyś mogą się przydać, a nie
> rzeczy do zrobienia."

To **zbiór pomysłów**, nie kolejka zadań i nie lista zobowiązań. Wpis tutaj
nie znaczy „do zrobienia" — znaczy „gdyby kiedyś okazało się potrzebne, tu
jest rozpoznanie". Nic z tego pliku nie jest podejmowane bez decyzji
właściciela; sesja bierze się za pozycję dopiero, gdy zostanie wskazana.

Zadania na bieżącą sesję przychodzą wprost od właściciela w czacie, a ich
ślad zostaje w `docs/PROJECT_HISTORY.md`, planie sesji i commicie.

Plik jest trwałą pamięcią pomysłów — czat i kontekst sesji bywają
kompaktowane, repo nie.

## 1. Karty (lista właściciela)

_(pusto — batch 34 zamknięty w całości: 10 z 10 kart, M113–M116.
Następna lista właściciela wchodzi tutaj.)_

## 2. Silnik i reguły

- **Z6/Z7 z audytu M119 — do decyzji właściciela:**
  - „Bierzesz mulligan (1)” — liczba bez jednostki (czy zmienić brzmienie na
    „mulligan nr 1 (ręka 7 kart, odłożysz 1)”?);
  - panel oferuje kontrczar we WŁASNY czar gracza (legalne wg CR 115.4, ale
    to pewna strata). Odfiltrowanie odebrałoby legalny ruch — alternatywą
    jest ostrzeżenie w etykiecie („cel: TWÓJ czar”).

- **Ochrona przed jakością** — obsłużone D (obrażenia), E (załączniki),
  B (bloki), T (celowanie). Do przemyślenia przy pierwszej karcie, która tego
  wymaga: ochrona przed jakością dla EFEKTÓW nieceowanych („can't be dealt
  damage by" itd.).
- **Kopie czarów wielocelowych** — działa wybór celu slot po slocie; brak UI
  dla kopii czarów MODALNYCH (kopia dziedziczy tryb oryginału).
- **Puste kolejki decyzji** — przegląd, czy każda blokująca decyzja ma opis
  w logu (lekcja L24) i wycenę w bocie (żeby nie brał zawsze pierwszej oferty).

## 3. Bot

- **B4/B5 z `docs/BOT_ROADMAP.md`** (kolejne progi jakości gry).
- **Wycena decyzji blokujących** poza trybami modalnymi: scry/surveil,
  wybór celu triggera, rozdzielanie obrażeń — dziś w większości „pierwsza
  oferta".

## 4. Stół i Żywy Tester

- **Ergonomia dotykowa pozostałych kontrolek** (po M129, lekcja L35): wizardy
  walki i obrażeń mają już cel dotyku >= 44 px. Do przejrzenia tym samym
  kątem: wizard scry/surveil (chipy `.look-wizard-card`), przyciski stref
  i menu kontekstowe — właściciel gra na telefonie.

- **Sondowanie kroku kolejności w wizardzie surveil** — decyzja pośrednia nie
  ma jeszcze klucza sondy (komenda nie jest wtedy jeszcze znana).
- **Rozdzielanie obrażeń (damage wizard)** — poza osią „noop" (jak walka
  przed M112).
- **Sprzątanie kontraktu `addObject`** (lekcja L21: pola spoza kontraktu giną
  po cichu — dorobić walidację albo jawną listę pól).

## 5. Dług dokumentacyjny

- Przegląd starych wpisów `notes` (58 kart) — czy któryś nie opisuje jednak
  luki wobec Oracle (wtedy przenieść do `limitations` i naprawić).
- ~~Karty dwustronne bez `oracle_text` w pliku źródłowym~~ — **zrobione
  (M118)**: pliki DFC ujednolicone do kanonicznego `card_faces`, a strażnik
  porównuje teraz tekst każdej strony osobno (layout `transform`).
