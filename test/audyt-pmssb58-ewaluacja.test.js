// PMSSB-58: narzędzie nie może uznać pustej/urwanej próby za wynik jakości.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mirrorEval} from '../tools/mirror-eval.mjs';
import {audytRemisow} from '../tools/bot-tie-audit.mjs';
for(const n of [0,-1,NaN,1.5])test(`58/E1: nieprawidłowa liczba prób ${n} jest błędem`,()=>{
 assert.throws(()=>mirrorEval({seedsCount:n}),/niepustej próby/);
 assert.throws(()=>audytRemisow({gry:n}),/niepustej próby/);
});
test('58/E2: brak talii/par nie udaje remisu ani zera błędów',()=>{
 assert.throws(()=>mirrorEval({decks:[]}),/niepustej próby/);
 assert.throws(()=>audytRemisow({pary:[]}),/niepustej próby/);
});
test('58/E3: przerwany audyt remisów nie zwraca zielonej statystyki',()=>{
 assert.throws(()=>audytRemisow({pary:[['dominaria-brg','mirrodin-wu']],gry:1,maxCommands:1}),/Niepełny pomiar/);
});
