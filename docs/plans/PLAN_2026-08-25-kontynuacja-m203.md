# Plan sesji 2026-08-25 — kontynuacja pętli jakości po M203

## Zakres

Kontynuacja domyślnej pętli jakości (ADR 0021), bez dodawania kart. Najpierw
rozstrzygnięcie znaleziska #3 z M203, potem audyt Żywym Testerem i naprawy
wyłącznie potwierdzonych problemów.

## Audyt poprzedniego PR — rozpoznanie przed kodowaniem

Poprzedni scalony PR to #74 (M202). Raport `docs/audits/AUDYT_PR74_2026-08-24.md`
i wpis M203 w `docs/PROJECT_STATE.md` dokumentują audyt oraz jego naprawy.
Na starcie tej sesji potwierdzono: repo jest czyste, `HEAD` = baza `main`, a
PR #75 nie istnieje jeszcze; niniejszy plan jest pierwszym commitem sesji.
Audyt M203 zweryfikował mechaniki PR #74 (mana ograniczona drukiem, cele
`opponent`, dodatkowy koszt wygnania) oraz ujawnił Halo Forager, naprawiony w
M203. Nie powtarzamy tych zamkniętych tematów; pozostaje decyzja/diagnoza
znaleziska #3 dotyczącego raportowania ruchów bota.

## Etapy i kryteria ukończenia

1. **Rozstrzygnięcie #3 (tester/UI)**
   - odtworzyć seed 61 i sprawdzić, czy duplikaty wynikają z ponownego
     renderowania modala po „Wznów grę bota", czy z ekstrakcji testera;
   - kryterium: reprodukcja z minimalnym śladem oraz test regresyjny opisujący
     właściwą warstwę; nie zmieniać progów ani `session.js` bez dowodu.
2. **Audyt stołu z perspektywy gracza**
   - uruchomić zbudowany artefakt, dłuższe partie (>=400 kroków tam, gdzie
     potrzebne), różne talie/profile; czytać ręcznie transkrypty w osiach:
     bezsensowne ruchy bota, kompletność logu/modala, ptaszki auto-pass;
   - brak nowych kart i brak pełnego B0 (ADR 0018).
3. **Naprawy potwierdzonych znalezisk**
   - dla każdego: repro → test RED → chirurgiczny fix root cause → test GREEN;
   - aktualizować detektor, jeśli powstaje nowa klasa błędu; każdy zielony
     krok osobny commit + `npm test` + `npm run build` + push.
4. **Domknięcie dokumentacji**
   - raport audytu w `docs/audits/`, aktualizacja `PROJECT_STATE.md` i planu;
   - `npm run test:all`, `npm run build`, szybki benchmark tylko jeśli zmieniony
     bot/oferty; pełny B0 wyłącznie na wyraźną komendę właściciela.

## Ryzyka i pułapki

- Nie mylić duplikatów DOM z duplikacją komendy engine; po aktywacji `{T}`
  sprawdzać legalne oferty i stan, nie sam tekst transkryptu.
- Tester działa na artefakcie po buildzie i może wymagać `npm i` w
  `tools/table-tester`; import `jsdom` musi pozostać leniwy, aby test CLI działał
  bez zależności w CI.
- Egress do Scryfall jest zablokowany; nie pobierać danych kart z sieci.
