import { DEFAULT_STORY_CREDITS, summarizeCredits } from "./storyConfig";

export function readStoryProgress(mode) {
  const key = `kitchen-story:${mode}`;
  let progress = {};
  try {
    progress = JSON.parse(sessionStorage.getItem(key) || "{}") || {};
  } catch { /* Start with the default progress if saved JSON is invalid. */ }
  if (summarizeCredits(progress.creditBests).total === 0) {
    progress = {
      ...progress,
      creditBests: { ...DEFAULT_STORY_CREDITS },
      ...summarizeCredits(DEFAULT_STORY_CREDITS),
    };
    try { sessionStorage.setItem(key, JSON.stringify(progress)); } catch { /* Storage is optional. */ }
  }
  return progress;
}
