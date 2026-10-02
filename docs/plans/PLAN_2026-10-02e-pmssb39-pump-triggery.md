# Plan PMSSB-39 — payoffy z efektem tymczasowym (prowess, Devotee, Kulrath) (2026-10-02e)

Zadanie właściciela: po PMSSB-38 („jedna rzecz nadal bez wyceny: triggery z efektem tymczasowym … potrzebny jest model walki”) — „Tak, chcę”.

## Diagnoza

`boardCastPayoffValue` pomija efekty tymczasowe, bo wartość +P/+T do końca tury nie jest wartością permanentu: zależy od okna (walka / główna 1 przed atakiem / reszta) i od tego, czy stwór w ogóle zaatakuje. Karty w katalogu: Jeskai Windscout (prowess: `you_cast_noncreature_spell`), Jeskai Devotee (`you_cast_second_spell_each_turn`), Kulrath Mystic (`when_you_cast_spell` z warunkiem MV ≥ 4, `buff_creature_until_end_of_turn`). Trigger z warunkiem był pomijany w całości.

## Model (reuse istniejących miar, L41/L48 — zero nowych równoległych symulacji)

1. Okno walki (`combatTrickWindow`): `pumpChangesOutcome` (symulacja CR 510, ta sama co pump z czaru) → `tempPumpTrickValue` (18, skala tricku z czaru M146) + moc; brak zmiany wyniku → 0.
2. Własna główna 1, nosiciel może atakować i polityka ataku bota (`attackIntendsCreature`, ta sama co deklaracja) go wybiera — albo wybierze dopiero po pumpie (pump „odblokowuje” atak): bez możliwego blokera = obrażenia w twarz (`tempPumpFaceDamageValue` 4/pkt mocy, skala drainu ETB); z blokerem: `tempPumpBlockOdds` (0,5) dzieli wartość między trik (symulacja przeciw każdemu możliwemu blokerowi) a brak bloku (twarz).
3. Reszta okien (druga główna, nosiciel chory, tura wroga bez walki): 0.
4. Warunki triggera rzutu z karty rzucanej (`spellManaValueAtLeast`, `spellColorsInclude`, `spellIsColorless`); nieznany warunek = poza modelem. Zdarzenie `when_you_cast_spell` (każdy rzut).
5. Wynik × `boardPayoffWeight` jak pozostałe payoffy. Trzy nowe pokrętła.

## Granice

Pump z dynamicznym X, efekty skierowane (`targetIndex`) i `buff_attacking_creatures` poza modelem; vigilance z Kulratha nie jest wyceniany; brak prognozy blokady wroga poza `tempPumpBlockOdds`.

## Weryfikacja

Sonda PRZED/PO, `test/audyt-pmssb39-pump-triggery.test.js` (czerwone na starym kodzie), golden-master, `run-tests all`, build.
