/**
 * Odmiana polskich rzeczowników przez liczebnik — JEDNO źródło prawdy dla
 * całego stołu (panel akcji, log, modal „Rozgrywka", kreator talii, kreatory
 * wyboru).
 *
 * Powód wyodrębnienia (uwaga właściciela 2026-09-25b, „znalezione błędy
 * naprawiasz, nie pytasz"): Żywy Tester zgłosił w opisie discover formę
 * „przejrzano 4 kart" — powinno być „4 karty". Winna była nie reguła, tylko
 * GEOGRAFIA: `polishPluralCount` mieszkał w `render.js`, a `session.js` NIE
 * MOŻE importować z `render.js` (render importuje z session — powstałby cykl),
 * więc opis licznika w `describeGameEvent` lepiono ręcznie („N kart"). Ten sam
 * powód dotyczy `deck-builder.js` (3 miejsca). Stąd liść bez zależności:
 * każdy warstwa może go użyć bez tworzenia cyklu (L41: jedno brzmienie w wielu
 * konsumentach, brak równoległej składanki).
 *
 * Reguła językowa (klasa, nie lista kart): 1 → „karta", 2–4 → „karty",
 * 5+ → „kart"; 12–14 → „kart" (mod100), ale 22–24, 32–34… → „karty".
 */

/** Odmiana polska rzeczownika wg liczby: (1 → one, 2–4 → few, 5+ → many). */
export function polishPluralCount(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

