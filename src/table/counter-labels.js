/**
 * Polskie nazwy liczników — JEDYNE źródło prawdy dla kafli (render.js)
 * i logu (session.js).
 *
 * B7 (audyt językowy 2026-09-09): mapa mieszkała w render.js, więc log
 * używał SUROWYCH `e.counter` („licznik stun", „licznik shield") — import
 * zwrotny session→render dałby cykl (render importuje z session), stąd
 * wspólny mikro-moduł (jak mana-icons.js). Strażnik kompletności M126
 * (card-sources-guard) czyta ten plik.
 */

export const COUNTER_LABELS = Object.freeze({
  '+1/+1': '+1/+1', '-1/-1': '-1/-1', oil: 'oil', charge: 'charge', lore: 'lore',
  // Diament cz.2: znaczniki-liczniki zdolności po polsku (było surowe
  // „deathtouch"/„lifelink"/„flying" na kaflach).
  flying: 'Latanie', deathtouch: 'Dotyk śmierci', lifelink: 'Więź życia', finality: 'ostateczność',
  // M126/#5 (Żywy Tester): na kaflach świeciło surowe „stun×2" (37 wystąpień
  // w audytowanych partiach) — licznik ogłuszenia z Lodestone Needle. Audyt
  // wszystkich liczników w bazie wykazał też brakujący `level` (Kabira
  // Vindicator). Strażnik w testach pilnuje kompletności tej mapy.
  stun: 'ogłuszenie', level: 'poziom', loyalty: 'lojalność',
  // Batch 48 (Contested Game Ball): licznik punktowy — po piątym artefakt
  // jest poświęcany w zamian za Skarb.
  point: 'punkt',
  // B7: tarcza regeneracyjna (silnikowy licznik `shield`, np. Voice of the
  // Vermin) — na kaflach świeciło surowe „shield"/„1x shield". Silnikowa
  // (spoza bazy kart), więc strażnik M126 jej nie widzi.
  shield: 'tarcza',
});

/**
 * Dopełniacz nazw liczników — po „licznik/liczników" („licznik ogłuszenia",
 * „z 2 licznikami Latania"). Symbole i nazwy tożsamościowe (oil/charge/lore)
 * odmiany nie potrzebują — fallback do COUNTER_LABELS.
 */
export const COUNTER_LABELS_GEN = Object.freeze({
  flying: 'Latania', deathtouch: 'Dotyku śmierci', lifelink: 'Więzi życia',
  finality: 'ostateczności', stun: 'ogłuszenia', level: 'poziomu',
  loyalty: 'lojalności', point: 'punktu', shield: 'tarczy',
});

/** Nazwa licznika w dopełniaczu (log, koszty, warunki, „wchodzi z"). */
export function counterLabelGen(counter) {
  return COUNTER_LABELS_GEN[counter] ?? COUNTER_LABELS[counter] ?? counter;
}
