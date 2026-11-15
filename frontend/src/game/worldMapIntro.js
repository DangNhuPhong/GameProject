const PREFIX = "kitchen-world-map:intro-seen:v3:";
const seenInMemory = new Set();

export function hasSeenWorldMapIntro(scope) {
  try {
    return seenInMemory.has(scope) || sessionStorage.getItem(PREFIX + scope) === "1";
  } catch {
    return seenInMemory.has(scope);
  }
}

export function markWorldMapIntroSeen(scope) {
  seenInMemory.add(scope);
  try {
    sessionStorage.setItem(PREFIX + scope, "1");
  } catch {
    // The in-memory state also works when browser storage is unavailable.
  }
}

export function resetWorldMapIntros() {
  seenInMemory.clear();
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index),
    );
    keys.filter((key) => key?.startsWith(PREFIX)).forEach((key) =>
      sessionStorage.removeItem(key),
    );
  } catch {
    // The in-memory state was already reset.
  }
}
