# Przypadki do lekcji z `docs/LESSONS.md`

Ten plik to **archiwum narracji** (Objaw + Przyczyna) dla wpisów, których treść w
`docs/LESSONS.md` jest skondensowana do reguły i strażnika. Powód: rejestr lekcji
waży niemal cały budżet lektury startowej (`test/dokumentacja-budzet-lektury.test.js`,
100k tokenów), a AGENTS.md §0 wprost wyznacza to miejsce na opowieść — nie jest
lekturą obowiązkową, sięga się tu grepem po numerze lekcji.

Reguły NIE mieszkają tutaj: są w `docs/LESSONS.md`, razem ze strażnikami. Numery
wpisów są zachowane 1:1 z rejestrem, więc cytowania w kodzie działają jak dotąd.

## L91 (2026-08-29) — przypadek

**Objaw:** runda 2 Żywym Testerem (18 partii, M256) wyprodukowała 12 komunikatów
„trigger bez efektu (nie było czego wykonać)": Trostani Discordant ×4,
Veiled Ascension ×3, Jyoti, Moag Ancient ×3, Plague Reaver ×1, Chronic Flooding
×1. Dla czterech pierwszych komunikat był NIEPRECYZYJNY — karta nie miała na
kim działać (brak zakrytych stworów, brak cudzych stworów, brak stworów-lądów,
brak innych stworów), a gracz czytał „nie było czego wykonać", czyli komunikat,
który sugeruje usterkę (kardynał 1 z AUDYT_M255).
**Przyczyna:** `resolveTrigger` wnioskował powód z LICZBY nowych zdarzeń
(`producedNothing`). Milczenie ma jednak TRZY źródła: pusty zbiór odbiorców,
brak paliwa (pusta biblioteka przy młynowaniu) i stan już docelowy (CR 701.20b —
tapnięcie tapniętego, M106/Z2). Dotychczasowe rozróżnienie brało pod uwagę dwa
z nich; trzecie („nikt nie pasuje do efektu") było nierozróżnialne od „efekt
wykonał się bez skutku", bo oba nie produkują zdarzeń.

## L106 (2026-08-31) — przypadek

**Objaw (M269):** po „Creatures you control get +2/+2 until end of turn"
kradzież buffowanego stwora NATYCHMIAST kasowała bonus (4/6 → 2/4); buff
ujemny po przejęciu LECZYŁ. CR 611.2c: zbiór obiektów efektu ciągłego ustala
się RAZ, przy rozstrzygnięciu.

**Przyczyna:** `untilEndOfTurnBonuses` (`permanents.js`) miała DWA filtry tej
samej przynależności — zamrożony `objectIds` (M101/B2) i starszy
`object.controllerId === buff.controllerId`. Póki kontrola się nie zmienia,
dają ten sam wynik, więc żaden test nie świecił.
