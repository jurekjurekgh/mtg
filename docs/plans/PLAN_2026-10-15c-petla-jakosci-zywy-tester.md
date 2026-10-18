# PLAN 2026-10-15c — pętla jakości: Żywy Tester na taliach batcha 67

**Zlecenie:** „kontynuuj” (bez tematu) → ADR 0021, domyślna pętla jakości po
zamknięciu audytu PR #165 (handoff `HANDOFF_2026-10-15b.md`, „Następny krok”).

**Cel:** Żywy Tester na taliach z kartami batcha 67 (dziewięć talii, pierwszeństwo
dla talii spoza `BENCH_DECKS`) oraz na partiach z opłatą energii (Sentry Bot).
Każde znalezisko: RED → GREEN, jeden commit na przyrost, push od razu (ADR 0020).

## Etapy

- [x] 1. Rozpoznanie: talie batcha 67 (`dec6389`) z kartami z inwentarza
      `docs/audits/PMSSB62_BATCH67_2026-10-15.md`; pierwszeństwo: mirrodin-brg,
      ravnica, the-edge, tarkir-wur, wiedzmin-bg, worek-* (poza próbką benchmarku).
- [x] 2. Partie: 8 partii (`67001`–`67008`, profile greedy/random/explorer/
      defensive/impatient/hoarder) + 4 partie celowane na worek-basni (Sentry Bot).
      Transkrypty: `tools/table-tester/.arena/tester/` (poza repo, ignorowane).
- [x] 3. Detektory: 0 zgłoszeń we wszystkich partiach → ręczna lektura (L27).
- [x] 4. Znalezisko F-A (`reflexive_pay`): slug w modalu. RED/GREEN strażnika
      `card-sources-guard` (wieloliniowy literał) + etykieta. Commit `99e57cf`.
- [x] 5. Znalezisko F-B (manifest/morph przeciwnika nazwany w logu, przeciek
      ukrytej informacji, klasa M192/Z1). RED → mutacja → GREEN. Commit `39cafe4`.
- [x] 6. Znalezisko F-C (detektor milczał przy slugu z jednym podkreślnikiem,
      klasa L27). RED 1/4 → GREEN 111/111. Commit `8936102`.
- [x] 7. Pytanie z handoffu: `lose_life` bez `scope` w katalogu — 1 karta
      (Nightshade Harvester, `applyTo: 'event_player'`); bot liczy ją jako
      „each_opponent” zgodnie z 1v1. Bez zmiany kodu.
- [x] 8. Bramy końcowe (domknięte: `cr-numery` OK 2026-10-17, 5834 cytatów; `npm test` i build zielone w PR #166 i w sesji 2026-10-17): `npm test` (8231/8231 po F-C), `npm run build`,
      `node --test test/bot-benchmark.test.js` (przy zmianie kodu bota: nie
      dotyczy — B-1 już zbadany), `node tools/cr-numery.mjs` (weryfikacja cytatów).
- [x] 9. Historia (`PROJECT_HISTORY.md`), `TESTER_STOLU.md` (nowe klasy),
      handoff `HANDOFF_2026-10-15c.md`, opis PR #166.

## Poza zakresem tej sesji (odnotowane)

- Energia / Sentry Bot: żadna z 12 partii nie wylosowała jedynej kopii Sentry Bot
  (`worek-basni`, 1×) — ścieżka opłaty energią pokryta testami jednostkowymi
  (A-2, `test/audyt-pr165-energia-zaplata-atomowa.test.js`), nie grą żywą.
- Kosmetyka: „Ty: Island — biblioteka → biblioteka” przy „reszta na spód”
  (Clone Shell) — czytelniej „na spód biblioteki”. Nie naprawiono.
- L186 (skaner literałów/regex detektora tolerują białe znaki i jeden podkreślnik)
  — do dopisania w `LESSONS.md` po zwolnieniu miejsca w budżecie lektury
  (margines ~540 bajtów).
