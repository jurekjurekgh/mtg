// Batch 71: porównanie statycznych danych z repozytoryjnymi snapshotami
// (nie jest niezależnym sprawdzeniem bieżącego Oracle ani zachowania silnika).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {createGameState} from '../src/engine/game-state.js';
import {installDeck} from '../src/engine/deck.js';

const ids=['vampire-hounds','curse-of-the-bloody-tome','rumbling-rockslide','ambassador-oak','tail-slash','changeling-berserker','sphinxs-herald','anticipate','trumpet-blast','violent-urge'];
const reg=createCardRegistry();
for(const id of ids) test(`A62: ${id} — treść i cechy batcha w snapshocie oraz prawdziwej talii`,()=>{
 const card=reg.get(id);const snapshot=JSON.parse(readFileSync(`docs/cards/scryfall-${id}.json`,'utf8'));
 const [types,subtypes='']=snapshot.type_line.split(' — ');
 assert.deepEqual(card.types,types.split(' '),id);assert.deepEqual(card.subtypes,subtypes?subtypes.split(' '):[],id);
 assert.deepEqual(card.colors,snapshot.colors,id);assert.equal(card.oracleText,snapshot.oracle_text,id);
 assert.equal(card.power==null?null:String(card.power),snapshot.power,id);assert.equal(card.toughness==null?null:String(card.toughness),snapshot.toughness,id);
 assert.equal(card.imageUri,snapshot.image_uris.large,id);
 const [entry]=createCardDeck({cardIds:[id],ownerId:'p1',registry:reg});
 const s=createGameState({seed:17762,players:[{id:'p1'},{id:'p2'}]});installDeck(s,[entry],{seed:17762});const object=s.objects.get(entry.objectId);
 assert.equal(object.cardId,id);assert.equal(object.zone,'library');assert.equal(object.ownerId,'p1');
 assert.deepEqual(object.types,card.types,id);assert.deepEqual(object.subtypes,card.subtypes,id);assert.deepEqual(object.colors,card.colors,id);
 assert.deepEqual(object.keywords,card.keywords??[],id);assert.equal(object.manaCost,card.manaCost,id);
 if(card.types.includes('Creature')) {assert.equal(object.power,card.power,id);assert.equal(object.toughness,card.toughness,id);}
 assert.deepEqual(object.abilities,card.abilities??[],id);if(card.spell) assert.deepEqual(object.spell,card.spell,id);if(card.aura) assert.deepEqual(object.aura,card.aura,id);
});
