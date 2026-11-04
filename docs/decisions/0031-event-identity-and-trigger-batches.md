# ADR 0031: Tożsamość zdarzenia i partia wyzwalaczy

- **Status:** Proponowana
- **Data:** 2026-11-04
- **Decydenci:** właściciel, agent audytowy

## Kontekst

A110/A112/A113: grupowanie „na komendę” i osobne kolejki nie wystarczą. Inwentarz: `../audits/INWENTARZ_ZDARZEN_I_TRIGGEROW_2026-11-04.md`.

## Decyzja

Kierunek do przyjęcia przed zmianą modelu stanu:
1. jednoczesna grupa zdarzeń ma deterministyczny identyfikator; osobne aktywacje/koszty różne;
2. wyzwalacze z grupy trafiają do jednej partii zamykanej przed priorytetem;
3. między graczami aktywny→nieaktywny, wewnątrz gracza jawny wybór przy wielu zdolnościach;
4. identyfikatory i wybory odtwarzalne w replay/fingerprint;
5. migracja etapami: A110, potem A112/A113, bez podwójnych wpisów stosu.

## Konsekwencje

### Pozytywne

- grupowanie niezależne od granicy komendy;
- kolejność jawna i odtwarzalna.

### Koszty i ryzyka

- zmiana stanu, komend, UI/bota i replay;
- ryzyko podwójnych triggerów;
- szerokie regresje.

## Rozważone alternatywy

- lokalne łatki: odrzucone;
- pełna wymiana silnika: odrzucona;
- wspólna partia z identyfikatorem: proponowana.

## Powiązania

ADR 0002/0005/0016/0020/0030; etap 3 roadmapy; A110/A112/A113.
