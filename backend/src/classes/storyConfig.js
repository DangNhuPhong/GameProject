// Only each map's best finished round contributes to graduation.
export const CREDIT_TARGET = 120;
export const MAP_CREDIT_CAP = 30;
export const MAP_PASS_CREDITS = 18;
export const CREDIT_RULES = {
  hamburger: { credits: 5, penalty: 3, durationMs: 65000 },
  pizza: { credits: 6, penalty: 4, durationMs: 85000 },
  salad: { credits: 3, penalty: 2, durationMs: 45000 },
};
export const STORY_MAPS = [
  { id: "classroom", name: "Classroom", unlockScore: 0, durationMs: 180000, available: true },
  { id: "farm", name: "Farm", unlockScore: 18, durationMs: 180000, available: true },
  { id: "sports", name: "Sports Ground", unlockScore: 40, durationMs: 180000, available: true },
  { id: "computer-room", name: "Computer Room", unlockScore: 64, durationMs: 180000, available: true },
  { id: "library", name: "Library", unlockScore: 88, durationMs: 180000, available: true },
];
export const getStoryMap = (id) => STORY_MAPS.find((map) => map.id === id);
export const scoreContribution = (score) =>
  Math.min(MAP_CREDIT_CAP, Math.max(0, Math.floor(Number(score) || 0)));
export function summarizeCredits(bests = {}) {
  const mapBests = Object.fromEntries(STORY_MAPS.map((map) =>
    [map.id, scoreContribution(bests?.[map.id])]));
  const total = Math.min(CREDIT_TARGET, Object.values(mapBests).reduce((sum, n) => sum + n, 0));
  const passedMaps = STORY_MAPS.filter((map) => mapBests[map.id] >= MAP_PASS_CREDITS).map((map) => map.id);
  return { mapBests, total, passedMaps, graduated: total >= CREDIT_TARGET && passedMaps.length === STORY_MAPS.length };
}
export function canPlayStoryMap(id, total, bests = {}) {
  const index = STORY_MAPS.findIndex((map) => map.id === id);
  if (index < 0 || !STORY_MAPS[index].available) return false;
  return total >= STORY_MAPS[index].unlockScore &&
    STORY_MAPS.slice(0, index).every((map) => scoreContribution(bests?.[map.id]) >= MAP_PASS_CREDITS);
}
export function applyCreditResult(progress, result) {
  const before = summarizeCredits(progress?.creditBests);
  const completed = Array.isArray(progress?.completed) ? progress.completed : [];
  if (!result?.roundId || !getStoryMap(result.mapId) || completed.includes(result.roundId))
    return { ...progress, creditBests: before.mapBests, ...before, completed, creditsAdded: 0 };
  const after = summarizeCredits({
    ...before.mapBests,
    [result.mapId]: Math.max(before.mapBests[result.mapId], scoreContribution(result.score)),
  });
  return {
    ...progress, ...after, creditBests: after.mapBests,
    completed: [...completed, result.roundId], creditsAdded: after.total - before.total,
  };
}
