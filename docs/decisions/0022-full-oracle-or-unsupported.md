# ADR 0022: Katalog kart — pełny Oracle albo brak wsparcia

- **Status:** Zaakceptowana
- **Data:** 2026-08-20
- **Decydenci:** właściciel projektu (decyzja w review PR #66)

## Kontekst

Polityka M111 (strażnik `test/limitations-guard.test.js`) zdefiniowała pole
`support.limitations` jako „tu NIE gramy pełnego Oracle" i dopuściła trzy
powody ograniczeń. W praktyce powstawała trzecia kategoria: karty
`supported` z odchyłkami od Oracle opisanymi w `notes` słowem „uproszczenie"
(np. Weftblade Enhancer — „each of up to two target creatures" jako jeden
cel). Audyt PR #65 (F4) wskazał to jako niespójność polityki; właściciel
rozstrzygnął jednoznacznie (2026-08-20):

> „Nie ma czegoś takiego jak nie gramy pełnego Oracle. KAŻDA karta ma być
> w 100% zgodna z Oracle albo nieobsługiwana. TO JEST ZASADA nadrzędna."

## Decyzja

1. **Zasada nadrzędna:** każda karta ze statusem `supported` implementuje
   **100% swojego Oracle text** w zakresie reguł obsługiwanych przez engine
   (format 1v1). Karta, której pełnego Oracle nie da się obecnie
   zaimplementować, ma status `unsupported` — nie wchodzi do talii,
   kreatora ani rozgrywki.
2. **`support.limitations` opisuje wyłącznie:** (a) fakty o obiektach
   niegrywalnych z natury (token — nie można umieścić w talii; tylna strona
   karty dwustronnej), (b) fakty formatu (brak strefy dowodzenia w 1v1).
   **Nigdy** odchyłki zachowania karty grywalnej.
3. **`notes` opisują JAK coś działa** (polityka deterministyczna, decyzja
   botów, etykieta UI) — nigdy czego NIE zaimplementowano. Strażnik
   `limitations-guard.test.js` odrzuca w `notes` również sformułowania
   sugerujące lukę wobec Oracle („uproszczenie", „nie obsługujemy" itd.).
4. **Znaleziona odchyłka od Oracle to błąd** do naprawy u root cause
   (priorytet naprawczy), nie wpis dokumentacyjny ani „świadomy dług".
5. Nowa karta wchodzi do katalogu wyłącznie zgodnie z ADR 0010 (dane
   Scryfall, testy) i z pełnym Oracle — częściowe wdrożenie nie ma statusu
   `supported`.

## Konsekwencje

### Pozytywne

- Liczba kart `supported` jest jednocześnie liczbą kart wiernych Oracle —
  bez audytów „które uproszczenia jeszcze żyją".
- `limitations` przestaje być długiem regułowym; zostają tylko fakty
  strukturalne (tokeny, tyły DFC, format).
- Rozstrzygnięcia typu F4 (Weftblade) mają jedną odpowiedź: implementacja.

### Koszty i ryzyka

- Implementacja „całego Oracle" bywa kosztowna (np. wielocelowe triggery
  ETB, specyficzne interakcje CR) — karta może czekać w `unsupported`.
- Szeroko interaktywne karty (kopie, zmiany tekstu) wymagają ogólnych
  mechanik, nie wariantów — dłuższe sesje batchowe.
- Strażnik tekstu `notes` może dać fałszywy alarm na słowie „uproszczenie"
  użytym o polityce UI/UX — dotyczy wyłącznie zachowań regułowych karty.

## Rozważane alternatywy

- Utrzymanie polityki M111 („świadomy dług w limitations") — odrzucone
  przez właściciela: dług regułowy rozrastał się cicho.
- Rozdzielenie statusów `partial`/`supported` — odrzucone: dubluje
  `limitations` i pozwala grać kartami niezgodnymi z Oracle.

## Powiązania

- ADR 0010 (dane reguł kart wg Oracle/Scryfall), ADR 0002 (engine bez
  przypadków specjalnych po nazwie), ADR 0014 (definicje kart w card-data).
- `AGENTS.md` § „Dodawanie kart" (aktualizacja M111), ADR 0021 (pętla
  domyślna), audyt PR #65 (F4) i review PR #66 (decyzja właściciela).
