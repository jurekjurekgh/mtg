/**
 * Znaczniki czasu w interfejsie — zawsze w strefie CZYTELNIKA (znalezisko A,
 * 2026-09-17c).
 *
 * Powód istnienia: artefakt jest budowany na maszynie o innej strefie niż
 * gracz (CI/sandbox w UTC), a właściciel czyta w Warszawie (UTC+2) — stempel
 * publikacji zapisany czasem lokalnym maszyny budującej był o 2 h młodszy od
 * zegara na jego ekranie. Data/godzina MUSI więc być liczona dopiero
 * w przeglądarce, z pól LOKALNYCH (`getHours`/`getMinutes`), a nie z
 * `toISOString()` ani `slice()` po ISO (to zawsze UTC).
 *
 * Świadomie bez `toLocaleString`: format „YYYY-MM-DD HH:MM" ma być
 * deterministyczny i niezależny od ustawień regionalnych przeglądarki.
 */

/** ISO (z dowolną strefą) → „YYYY-MM-DD HH:MM" w czasie lokalnym; null dla śmieci. */
export function formatLocalTimestamp(iso) {
  const when = new Date(iso);
  if (!iso || Number.isNaN(when.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} `
    + `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
