
import { MusicalCues } from "../types";

export class AtmosphereService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private rhythmTimer: number | null = null;
  private filterNode: BiquadFilterNode | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.filterNode = ctx.createBiquadFilter();
    
    this.filterNode.type = 'lowpass';
    this.filterNode.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    
    this.masterGain.gain.value = 0;
  }

  setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(vol * 0.15, this.ctx!.currentTime, 0.1);
    }
  }

  playTuningStatic() {
    if (!this.ctx) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 1;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    whiteNoise.start();
  }

  playNewsSounder() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now + i * 0.1);
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.05, now + i * 0.1 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.1);
    }
  }

  playWeatherSounder() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [659.25, 783.99, 987.77];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 1.5);

      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.05, now + i * 0.15 + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 1.5);
    });
  }

  playJingleSting() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73]; 
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = i % 2 === 0 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, now + i * 0.08);
      filter.frequency.exponentialRampToValueAtTime(200, now + i * 0.08 + 0.4);
      filter.Q.value = 15;

      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.04, now + i * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.7);
    });
  }

  startDynamicUnderscore(cues: MusicalCues) {
    if (!this.ctx || !this.masterGain || !this.filterNode) return;
    this.stopPad();

    // Configure filter
    this.filterNode.frequency.setTargetAtTime(cues.filterCutoff, this.ctx.currentTime, 1);
    this.filterNode.Q.value = 2 + cues.intensity * 8;

    const harmonics = [1, 1.5, 2, 2.5];
    harmonics.forEach((mult) => {
      const osc = this.ctx!.createOscillator();
      const oscGain = this.ctx!.createGain();
      
      osc.type = cues.waveform;
      osc.frequency.setValueAtTime(cues.baseFreq * mult, this.ctx!.currentTime);
      
      // Frequency Modulation (LFO)
      const lfo = this.ctx!.createOscillator();
      const lfoGain = this.ctx!.createGain();
      lfo.frequency.value = (cues.bpm / 120) * (0.5 + Math.random());
      lfoGain.gain.value = cues.intensity * 20;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      oscGain.gain.setValueAtTime(0, this.ctx!.currentTime);
      oscGain.gain.linearRampToValueAtTime((0.05 + (cues.intensity * 0.05)) / harmonics.length, this.ctx!.currentTime + 2);

      osc.connect(oscGain);
      oscGain.connect(this.filterNode!);
      osc.start();
      
      this.oscillators.push(osc);

      // Glitch effect if enabled
      if (cues.isGlitchy) {
        const glitchInterval = setInterval(() => {
          if (Math.random() > 0.95) {
            osc.frequency.setValueAtTime(cues.baseFreq * mult * (Math.random() + 0.5), this.ctx!.currentTime);
            setTimeout(() => {
              osc.frequency.setTargetAtTime(cues.baseFreq * mult, this.ctx!.currentTime, 0.05);
            }, 50);
          }
        }, 100);
        // Clean up glitch interval on stop (approximated here for simplicity)
      }
    });

    if (cues.intensity > 0.4) {
      this.startRhythm(cues.bpm, cues.intensity);
    }
  }

  private startRhythm(bpm: number, intensity: number) {
    if (!this.ctx) return;
    const stepTime = 60 / bpm;

    const playStep = () => {
      if (!this.rhythmTimer) return;
      const now = this.ctx!.currentTime;
      
      // Simple Kick
      const kick = this.ctx!.createOscillator();
      const kickGain = this.ctx!.createGain();
      kick.frequency.setValueAtTime(150, now);
      kick.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      kickGain.gain.setValueAtTime(0.03 * intensity, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      kick.connect(kickGain);
      kickGain.connect(this.masterGain!);
      kick.start(now);
      kick.stop(now + 0.1);

      // Digital Tick
      if (intensity > 0.7 && Math.random() > 0.5) {
        const tick = this.ctx!.createOscillator();
        const tickGain = this.ctx!.createGain();
        tick.type = 'square';
        tick.frequency.setValueAtTime(4000, now + stepTime / 2);
        tickGain.gain.setValueAtTime(0.01, now + stepTime / 2);
        tickGain.gain.exponentialRampToValueAtTime(0.001, now + stepTime / 2 + 0.02);
        tick.connect(tickGain);
        tickGain.connect(this.masterGain!);
        tick.start(now + stepTime / 2);
        tick.stop(now + stepTime / 2 + 0.02);
      }

      this.rhythmTimer = window.setTimeout(playStep, stepTime * 1000);
    };

    this.rhythmTimer = 1; // Flag to start
    playStep();
  }

  stopPad() {
    this.oscillators.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    this.oscillators = [];
    if (this.rhythmTimer) {
      clearTimeout(this.rhythmTimer);
      this.rhythmTimer = null;
    }
  }
}
