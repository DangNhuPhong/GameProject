const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let now = 100000;
const source = fs.readFileSync('frontend/src/game/GameAudio.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/const CLIPS = .*;/, 'const CLIPS = {};')
  .replace(/export default class/, 'class')
  .replace(/export function/g, 'function');
const played = [];
const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
const context = {
  Date: { now: () => now }, document,
  window: { addEventListener() {}, removeEventListener() {} },
  localStorage: { getItem: () => null },
};
vm.createContext(context);
vm.runInContext(source + '\nthis.GameAudio = GameAudio;', context);
const scene = {
  players: [{ body: { x: 0, y: 0 } }], controls: { menuOpen: false },
  stationDefs: [{ id: 'grill', kind: 'grill', x: 0, y: 0 }, { id: 'oven', kind: 'oven', x: 0, y: 0 }],
  stations: { grill: { itemId: 'meat' }, oven: { itemId: 'pizza' } },
  items: { meat: { id: 'meat', status: 'raw' }, pizza: { id: 'pizza', bakeStatus: 'raw' } },
  sound: { locked: false, add(key) { return {
    play() { played.push(key); }, once() {}, destroy() { this.destroyed = true; },
    pause() { this.paused = true; }, resume() { this.paused = false; }, setVolume(value) { this.volume = value; },
  }; } },
};
const audio = new context.GameAudio(scene);
audio.syncRound({ roundId: 1, roundEndsAt: now + 31000, roundStatus: 'PLAYING' });
audio.update();
assert.equal(audio.loops.size, 1, 'frying starts');
const music = audio.music;
assert.equal(music.volume, 0.25, 'music starts quietly');
document.hidden = true; audio.onVisibility();
assert.equal(music.paused, true, 'music pauses when tab is hidden');
document.hidden = false; audio.onVisibility();
assert.equal(music.paused, false, 'music resumes at the existing position');
audio.onMusicVolume({ detail: 0 });
assert.equal(music.paused, true, 'zero music volume pauses only music');
audio.onMusicVolume({ detail: 0.4 });
assert.equal(music.volume, 0.4);
assert.equal(audio.volume, 0.65, 'effects volume stays independent');
audio.update();
const loop = audio.loops.get('grill');
audio.update();
assert.equal(played.filter(x => x === 'sfx-frying').length, 2, 'loop restarts only after returning to tab');
assert.equal(played.filter(x => x === 'background-music').length, 1, 'music never layers duplicate tracks');
now += 1000; audio.update(); audio.update();
assert.equal(played.filter(x => x === 'sfx-warning').length, 1, '30-second warning is once');
scene.items.pizza.bakeStatus = 'cooked'; audio.update(); now += 1000; audio.update();
assert.equal(played.filter(x => x === 'sfx-ovenReady').length, 1, 'oven transition dings once');
scene.controls.menuOpen = true; audio.update();
assert.equal(audio.loops.size, 0); assert.equal(loop.destroyed, true);
scene.controls.menuOpen = false;
scene.items.meat.status = 'burnt'; audio.update();
assert.equal(audio.loops.size, 0, 'burnt meat stops frying');
scene.stationDefs.push({ id: 'board', kind: 'cutting-board', x: 0, y: 0 });
scene.stations.board = { itemId: 'tomato', cutState: 'cutting' };
scene.items.tomato = { id: 'tomato', status: 'raw' };
audio.update();
const chops = played.filter(x => x === 'sfx-chop').length;
scene.stations.board.cutState = 'paused'; now += 500; audio.update();
assert.equal(played.filter(x => x === 'sfx-chop').length, chops, 'paused cutting stays quiet');
const before = played.length;
audio.step('p1', 0, 0, false);
assert.equal(played.length, before, 'stationary player stays quiet');
audio.step('p1', 0, 0, true); audio.step('p1', 0, 0, true);
assert.equal(played.length, before + 1, 'footsteps have cadence');
now = audio.endsAt - 10000; audio.update(); audio.update();
assert.equal(played.filter(x => x === 'sfx-tick').length, 1);
now += 1000; audio.update();
assert.equal(played.filter(x => x === 'sfx-tick').length, 2);
now = audio.endsAt; audio.update(); audio.finish();
assert.equal(played.filter(x => x === 'sfx-timeUp').length, 1);
audio.destroy(); assert.equal(audio.oneshots.size, 0);
assert.equal(music.destroyed, true, 'music is destroyed at round end');
console.log('Passed station audio, loop cleanup, footsteps, countdown and finish checks.');
