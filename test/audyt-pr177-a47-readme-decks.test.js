// Verify the README rows changed by merged PR #177 against actual decks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const names=['alara','dominaria-brg','kaldheim','srodziemie','tarkir-wur','warhammer-ubr','worek-basni','worek-dziki','worek-legend','worek-mroczny'];
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
test('A47: odsyłacze do raportu audytu w README istnieją lokalnie',()=>{
 for(const path of ['docs/setup/HANDOFF_2026-11-01-audyt-pr177.md','docs/plans/PLAN_2026-11-01-audyt-pr177.md','docs/audits/AUDYT_PR177_2026-11-01.md']){
  assert.ok(readme.includes(`](${path})`),path);assert.ok(fs.existsSync(path),path);
 }
});
