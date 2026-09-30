// Procedural Web Audio: engine hum, UFO tones, crash sound. Behavior unchanged from the original game.js.
export class AudioManager {
  constructor() {
    this.engineSound = null; // Oscillator for engine noise
    this.ufoSound = null;
    this.ufoGainNode = null;
    this.ufoLFO = null;
    this.ufoLFOGain = null;
    this.muted = false;
  }

  init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }

    const ctx = new AudioContext();

    // Browsers keep a context created before any user gesture suspended: resume it on the first input.
    const resume = () => {
      if (!this.muted && ctx.state === 'suspended') ctx.resume();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((type) => window.addEventListener(type, resume, { passive: true }));
    this.engineSound = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Setup Sawtooth wave for buzzy motor
    this.engineSound.type = 'sawtooth';
    this.engineSound.frequency.value = 60; // Lower base idle pitch

    // Connect
    this.engineSound.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Lower volume so it's not ear-splitting
    gainNode.gain.value = 0.007;

    // Start
    this.engineSound.start();

    // --- UFO Sound Setup ---
    this.ufoSound = ctx.createOscillator();
    this.ufoSound.type = 'sine';
    this.ufoSound.frequency.value = 400;

    this.ufoGainNode = ctx.createGain();
    this.ufoGainNode.gain.value = 0; // Start muted

    // LFO for wobble
    this.ufoLFO = ctx.createOscillator();
    this.ufoLFO.type = 'sine';
    this.ufoLFO.frequency.value = 5; // 5Hz wobble

    this.ufoLFOGain = ctx.createGain();
    this.ufoLFOGain.gain.value = 50; // Depth of wobble

    this.ufoLFO.connect(this.ufoLFOGain);
    this.ufoLFOGain.connect(this.ufoSound.frequency);

    this.ufoSound.connect(this.ufoGainNode);
    this.ufoGainNode.connect(ctx.destination);

    this.ufoSound.start();
    this.ufoLFO.start();
  }

  // Base 60Hz + (Speed * 20) -> 60Hz to 120Hz range
  updateEngineSpeed(currentSpeed) {
    if (this.engineSound) {
      this.engineSound.frequency.value = 60 + (currentSpeed * 20);
    }
  }

  updateUfo(active, state) {
    if (!this.ufoSound || !this.ufoGainNode) {
      return;
    }

    const ctx = this.engineSound.context;
    if (active) {
      this.ufoGainNode.gain.setTargetAtTime(0.05, ctx.currentTime, 0.1);

      if (state === 'approaching') {
        this.ufoSound.type = 'sine';
        this.ufoSound.frequency.setTargetAtTime(600, ctx.currentTime, 0.1);
        this.ufoLFO.frequency.value = 5;
      } else if (state === 'locking') {
        this.ufoSound.frequency.setTargetAtTime(800, ctx.currentTime, 0.1);
        this.ufoLFO.frequency.value = 10;
      } else if (state === 'charging') {
        this.ufoSound.frequency.setTargetAtTime(1000, ctx.currentTime, 0.1);
        this.ufoLFO.frequency.value = 20; // Fast wobble
      } else if (state === 'firing') {
        this.ufoSound.type = 'sawtooth'; // Buzzy beam
        this.ufoSound.frequency.setTargetAtTime(200, ctx.currentTime, 0.1);
        this.ufoLFO.frequency.value = 50;
      }
    } else {
      this.ufoGainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  }

  // Stop engine and UFO sound
  silenceForGameOver() {
    if (this.engineSound) {
      this.engineSound.frequency.value = 0;
    }
    if (this.ufoGainNode) {
      this.ufoGainNode.gain.value = 0;
    }
  }

  playCrash() {
    if (!this.engineSound) {
      return;
    }

    const ctx = this.engineSound.context; // Use same context
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.5); // Pitch drop

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  // Mutes the synthesized sounds (the music is muted through scene.sound). Returns the new state.
  toggleMute() {
    this.muted = !this.muted;
    if (this.engineSound) {
      const ctx = this.engineSound.context;
      if (this.muted) ctx.suspend(); else ctx.resume();
    }
    return this.muted;
  }

  // Restart engine sound
  resetEngine() {
    if (this.engineSound) {
      this.engineSound.frequency.value = 60;
    }
  }
}
