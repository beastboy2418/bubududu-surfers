/**
 * High-performance Web Audio API Sound Synthesizer
 * Provides retro, bubbly, upbeat sound effects and an infectious background track
 * with zero external audio assets (100% procedural, no 404s).
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmPlaying: boolean = false;
  private bgmTimer: number | null = null;
  private bgmGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private jetpackOsc: OscillatorNode | null = null;
  private jetpackNoise: AudioBufferSourceNode | null = null;
  private jetpackGain: GainNode | null = null;
  private jetpackLfo: OscillatorNode | null = null;
  private voiceBuffers: Map<string, AudioBuffer> = new Map();
  private voiceLoading: Map<string, Promise<AudioBuffer | null>> = new Map();
  private currentVoiceSource: AudioBufferSourceNode | null = null;
  private coinStreak = 0;
  private lastCoinTime = 0;

  constructor() {
    // AudioContext will be lazily initialized on first user interaction
    const savedMute = localStorage.getItem('bubududu_muted');
    if (savedMute !== null) {
      this.isMuted = savedMute === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private getAudioUrl(filename: string): string {
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168.'))
    ) {
      return '/' + filename;
    }
    const base = import.meta.env.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : base + '/';
    return cleanBase + filename;
  }

  public async preloadVoiceAudio(): Promise<void> {
    const tracks = [
      { key: 'bubu_start', file: 'audio-tracks/bubu-starting-track-when-starts-running.mpeg' },
      { key: 'dudu_start', file: 'audio-tracks/dudu-starting-track-when-starts-running.mpeg' },
      { key: 'caught', file: 'audio-tracks/when-got-caught-by-police.mpeg' },
    ];
    await Promise.allSettled(tracks.map((t) => this.loadVoiceBuffer(t.key, t.file)));
  }

  private async loadVoiceBuffer(key: string, file: string): Promise<AudioBuffer | null> {
    if (this.voiceBuffers.has(key)) return this.voiceBuffers.get(key)!;
    if (this.voiceLoading.has(key)) return this.voiceLoading.get(key)!;

    this.initCtx();
    const ctx = this.ctx;
    if (!ctx) return null;

    const promise = (async () => {
      try {
        const url = this.getAudioUrl(file);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.voiceBuffers.set(key, audioBuf);
        return audioBuf;
      } catch (err) {
        console.warn(`[SoundManager] Failed to load voice audio for ${key}:`, err);
        return null;
      }
    })();

    this.voiceLoading.set(key, promise);
    return promise;
  }

  public async playVoice(key: 'bubu_start' | 'dudu_start' | 'caught', volume = 0.95) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    this.stopVoice();

    let buf = this.voiceBuffers.get(key);
    if (!buf) {
      const file =
        key === 'bubu_start'
          ? 'audio-tracks/bubu-starting-track-when-starts-running.mpeg'
          : key === 'dudu_start'
          ? 'audio-tracks/dudu-starting-track-when-starts-running.mpeg'
          : 'audio-tracks/when-got-caught-by-police.mpeg';
      buf = (await this.loadVoiceBuffer(key, file)) ?? undefined;
    }

    if (!buf || this.isMuted || !this.ctx) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      source.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.currentVoiceSource = source;
      source.onended = () => {
        if (this.currentVoiceSource === source) {
          this.currentVoiceSource = null;
        }
      };
    } catch (e) {
      console.warn('[SoundManager] Voice playback error:', e);
    }
  }

  public playCharacterStartVoice(character: 'bubu' | 'dudu') {
    this.playVoice(character === 'bubu' ? 'bubu_start' : 'dudu_start');
  }

  public playCaughtVoice() {
    this.playVoice('caught', 1.0);
  }

  public stopVoice() {
    if (this.currentVoiceSource) {
      try {
        this.currentVoiceSource.stop();
        this.currentVoiceSource.disconnect();
      } catch {
        // ignore
      }
      this.currentVoiceSource = null;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('bubududu_muted', String(this.isMuted));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    } 
    if (this.isMuted) {
      this.stopVoice();
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Jump: bouncy cartoon whoosh upwards
  public playJump() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.18);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  // Slide: rapid swoosh with slight low-pass noise friction
  public playSlide() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  // Musical Pentatonic Coin Chimes (Nintendo/Sonic style consecutive harmony)
  public playCoin() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = Date.now();
    if (now - this.lastCoinTime < 1200) {
      this.coinStreak = (this.coinStreak + 1) % 6;
    } else {
      this.coinStreak = 0;
    }
    this.lastCoinTime = now;

    const t = this.ctx.currentTime;
    // Pentatonic scale: C5, D5, E5, G5, A5, C6
    const pentatonicNotes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    const baseFreq = pentatonicNotes[this.coinStreak];

    // Bell chime
    const freqs = [baseFreq, baseFreq * 1.5]; // Fundamental + fifth harmonic
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);

      const vol = this.coinStreak === 5 ? 0.35 : 0.22;
      gain.gain.setValueAtTime(vol, t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.22);
    });

    // On 5th streak: celebratory bonus octave sparkle!
    if (this.coinStreak === 5) {
      const sparkleOsc = this.ctx.createOscillator();
      const sparkleGain = this.ctx.createGain();
      sparkleOsc.type = 'sine';
      sparkleOsc.frequency.setValueAtTime(1318.51, t + 0.08); // E6
      sparkleOsc.frequency.exponentialRampToValueAtTime(1567.98, t + 0.16); // G6
      sparkleGain.gain.setValueAtTime(0.2, t + 0.08);
      sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      sparkleOsc.connect(sparkleGain);
      sparkleGain.connect(this.masterGain);
      sparkleOsc.start(t + 0.08);
      sparkleOsc.stop(t + 0.3);
    }
  }

  // Fever Mode Activation Fanfare
  public playFeverStart() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    // Rising triumphant arcade power surge chord: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);

      gain.gain.setValueAtTime(0.25, t + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.45);
    });
  }

  // Fever Mode End Whoosh
  public playFeverEnd() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.35);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Duo Tag-Team Switch Chime: joyful romantic sparkle chord
  public playSwitchDuo() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const freqs = [698.46, 880.00, 1046.50, 1396.91]; // F5, A5, C6, F6
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);

      gain.gain.setValueAtTime(0.26, t + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.32);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.32);
    });
  }

  // Cute Cartoon Car Horn "Beep Beep!"
  public playCarHorn() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    [0, 0.14].forEach((startOffset) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(587.33, t + startOffset); // D5

      gain.gain.setValueAtTime(0.22, t + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + startOffset + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + startOffset);
      osc.stop(t + startOffset + 0.1);
    });
  }

  // Mission Complete Star Chime
  public playMissionComplete() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const notes = [659.25, 783.99, 987.77, 1318.51]; // E5, G5, B5, E6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0.3, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.4);
    });
  }

  // Combo Streak Cheer
  public playComboCheer() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Boba Milk Tea / Magnet Powerup: joyful shimmering chord
  public playBoba() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.06);

      gain.gain.setValueAtTime(0.28, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.35);
    });
  }

  // Spring boing for Super Sneakers jumps
  public playSpringBoing() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.22);
    osc.frequency.exponentialRampToValueAtTime(940, t + 0.32);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Duo Love Spark: sweet twin chimes with heart sparkle
  public playDuoSpark() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const duoNotes = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6
    duoNotes.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.05);
      gain.gain.setValueAtTime(0.18, t + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.35);
    });
  }

  // Boba Tapioca Pearl Pop
  public playBobaPop() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // Jetpack aerodynamic smooth wind & warm engine whoosh (soothing, zero harshness)
  public startJetpackLoop() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain || this.jetpackGain) return;

    const t = this.ctx.currentTime;
    this.jetpackGain = this.ctx.createGain();
    this.jetpackGain.gain.setValueAtTime(0.001, t);
    // Comfortable, soft background volume level (down from harsh 0.24 to gentle 0.075)
    this.jetpackGain.gain.exponentialRampToValueAtTime(0.075, t + 0.35);
    this.jetpackGain.connect(this.masterGain);

    // Warm, silky low sub-hum sine (50Hz - pure and gentle, zero harsh sawtooth buzz)
    this.jetpackOsc = this.ctx.createOscillator();
    this.jetpackOsc.type = 'sine';
    this.jetpackOsc.frequency.setValueAtTime(50, t);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.35, t);
    this.jetpackOsc.connect(subGain);
    subGain.connect(this.jetpackGain);

    // Aerodynamic soft rushing wind (gentle lowpass-filtered noise)
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink/brown 1-pole filter to remove all abrasive high frequencies
      lastOut = (lastOut + 0.03 * white) / 1.03;
      data[i] = lastOut * 3.5;
    }
    this.jetpackNoise = this.ctx.createBufferSource();
    this.jetpackNoise.buffer = noiseBuffer;
    this.jetpackNoise.loop = true;

    // Resonant lowpass filter centered at 380Hz for soothing sky wind sensation
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, t);
    filter.Q.setValueAtTime(0.8, t);

    // Gentle 1.2Hz breathing LFO for realistic surging airflow
    this.jetpackLfo = this.ctx.createOscillator();
    this.jetpackLfo.frequency.setValueAtTime(1.2, t);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(80, t);
    this.jetpackLfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.jetpackNoise.connect(filter);
    filter.connect(this.jetpackGain);

    this.jetpackOsc.start(t);
    this.jetpackNoise.start(t);
    this.jetpackLfo.start(t);
  }

  public stopJetpackLoop() {
    if (!this.ctx || !this.jetpackGain) return;
    const t = this.ctx.currentTime;
    this.jetpackGain.gain.setValueAtTime(this.jetpackGain.gain.value, t);
    this.jetpackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);

    setTimeout(() => {
      try {
        this.jetpackOsc?.stop();
        this.jetpackNoise?.stop();
        this.jetpackLfo?.stop();
        this.jetpackOsc?.disconnect();
        this.jetpackNoise?.disconnect();
        this.jetpackLfo?.disconnect();
        this.jetpackGain?.disconnect();
      } catch {
        // ignore already stopped
      }
      this.jetpackOsc = null;
      this.jetpackNoise = null;
      this.jetpackLfo = null;
      this.jetpackGain = null;
    }, 320);
  }

  // Hoverboard On: futuristic energetic whoosh
  public playHoverboardOn() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Hoverboard Break: electric shield shatter zap saving player's life
  public playHoverboardBreak() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    // Metallic shatter crash
    const freqs = [320, 580, 890, 1420, 2200];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.35);

      gain.gain.setValueAtTime(0.25 / (idx + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  // Pogo Stick launch sound
  public playPogoLaunch() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.28);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Authentic Subway Train Horn (dual-tone brass chord: F4 349Hz + Bb4 466Hz)
  public playTrainHorn() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const notes = [349.23, 466.16];
    notes.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 0.99, t + 0.55);

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, t);
      filter.Q.setValueAtTime(1.5, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.08);
      gain.gain.setValueAtTime(0.18, t + 0.40);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  // Aerodynamic in-air fast fall dive whoosh
  public playAirDive() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.22);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.24);
  }

  // 2X Multiplier collected chime
  public playMultiplierChime() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);

      gain.gain.setValueAtTime(0.25, t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.4);
    });
  }

  // Mystery Box Open Fanfare
  public playMysteryBoxOpen() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const fanfare = [
      { note: 523.25, time: 0 },
      { note: 659.25, time: 0.1 },
      { note: 783.99, time: 0.2 },
      { note: 1046.5, time: 0.3 },
      { note: 1318.5, time: 0.45 },
    ];
    fanfare.forEach((item) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(item.note, t + item.time);

      gain.gain.setValueAtTime(0.3, t + item.time);
      gain.gain.exponentialRampToValueAtTime(0.001, t + item.time + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + item.time);
      osc.stop(t + item.time + 0.35);
    });
  }

  // Headstart Supersonic Rocket Rush
  public playHeadstartRocket() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.6);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.7);
  }

  // Guard Whistle: twin high pitch trill
  public playWhistle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(2600, t);
    osc2.frequency.setValueAtTime(2680, t);

    // Rapid vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(24, t);
    lfoGain.gain.setValueAtTime(120, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    lfo.start(t);
    osc1.start(t);
    osc2.start(t);
    lfo.stop(t + 0.4);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);
  }

  // Spray can marble rattle
  public playSprayRattle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200 + Math.random() * 300, t + i * 0.07);
      gain.gain.setValueAtTime(0.2, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.035);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.035);
    }
  }

  // Aerosol spray hiss burst
  public playSprayHiss() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.25;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.Q.setValueAtTime(1.5, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.25);
  }

  // Metallic spray can clatter on concrete platform
  public playCanClatter() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const frequencies = [1180, 890, 1420, 750, 1020];
    const delays = [0, 0.05, 0.11, 0.17, 0.22];

    frequencies.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delays[i]);
      gain.gain.setValueAtTime(0.25 / (i + 1), t + delays[i]);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delays[i] + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + delays[i]);
      osc.stop(t + delays[i] + 0.08);
    });
  }

  // Cartoon Bulldog Bark / Growl
  public playDogBark() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    // Two rapid energetic barks
    [0, 0.14].forEach((delay) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, t + delay);
      osc.frequency.exponentialRampToValueAtTime(140, t + delay + 0.11);

      gain.gain.setValueAtTime(0.35, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + delay);
      osc.stop(t + delay + 0.12);
    });
  }

  // Crash / Impact: heavy thud + wobble
  public playCrash() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    // Bass boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Smooth background music loop
  public startBGM() {
    if (this.bgmPlaying) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    this.bgmPlaying = true;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    // Upbeat cute pentatonic runner melody loop
    const melody = [
      { note: 523.25, dur: 0.2 }, // C5
      { note: 587.33, dur: 0.2 }, // D5
      { note: 659.25, dur: 0.2 }, // E5
      { note: 783.99, dur: 0.4 }, // G5
      { note: 659.25, dur: 0.2 }, // E5
      { note: 783.99, dur: 0.2 }, // G5
      { note: 880.00, dur: 0.4 }, // A5
      { note: 783.99, dur: 0.2 }, // G5
      { note: 659.25, dur: 0.2 }, // E5
      { note: 523.25, dur: 0.4 }, // C5
      { note: 587.33, dur: 0.2 }, // D5
      { note: 659.25, dur: 0.4 }, // E5
    ];

    let noteIdx = 0;
    const playNext = () => {
      if (!this.bgmPlaying || !this.ctx || !this.bgmGain) return;
      const cur = melody[noteIdx];
      noteIdx = (noteIdx + 1) % melody.length;

      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(cur.note, this.ctx.currentTime);

      g.gain.setValueAtTime(0.16, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + cur.dur * 0.9);

      osc.connect(g);
      g.connect(this.bgmGain);

      osc.start();
      osc.stop(this.ctx.currentTime + cur.dur);

      this.bgmTimer = window.setTimeout(playNext, cur.dur * 1000);
    };

    playNext();
  }

  public stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const soundManager = new SoundManager();
