# Handoff batch 67 — kolekcja 369–398 (stan po etapach E0–E0c)

Plan: `docs/plans/PLAN_2026-10-14-batch67-kolekcja-369-398.md` (etapy E0–E8,
polityka zatrzymania: commit + push po każdym etapie).

## Zamknięte

- **E0** — 10 snapshotów Scryfalla z rulingami (`docs/cards/scryfall-*.json`):
  improbable-alliance (eld/193), spellkeeper-weird (war/69), sentry-bot
  (pip/24), artful-maneuver (dtk/4), battlefield-butcher (bro/86),
  wolfs-quarry (eld/184), kuldotha-ringleader (mbs/70), cancel (ala/33),
  render-speechless (sos/220), intrepid-tenderfoot (eoe/193).
- **E0b** — plan batcha (ten sam plik co wyżej).
- **E0c** — strażnicy snapshotów dopuszczają 10 nowych sierot JAWNIE, dopóki
  definicje nie wejdą falami (E1–E6): `audyt-katalog-dane-vs-snapshoty`
  (582 → 592, lista `OSIEROCONE_SNAPSHOTY`), `druki-druga-strona-i-uuid-obrazu`
  (D/14) i `obiekty-wsparcia-poza-rejestrem` (OW/6) — we wszystkich trzech ten
  sam blok `SNAPSHOTY_BATCH67_W_TOKU` z komentarzem. **Przy każdej fali
  implementacyjnej usunąć z tych list slugi zaimplementowanych kart.**

## Stan repo / stan sandboxa

- Branch `arena/aadcf997-mtg`; w tej iteracji sandbox **został odtworzony**
  (`.git` cofnął się do `7bd1fcf`, pliki z końca poprzedniej sesji). Naprawa
  wykonana procedurą z rejestru błędów: backup plików → `git fetch` →
  `git reset --hard origin/arena/aadcf997-mtg` (3d63d65) → ponowne commity
  E0/E0b na właściwej bazie. Bez force pusha; nic nie zginęło.
- `.git/info/exclude` przywrócony (`.arena/`).

## Następny krok (E1) — fala A na istniejących mechanikach

Cancel (`counter_spell` istnieje, wzorzec: karta przy `card-data.js:1650`),
Intrepid Tenderfoot (`{3}`: +1/+1, tylko sorcery), Artful Maneuver
(`rebound: true` — wzorzec przy `card-data.js:7265`), Spellkeeper Weird
(`{2},{T},Poświęć:` zwrot instant/sorcery z własnego grobu — wzorzec
`card-data.js:7842`), Render Speechless („reveals their hand → wybór nie-lądu
→ discard" — wzorce przy `card-data.js:6400/8210/9601` + dwa +1/+1 na
„up to one target").

**CSV razem z falą:** każda fala dopisuje swoje wiersze do
`tools/collection-art-ids.csv` (artId + nazwa + plan 1:1) — strażnik
`test/proweniencja-katalogu.test.js` nie przepuści definicji bez wiersza
kolekcji (ADR 0029 §4). E7 to już tylko generator talii + raport.

Zasady bez zmian: definicje + `test/real-cards-batch67.test.js` (RED → GREEN),
scenariusz legalny i nielegalny na kartę, brak nazw kart w kodzie silnika
(ADR 0002), kolekcja rośnie tylko z tego batcha (ADR 0029). Bramy po fali:
`node --test test/real-cards-batch67.test.js`, `npm test`, na koniec `all`.
