// Story progression: Campus will be available after its map assets are added.
export const STORY_MAPS = [
  {
    id: "bistro",
    name: "Bistro",
    unlockScore: 0,
    durationMs: 180000,
    available: true,
  },
  {
    id: "farm",
    name: "Farm",
    unlockScore: 0,
    durationMs: 180000,
    available: true,
  },
  {
    id: "campus",
    name: "Campus",
    unlockScore: 800,
    durationMs: 240000,
    available: false,
  },
];
export const getStoryMap = (id) => STORY_MAPS.find((map) => map.id === id);
export const canPlayStoryMap = (id, total) => {
  const map = getStoryMap(id);
  return Boolean(map?.available && total >= map.unlockScore);
};
export const scoreContribution = (score) => Math.max(0, Math.floor(score));
