# PLAN 2026-08-31 — M264: kontynuacja M263 — Żywy Tester na puli niewidzianej (PR #90)

**Sesja:** `arena/01a0577f-mtg` (ciąg dalszy, PR #90). **Baza:** `a2b0f88`
(domknięcie M263). **Prompt:** „kontynuuj\" → ADR 0021: dopełnienie Etapu 2
planu M263 — **2.1** Żywy Tester (pula: forgotten-realms + karty M258–M262),
**2.2** klasy → root cause + detektory + testy, w miarę czasu **2.3** (polowanie
na CR, np. DFC-kopia). **Zasady:** ADR 0020/0021/0022/0016 — bez zmian.

## Pomiar startowy

- [x] `npm test` (szybki rdzeń): **3876/3876 pass**, 0 fail (~150 s).
- [x] `npm run build`: OK, `dist/mtg-table.html` = **56 modułów / 2985.8 kB**.
- [x] `tools/table-tester`: jsdom zainstalowany; `--list-decks` 22 talie; remote
      w synchronizacji (`FETCH_HEAD` = HEAD), PR #90 OPEN (10 commitów).

## Etap 2.1 — Żywy Tester (osie 1–4 z `TESTER_STOLU.md`)

Pula kart „niewidzianych\" dla tej rundy (decyzja planu M263, 2.1):
forgotten-realms (deck gracza, ~30 kart, w tym Manor Gate z `chooseColor`
— test Z1, Cloak of the Bat/cloak) + karty M258–M262 w innych taliach:
ravnica (Courage in Crisis — B1/sorcery; Veiled Ascension — cloak),
dominaria-wu (Wormfang Newt — B4; Serra's Embrace — ward aury W11),
zendikar (Healer of the Glade — B5; Fertile Thicket; Roiling Regrowth),
worek-mroczny (Enter the Enigma — B2), mirrodin-wu (Porcelain
Legionnaire — B3), worek-dziki (Lodestone Needle — B6; Spreading
Insurrection — storm), mirrodin-brg (Bone Shredder — B7; Ruthless
Invasion), theros (Pyxis of Pandemonium).

Matryca (profile `explorer/greedy/defensive/impatient/random`, seedy 4001+,
`--steps 400`, transkrypty do `tmp-audyt-m264/` — poza repo):

| # | talia (gracz ↔ bot) | profil | seed |
|---|---|---|---|
| 1 | forgotten-realms ↔ ravnica | greedy | 4001 |
| 2 | forgotten-realms ↔ ravnica | explorer | 4002 |
| 3 | dominaria-wu ↔ zendikar | defensive | 4003 |
| 4 | dominaria-wu ↔ zendikar | random | 4004 |
| 5 | worek-mroczny ↔ theros | greedy | 4005 |
| 6 | theros ↔ worek-mroczny | explorer | 4006 |
| 7 | mirrodin-wu ↔ mirrodin-brg | defensive | 4007 |
| 8 | worek-dziki ↔ mirrodin-brg | random | 4008 |
| 9 | forgotten-realms ↔ zendikar | impatient | 4009 |
| 10 | ravnica ↔ dominaria-wu | greedy | 4010 |

Lektura KAŻDEGO transkryptu (osie 1–4 + karta vs Oracle), detektory
automatycznie; każde podejrzenie najpierw weryfikacja w
`docs/cards/scryfall-*.json` / API (L57) i w kodzie, zanim uznane za błąd.

## Etap 2.2 — klasy → root cause + detektory + testy

Znaleziska 2.1 (jeśli będą): naprawa u root cause, test regresyjny
(NAJPIERW RED — L61), detektor jeśli nowa klasa (wzorzec M54/M65/M73),
osobny zielony commit per krok.

## Etap 2.3 — dopełnienie M263 (w miarę czasu)

- DFC: kopia frontu DFC (`transformTo`/`frontFaceId` przez realną ścieżkę
  `putCard`/`setupCardMatch` — helper z `/tmp/probe-dfc-copy-front.mjs`
  był niekompletny, nie wnioskować).
- If nic: skan rodziny ward (koniec), madness/exile bez zmian.

## Zasady

- Każdy samodzielnie zielony krok = osobny commit + push (ADR 0020 C/D:
  przed pushem `git log --oneline -3` + porównanie z `FETCH_HEAD`).
- Transkrypty NIE do repo (konwencja M253; strażnik pilnuje).
- `edit_file` psuje polskie znaki → pliki z polską treścią przez python3.
- Mutacje: kopia bazowa przez `git show HEAD:…` (L34).
- Pełny B0/benchmark: tylko na komendę właściciela (ADR 0018/0025);
  szybki profil `test:slow` OK (jeśli zmiana dotyka bota).

## Kolejność commitów

1. Ten plan (+ ewentualne drobne aktualizacje) — osobny commit na starcie.
2. Znaleziska 2.1 → fix → test → commit (per zielony krok).
3. Domknięcie: README/liczby (jeśli się zmieniły), `PROJECT_HISTORY.md`,
   handoff, opis PR #90.
