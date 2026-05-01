export type AudioCue = 'soft' | 'spark' | 'shift' | 'low' | 'silence';

export class RoomAudio {
  private ctx: AudioContext | null = null;
  private bed: GainNode | null = null;
  private oscillator: OscillatorNode | null = null;

  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.bed = this.ctx.createGain();
      this.bed.gain.value = 0.018;
      this.bed.connect(this.ctx.destination);

      this.oscillator = this.ctx.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 92;
      this.oscillator.connect(this.bed);
      this.oscillator.start();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  cue(kind: AudioCue) {
    if (!this.ctx) return;
    if (kind === 'silence') {
      this.bed?.gain.setTargetAtTime(0.002, this.ctx.currentTime, 0.45);
      return;
    }

    const gain = this.ctx.createGain();
    const osc = this.ctx.createOscillator();
    const now = this.ctx.currentTime;

    const settings = {
      soft: { type: 'sine' as OscillatorType, from: 420, to: 510, level: 0.035, time: 0.18 },
      spark: { type: 'triangle' as OscillatorType, from: 640, to: 840, level: 0.03, time: 0.16 },
      shift: { type: 'sawtooth' as OscillatorType, from: 188, to: 91, level: 0.025, time: 0.55 },
      low: { type: 'sine' as OscillatorType, from: 78, to: 54, level: 0.04, time: 0.8 }
    }[kind];

    osc.type = settings.type;
    osc.frequency.setValueAtTime(settings.from, now);
    osc.frequency.exponentialRampToValueAtTime(settings.to, now + settings.time);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(settings.level, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings.time);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + settings.time + 0.04);

    this.bed?.gain.setTargetAtTime(kind === 'low' ? 0.028 : 0.018, now, 0.8);
  }
}
