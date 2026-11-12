/** Синтезированный звук на Web Audio: двигатель, шины, удары, сигналы. Без аудиофайлов. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private osc: OscillatorNode[] = [];
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  private rpmS = 0;

  /** Вызывать из обработчика жеста пользователя. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // двигатель: три осциллятора через ФНЧ
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.Q.value = 3;
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;
      this.engFilter.connect(this.engGain).connect(this.master);
      const types: OscillatorType[] = ['sawtooth', 'square', 'sawtooth'];
      types.forEach((type, i) => {
        const o = ctx.createOscillator();
        o.type = type;
        const g = ctx.createGain();
        g.gain.value = [0.5, 0.28, 0.2][i];
        o.connect(g).connect(this.engFilter!);
        o.start();
        this.osc.push(o);
      });
      const loop = (filterType: BiquadFilterType, freq: number): [GainNode, BiquadFilterNode] => {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(f).connect(g).connect(this.master!);
        src.start();
        return [g, f];
      };
      [this.skidGain, this.skidFilter] = loop('bandpass', 900);
      [this.windGain] = loop('lowpass', 500);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.03);
  }

  /** rpm, throttle, slip — 0..1; speed — м/с. active=false глушит двигатель (меню, пауза). */
  engine(rpm: number, throttle: number, slip: number, speed: number, active: boolean, loose: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.engGain || !this.engFilter) return;
    const t = ctx.currentTime;
    this.rpmS += (rpm - this.rpmS) * 0.25;
    const f = 42 + this.rpmS * 150 + throttle * 8;
    this.osc[0].frequency.setTargetAtTime(f, t, 0.03);
    this.osc[1].frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.osc[2].frequency.setTargetAtTime(f * 1.5 + 2, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(260 + this.rpmS * 1500 + throttle * 900, t, 0.04);
    this.engGain.gain.setTargetAtTime(active ? 0.1 + throttle * 0.16 + this.rpmS * 0.05 : 0, t, 0.06);
    this.skidGain?.gain.setTargetAtTime(active ? Math.min(0.3, slip * 0.3) : 0, t, 0.05);
    this.skidFilter?.frequency.setTargetAtTime(loose ? 500 : 1300, t, 0.05);
    this.windGain?.gain.setTargetAtTime(active ? Math.min(0.2, (speed / 30) ** 2 * 0.2) : 0, t, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private burst(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  land(force: number): void {
    const v = Math.min(0.6, 0.12 + force * 0.07);
    this.tone(110, 0.18, 'sine', v, 0, 42);
    this.burst(0.14, v * 0.5, 700);
  }
  scrape(): void { this.burst(0.08, 0.16, 2600, 'bandpass'); }
  crash(): void {
    this.burst(0.5, 0.6, 1200);
    this.tone(90, 0.4, 'sawtooth', 0.3, 0, 30);
    this.tone(160, 0.12, 'square', 0.2, 0.05, 60);
  }
  thud(): void { this.tone(70, 0.12, 'sine', 0.3, 0, 40); this.burst(0.08, 0.15, 500); }
  star(n: number): void {
    const base = 880 * Math.pow(1.122, n - 1);
    this.tone(base, 0.12, 'triangle', 0.25);
    this.tone(base * 1.5, 0.3, 'triangle', 0.25, 0.07);
  }
  checkpoint(): void { [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.22, i * 0.07)); }
  flip(): void { this.tone(600, 0.25, 'triangle', 0.22, 0, 1300); this.tone(1300, 0.25, 'sine', 0.16, 0.2); }
  crack(): void { this.burst(0.07, 0.28, 3000, 'highpass'); this.tone(200, 0.06, 'square', 0.1, 0, 90); }
  finish(): void { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i === 4 ? 0.7 : 0.18, 'triangle', 0.25, i * 0.11)); }
  click(): void { this.tone(700, 0.05, 'triangle', 0.1); }
}
