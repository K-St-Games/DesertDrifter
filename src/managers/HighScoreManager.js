// High-score persistence and leaderboard text. Behavior unchanged from the original game.js.
const STORAGE_KEY = 'highScores';
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 10;
const MIN_SCORE_TO_PROMPT = 1000;

function sanitizeEntries(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score))
    .sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
}

// Stored shape is { version: 1, scores: [...] }. Older builds stored a bare
// array; both load. Anything else (malformed JSON, wrong shape) recovers to [].
function loadScores() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    // unavailable storage: start with an empty list
    return [];
  }
  if (raw == null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // corrupt data: start with an empty list
    return [];
  }
  if (Array.isArray(parsed)) return sanitizeEntries(parsed);
  if (parsed && parsed.version === STORAGE_VERSION && Array.isArray(parsed.scores)) return sanitizeEntries(parsed.scores);
  return [];
}

export class HighScoreManager {
  constructor() {
    this.scores = loadScores();
  }

  // Minimum score to even prompt, then a top-10 check (the list is kept sorted, best first).
  qualifies(score) {
    if (score < MIN_SCORE_TO_PROMPT) {
      return false;
    }
    if (this.scores.length < MAX_ENTRIES) {
      return true;
    }
    const lowest = this.scores[this.scores.length - 1].score;
    return score > lowest;
  }

  // Returns false (and stores nothing) when the initials are empty.
  submit(rawInitials, score) {
    const initials = rawInitials.toUpperCase();
    if (initials.length === 0) {
      return false;
    }
    this.scores.push({ name: initials, score });
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, MAX_ENTRIES);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, scores: this.scores })); } catch (err) { /* storage unavailable: keep in-memory scores so the flow completes */ }
    return true;
  }

  renderLeaderboard() {
    let listText = 'HIGH SCORES\n\n';
    this.scores.sort((a, b) => b.score - a.score);

    for (let i = 0; i < Math.min(this.scores.length, MAX_ENTRIES); i++) {
      listText += (i + 1) + '. ' + this.scores[i].name + ' - ' + this.scores[i].score + '\n';
    }

    listText += '\nPress SPACE to restart';
    return listText;
  }
}
