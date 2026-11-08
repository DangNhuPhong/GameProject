import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../frontend/src/game/KitchenScene.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
// Exercise the actual scene methods without starting Phaser or a browser.
const nearby=source.slice(source.indexOf('    findNearbyItem(p) {'),source.indexOf('    // =====================================\n    // BẢNG ĐƠN HÀNG'));
const interaction=source.slice(source.indexOf('    findInteraction(p) {'),source.indexOf('    handleInteract(p) {'));
const constants=source.match(/const (?:INTERACT_RANGE|PICKUP_RANGE) = \d+;/g).join('\n');
const Methods=new Function(`${constants}\nconst roomId='TEST';return class {${nearby}\n${interaction}}`)();
const p={body:{x:0,y:0},userId:'p1',heldItemId:null};
function scene(itemX=14,shelfX=8){
 const s=new Methods();s.layout={stations:[],shelves:[{id:'meat-shelf',type:'meat',x:shelfX,y:0}]};
 s.stationDefs=[];s.stations={};s.items={floor:{id:'floor',type:'tomato',state:'available',x:itemX,y:0}};
 s.distanceTo=(p,x,y)=>Math.hypot(p.body.x-x,p.body.y-y);
 s.takeIngredientFromShelf=()=>s.action='shelf';s.pickUpItem=()=>s.action='floor';
 return s;
}
let s=scene();let choice=s.findInteraction(p);assert.equal(choice.label,'Take meat');choice.run();assert.equal(s.action,'shelf');
s=scene(6,12);choice=s.findInteraction(p);assert.equal(choice.label,'Pick up tomato');choice.run();assert.equal(s.action,'floor');
s=scene(10,10);assert.equal(s.findInteraction(p).label,'Take meat','Station wins a tie');
s=scene(17,30);assert.equal(s.findInteraction(p),null,'Distant floor item cannot be picked up');
s=scene(16,30);assert.equal(s.findInteraction(p).label,'Pick up tomato','Pickup boundary remains usable');
s=scene(14,30);s.stationDefs=[{id:'grill',x:8,y:0}];s.stations={grill:{itemId:'cooked'}};s.items.cooked={id:'cooked',type:'meat',status:'cooked',state:'on-station'};
assert.equal(s.findInteraction(p).label,'Take cooked meat','Occupied grill beats farther floor item');
s=scene(14,30);s.stationDefs=[{id:'cut',x:8,y:0,chop:true}];s.stations={cut:{itemId:'raw',cutState:'paused'}};s.items.raw={id:'raw',type:'tomato',status:'raw',state:'on-station'};
assert.equal(s.findInteraction(p).label,'Resume chopping','Chopping keeps precedence over taking from same station');
s=scene(12,30);s.items.floor.state='held';assert.equal(s.findInteraction(p),null,'Held items are excluded');
s=scene(14,30);s.plateStation={x:8,y:0};assert.equal(s.findInteraction(p).label,'Take plate','Plate dispenser beats farther floor item');
console.log('Passed 9 interaction scenarios: station/item distance, ties, pickup range, chopping and plates.');
