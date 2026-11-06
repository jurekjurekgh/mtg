# ADR 0032: Wspólny checkpoint ogłoszeń wyzwalaczy

- **Status:** Zaakceptowana
- **Data:** 2026-11-04

## Kontekst

ADR 0031 wąski; CR 603.3b/117.5/704.3 wymagają wyboru i pętli SBA.

## Decyzja

Checkpoint w `accepted()` po instrukcji/płatności: wszystkie zwykłe wyzwalacze, APNAP+wybór, cele/tryby/podziały, Ward drugi przebieg, pętla SBA→trigger→SBA. LKI przy zdarzeniu; płatności odroczone, mana dozwolona; bez dubli/ukrywania; madness/devour/Saga/grupy zachowane. Pole partii do migracji; fingerprint/replay obejmują wybory.

## Konsekwencje

Ryzyko dubli/LKI/płatności; etapy RED/mutacja/bramy.
