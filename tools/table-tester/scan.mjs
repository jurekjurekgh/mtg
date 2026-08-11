// Narzędzie audytowe: skanuje transkrypty żywego testera pod kątem podejrzanych
// etykiet (patterns). Wypisuje plik:line:match dla każdego trafienia, z wierszem.
import fs from 'fs';

const patterns = [
  { re: /\?/, label: '? znak zapytania' },
  { re: /undefined/, label: 'undefined' },
  { re: /NaN/, label: 'NaN' },
  { re: /\bnull\b/, label: 'null' },
  { re: /\[STOP\]/, label: 'STOP' },
  { re: /efekt\b/, label: 'surowy "efekt"' },
  { re: /cel: /, label: 'cel:' },
  { re: /\bplayer\b/, label: 'surowy "player"' },
  { re: /(any_target|resolve_|_permanent|damage_to_|create_token|cast_spell)/, label: 'surowy slug' },
  { re: /Trigger: /, label: 'Trigger:' },
  { re: /zadaje 0 obrażeń/, label: 'zadaje 0' },
  { re: /\d+ karty/, label: 'karty (plural? sprawdź odmianę)' },
  { re: /\d+ kart\b/, label: 'kart' },
  { re: /1 kartę/, label: '1 kartę' },
  { re: /choroba/, label: 'choroba' },
  { re: /NaN|\[object Object\]|\[object /, label: '[object]' },
  { re: /(obiekt|OBJECT|Object_)/, label: 'obiekt' },
  { re: /rzuca .*→ /, label: 'rzuca →' },
  { re: /wskazuje \?/, label: 'wskazuje ?' },
  { re: /cel: \?/, label: 'cel: ?' },
  { re: /: \?/, label: ': ?' },
  { re: /mieli \d+ kart[^ę]/, label: 'mieli kart' },
];

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('użycie: node scan.mjs <plik1> [plik2 ...]');
  process.exit(1);
}

let total = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^  (RĘKA|MOJE POLA|POLA WROGA|STOS|AKCJE|LOG|>>|\[modal|\[bot-move)/.test(line)) continue;
    for (const p of patterns) {
      const m = line.match(p.re);
      if (m) {
        total++;
        console.log(`${f}:${i + 1} [${p.label}] ${line.trim().slice(0, 220)}`);
        break; // jedna etykieta na wiersz dla czytelności
      }
    }
  }
}
console.log(`\n=== ${total} trafień w ${files.length} pliku(ach) ===`);
