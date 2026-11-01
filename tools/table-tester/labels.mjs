/**
 * O-5 (audyt PR #176, domknięcie w sesji 2026-10-27c, PR #177) — etykiety akcji
 * w LOGU transkryptu Żywego Testera.
 *
 * Problem: `run-game.mjs` ucinał klikniętą etykietę do 110 znaków
 * (`pick.t.slice(0, 110)`), a od PR #177 etykiety ofert niosą OSTRZEŻENIA
 * doklejone na końcu („… — ponowna aktywacja nic nie zmieni, a koszt
 * (tapnięcie) przepadnie”). Ucięcie wypadało dokładnie w ostrzeżeniu, więc
 * transkrypt kłamał: wyglądało, że tester kliknął zwykłą akcję, choć w panelu
 * widział ostrzeżenie. Weryfikacja tej sesji (O-1) wymagała podniesienia limitu
 * ad hoc — narzędzie nie może zależeć od takiej doraźnej zmiany (L27: najpierw
 * podejrzewaj narzędzie).
 *
 * Reguła: log transkryptu ma nieść CAŁĄ etykietę w rozsądnym limicie, a jeśli
 * limit trzeba przekroczyć — ucięcie musi być JAWNE (wielokropek), nigdy ciche
 * w środku słowa. Wartość dobrana do realnych etykiet panelu: najdłuższa
 * spotykana (aktywacja z ostrzeżeniem stanu + nazwa celu/karty) mieści się
 * w ~260 znakach; 320 zostawia zapas, a chroni transkrypt przed etykietą
 * zbiorczą z listą celów (dziesiątki pozycji).
 */

/** Limit znaków etykiety akcji w logu transkryptu (jawne ucięcie powyżej). */
export const ACTION_LABEL_LOG_CAP = 320;

/** Znak jawnego ucięcia — odróżnia „etykieta krótsza” od „etykieta obcięta”. */
export const ACTION_LABEL_TRUNCATION_MARK = '…';

/**
 * Etykieta akcji gotowa do wpisu w logu: białe znaki zwinięte do pojedynczych
 * spacji (panel renderuje etykiety w kilku liniach — w transkrypcie linia ma
 * być jedną), przycięta do `cap` znaków z JAWNYM wielokropkiem.
 */
export function actionLabelForLog(label, cap = ACTION_LABEL_LOG_CAP) {
  const text = String(label ?? '').replace(/\s+/g, ' ').trim();
  const limit = Number.isInteger(cap) && cap > 0 ? cap : ACTION_LABEL_LOG_CAP;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}${ACTION_LABEL_TRUNCATION_MARK}`;
}
