# Plan 2026-09-16d — audyt PR #123 + pętla jakości (ADR 0020/0021)

Sesja: „Kontynuujemy projekt." — bez nazwanego tematu → pętla domyślna ADR 0021.
Gałąź: `arena/01a0aac8-mtg`. Bazowy HEAD: `1521ac8` (= main po scaleniu #123).

## Rozpoznanie (stan na start)

- Poprzedni scalony PR: **#123** (2026-09-16, 27 commitów, 85 plików, ~7,8k linii
  diffa): E1–E4 (audyt #121 APPROVE + komentarzowe sprostowania CR G1/G2/G3),
  15e (znalezisko A: wymuszony discard bez modala, L144), 15f/15g (dźwięki
  czarów Web Audio + kolory dźwięku + scryfall bez KON + minima landów z pipów
  + regen 5 talii), oraz trzy odznaki: **Brąz M359** (5 błędów: cleanup
  514.3/514.3a, mentor/backup/delirium…), **Srebro M360** (5: Negate vs
  bestow-Aura CR 702.103b, podtyp Aura, dwa kroki obrażeń przy first/double
  strike, Station LKI, ninjutsu w end_of_combat), **Złoto M361** (5: exploit
  źródłem własnym, Talion's Messenger 2 triggery, land drop z exile w impulsie
  CR 701.18a/b, speed przy stracie życia L146, modalne cele przy rezolucji
  608.2b).
- Handoff 15c opisuje stan po E4 (5514/5514) — NIE obejmuje M359–M361
  (README już podaje 5565/5565; PH ma wpisy 2026-09-16 Srebro/Złoto). Audyt
  sprawdzi spójność domknięcia dokumentacji PR #123.
- Plany 16a/16b/16c (challenge) — wszystkie odhaczone (E6 domknięcia w
  commitach a853d8b→a76e0b4). Niedokończonego planu na `main` brak.
- Otwarte z audytu #123: **O5** (inwentarz ~14 miejsc z cytatami 702.16 o
  niezweryfikowanym KONTEKŚCIE — tekst reguł zweryfikowany literalnie,
  c=Aury, d=Sprzęt, e=prewencja, f=blokowanie), O1–O4 nieblokujące.

## Etapy

- [ ] **E0 — plan sesji** (ten plik; commit 1, PR na GitHubie przed kodowaniem).
- [ ] **E1 — audyt PR #123** (ADR 0020 B / 0016): przegląd każdego zmienionego
  pliku (logika, CR MtG, ADR 0002, RED→GREEN), w szczególności:
  - 15e: `shouldAutoDiscard`/`discardCardsForced` — 11 miejsc kolejkowania,
    hook madness, brak modala przy wymuszonym wyborze całości (L144); triage
    13 breaksów i regen golden-mastera;
  - 15f/15g: `spell-sounds.js`/`topbar-toggles.js` (DOM poza rdzeniem?
    determinizm? FoW milczy?), matryca 49 brzmień, `no-kon`, minima landów
    z pipów + regen 5 talii (m132/ADR 0023/0024 strażnicy);
  - M359/M360/M361: 15 napraw regułowych — każdy z cytatem CR przyRegardless
    testu (ADR 0030), wycena/etykieta/warstwy (L84/L95), generyczność (ADR 0002);
  - spójność domknięcia: handoff vs README vs PH po M359–M361.
  Kryterium: raport `docs/audits/AUDYT_PR123_2026-09-16.md` + werdykt.
- [ ] **E2 — naprawy znalezisk** (jeśli będą) u root cause, z testami
  RED→GREEN; każdy zielony krok = osobny commit + push (ADR 0020 C).
- [ ] **E3 — pętla jakości** (ADR 0021 §4, inna ścieżka niż poprzednia sesja
  = odznaki regułowe): **O5 — weryfikacja kontekstu cytatów 702.16**
  (otwarte zadanie z audytu #123): dla każdego z ~14 miejsc odczytać kontekst
  i potwierdzić/sprostować numer podreguły (ADR 0030: źródło online, nie
  pamięć). Kryterium: każde miejsce rozstrzygnięte (OK / poprawka + commit),
  wpis w PH/raporcie.
- [ ] **E4 — domknięcie sesji**: liczby mierzone na finalnym HEAD
  (`npm run test:all`, `npm run build`), README/PH/handoff, opis PR.

## Kolejność commitów (plan)

1. E0 plan → 2. E1 raport audytu (+ewentualne naprawy dokumentacyjne) →
3. E2 naprawy (osobno per znalezisko) → 4. E3 O5 (poprawki komentarzowe
osobno per plik, jeśli nic nie zmieniają zachowania) → 5. E4 domknięcie.

## Ryzyka i pułapki

- Audyt #123 obejmuje dużo UI (dźwięki/toggle) — testy DOM mają własny
  harness; nie wprowadzać jsdom do testów core.
- Regen talii 15g/C zmienił próbki — porównywać liczby z README (5565/5565,
  quick 82,6%), nie z handoffu 15c (5514/5514 — stan po E4, PR kontynuował).
- ADR 0030: przy O5 każdy cytat CR pobieram ze źródła online (mtg.wiki),
  nie z pamięci; zmiany komentarzowe = zero zachowania (diff weryfikowany).
- L92: liczby „bieżącego stanu" odświeżam dopiero w E4, zmierzone.
- Benchmark pełny tylko na komendę (ADR 0018).
