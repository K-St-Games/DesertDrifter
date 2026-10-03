import assert from 'node:assert/strict';
import test from 'node:test';

const { HighScoreManager } = await import('../src/managers/HighScoreManager.js');

function stubStorage({ stored = null, onSet = null, throwOnSet = false } = {}) {
  let saved = stored;
  globalThis.localStorage = {
    getItem: () => saved,
    setItem: (k, v) => {
      if (throwOnSet) throw new Error('storage full');
      saved = v;
      if (onSet) onSet(k, v);
    },
  };
  return () => saved;
}

test('old bare-array shape still loads', () => {
  stubStorage({ stored: JSON.stringify([{ name: 'ABC', score: 1500 }, { name: 7, score: 9 }]) });
  try {
    const mgr = new HighScoreManager();
    assert.deepEqual(mgr.scores, [{ name: 'ABC', score: 1500 }]);
  } finally {
    delete globalThis.localStorage;
  }
});

test('versioned shape loads', () => {
  stubStorage({ stored: JSON.stringify({ version: 1, scores: [{ name: 'XYZ', score: 2000 }] }) });
  try {
    const mgr = new HighScoreManager();
    assert.deepEqual(mgr.scores, [{ name: 'XYZ', score: 2000 }]);
  } finally {
    delete globalThis.localStorage;
  }
});

test('malformed data starts empty', () => {
  for (const stored of ['not json{{{', JSON.stringify({ nope: 1 }), JSON.stringify({ version: 1, scores: 'bad' })]) {
    stubStorage({ stored });
    try {
      const mgr = new HighScoreManager();
      assert.deepEqual(mgr.scores, []);
    } finally {
      delete globalThis.localStorage;
    }
  }
});

test('setItem throwing does not throw from submit()', () => {
  stubStorage({ stored: null, throwOnSet: true });
  try {
    const mgr = new HighScoreManager();
    assert.equal(mgr.submit('ab', 1500), true);
    // In-memory scores kept so the game-over/initials flow can complete.
    assert.deepEqual(mgr.scores, [{ name: 'AB', score: 1500 }]);
    assert.match(mgr.renderLeaderboard(), /AB - 1500/);
  } finally {
    delete globalThis.localStorage;
  }
});

test('submit() writes the versioned shape', () => {
  let written = null;
  stubStorage({ stored: null, onSet: (k, v) => { written = [k, v]; } });
  try {
    const mgr = new HighScoreManager();
    assert.equal(mgr.submit('ab', 1500), true);
    assert.equal(written[0], 'highScores');
    assert.deepEqual(JSON.parse(written[1]), { version: 1, scores: [{ name: 'AB', score: 1500 }] });
    // And the versioned payload loads back.
    const reloaded = new HighScoreManager();
    assert.deepEqual(reloaded.scores, [{ name: 'AB', score: 1500 }]);
  } finally {
    delete globalThis.localStorage;
  }
});
