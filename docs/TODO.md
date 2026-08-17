# Lista TODO (jedno miejsce, kolejność = priorytet)

Zasada: **na górze jest to, co robimy jako następne.** Nowe zadania od
właściciela wchodzą na górę; skończone znikają z listy (ślad zostaje
w `docs/PROJECT_STATE.md`, planie sesji i commicie).

Ten plik jest trwałą pamięcią kolejki — czat i kontekst sesji bywają
kompaktowane, repo nie.

## 1. Karty (kolejka właściciela)

**Batch 34 (lista właściciela 2026-08-17) — 1 karta do dokończenia.**
Dziewięć z dziesięciu zrobione (M113 + M114 Chronic Flooding + M115 Krumar
Initiate); ostatnia wymaga NOWEJ, ciężkiej mechaniki:

1. **Cuombajj Witches (CMR)** {B}{B} 1/3 — „{T}: deals 1 damage to any target
   **and 1 damage to any target of an opponent's choice**". Brakuje:
   blokującej decyzji PRZECIWNIKA w środku rozstrzygania zdolności
   (nowy `pending…`, priorytet, oferta, boty, log).

Do dokończenia przy okazji batcha 34: prawdziwe adresy ilustracji ze Scryfalla
dla sześciu kart (`imageUri: null` — Academy Journeymage, Sterling Keykeeper,
Chained Throatseeker, Circle of the Land Druid, Fledgling Imp, Chronic Flooding). Lokalne
ilustracje z arkusza właściciela (artId) działają, brakuje tylko fallbacku.

## 2. Silnik i reguły

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

- **Sondowanie kroku kolejności w wizardzie surveil** — decyzja pośrednia nie
  ma jeszcze klucza sondy (komenda nie jest wtedy jeszcze znana).
- **Rozdzielanie obrażeń (damage wizard)** — poza osią „noop" (jak walka
  przed M112).
- **Sprzątanie kontraktu `addObject`** (lekcja L21: pola spoza kontraktu giną
  po cichu — dorobić walidację albo jawną listę pól).

## 5. Dług dokumentacyjny

- Przegląd starych wpisów `notes` (58 kart) — czy któryś nie opisuje jednak
  luki wobec Oracle (wtedy przenieść do `limitations` i naprawić).
