// Verify the deck rows (README) touched by PR #177 and Batch 72 against
// generated decks, and that the audit trail of #177 does not rot away.
//
// 2026-11-09 (zgłoszenie właściciela „README to śmietnik z historią"): README
// przestał być dziennikiem sesji — narracja o PR #177 przeniosła się do
// `docs/PROJECT_HISTORY.md`. Ten pin pilnuje więc tego samego, co wcześniej,
// tylko w miejscu, gdzie odsyłacze teraz żyją: raport/plan/handoff audytu #177
// muszą istnieć ORAZ być przywołane w historii projektu. Nie osłabiamy
// wymagania — zmieniamy adres, bo zmienił się nośnik (L56: dokument, który
// znika z drzewa bez śladu, to utrata dowodu).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const names=['alara','dominaria-wrg','forgotten-realms-br','forgotten-realms-wug','ixalan','kaldheim','srodziemie','tarkir-wur','theros','warhammer-ubr','wiedzmin-wur','worek-basni','worek-dziki','worek-legend','worek-mroczny'];
const readme=fs.readFileSync('README.md','utf8');
const basics=new Set(['Plains','Island','Swamp','Mountain','Forest']);

test('A47: wiersze zmienionych talii zgadzają się z prawdziwymi plikami',()=>{
 for(const name of names){
  const line=readme.split('\n').find(l=>l.startsWith(`| \`${name}\` |`));assert.ok(line,name);
  const cols=line.split('|').map(x=>x.trim());const advertised=cols.slice(4,7).map(Number);
  let total=0,basic=0;for(const raw of fs.readFileSync(`decks/${name}.txt`,'utf8').split('\n')){
   const line=raw.trim();if(!line||line.startsWith('#'))continue;
   const m=/^(\d+)x\s+(.+)$/.exec(line);assert.ok(m,`${name}: ${line}`);const n=Number(m[1]);total+=n;if(basics.has(m[2]))basic+=n;
  }
  assert.deepEqual(advertised,[total,basic,total-basic],name);
 }
});
test('A47: odsyłacze do raportu audytu #177 żyją w historii projektu',()=>{
 // README (2026-11-09) jest wizytówką: bez dziennika sesji i bez datowanych
 // odsyłaczy. Ślad audytu #177 trzyma `docs/PROJECT_HISTORY.md`, a pliki
 // muszą istnieć na dysku — inaczej historia wskazuje donikąd.
 const historia=fs.readFileSync('docs/PROJECT_HISTORY.md','utf8');
 for(const path of ['docs/setup/HANDOFF_2026-11-01-audyt-pr177.md','docs/plans/PLAN_2026-11-01-audyt-pr177.md','docs/audits/AUDYT_PR177_2026-11-01.md']){
  assert.ok(historia.includes(path),`historia nie przywołuje ${path}`);
  assert.ok(fs.existsSync(path),path);
 }
 assert.ok(!/\bPR #177[^\n]*\(docs\//.test(readme),'README nie jest dziennikiem — bez odsyłaczy sesyjnych');
});
