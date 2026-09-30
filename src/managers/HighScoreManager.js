// High-score persistence and leaderboard text. Behavior unchanged from the original game.js.
const STORAGE_KEY = 'highScores';
const MAX_ENTRIES = 10;
const MIN_SCORE_TO_PROMPT = 1000;

export class HighScoreManager {
  constructor() {
    this.scores = [];
    const storedScores = localStorage.getItem(STORAGE_KEY);
    if (storedScores) {
      this.scores = JSON.parse(storedScores);
    }
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.scores));
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
