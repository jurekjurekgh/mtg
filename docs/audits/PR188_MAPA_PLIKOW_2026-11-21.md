# Mapa plików — PR #188 (Audyt techniczny, 2026-11-21)

Sesja: `arena/03166ca3-mtg`, PR **#189** (audyt PR #188). Baza: `1dff7d2`
(scalenie PR #188, 2026-11-21 21:42 UTC). Metoda: `gh api pulls/188/files
--paginate` (lista 7 plików) skonfrontowana z `grep -c '^diff --git '`
w `gh pr diff 188` → **7 / 7** zgodne (L190: zagnieżdżone `+diff --git`
w plikach `.patch` nie występują; diff linearny 434 linie, +385/−0).

## Podział na kategorie (7 plików)

| Kategoria | Liczba | Pliki |
|---|---|---|
| `src/` | 1 | `table/render.js` (+5) — jedyna zmiana kodu |
| `test/` | 1 | `audyt-pr187-raw-slug-blitz.test.js` (+90, nowy) |
| `docs/audits/` | 2 | `AUDYT_PR187_2026-11-21.md` (+87), `PR187_MAPA_PLIKOW_2026-11-21.md` (+34) |
| `docs/plans/` | 1 | `PLAN_2026-11-21-audyt-pr187-i-petla-jakosci.md` (+102) |
| `docs/setup/` | 1 | `HANDOFF_2026-11-21.md` (+65) |
| root `docs/` | 1 | `PROJECT_HISTORY.md` (+2) |

## Plik kodowy poddany szczegółowej rewizji (E1)

- **`src/table/render.js`** — jeden wpis w `DYNAMIC_AMOUNT_NOUNS`
  (`instants_and_sorceries_in_your_graveyard: 'instants i sorcery w twoim grobie'`)
  + komentarz kontekstowy. Trzy konsumenci mapy: `describeEffect` (gałąź `damage`
  — dwie ścieżki) i gałąź ETB z celem (linie ~1300/1484/2210).
- **`test/audyt-pr187-raw-slug-blitz.test.js`** — test RED→GREEN na realnym
  `renderTableView` (kafelek ręki), pin negatywny (brak surowego slugu) + pin
  pozytywny (czytelna fraza).

Reszta plików to dokumentacja sesji poprzedniej (audyt/plan/handoff/history) —
weryfikowana merytorycznie w `AUDYT_PR188_2026-11-21.md`.
