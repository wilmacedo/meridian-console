"""Synthesises the NOX sound-effect candidates (quiet rounded plucks, minimal UI style) into ../public/sfx. Pure stdlib: python3 sfx-src/generate.py"""
import math, random, struct, wave, os

SR = 44100
TAU = math.pi * 2
random.seed(11)
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'sfx')


def buf(sec):
    return [0.0] * int(SR * sec)


def env(i, n, a, r):
    t, d = i / SR, n / SR
    att = min(1.0, t / a) if a > 0 else 1.0
    rel = min(1.0, max(0.0, (d - t) / r)) if r > 0 else 1.0
    return att * rel * rel


def wave_of(kind, ph):
    p = ph % TAU
    if kind == 'sine':
        return math.sin(p)
    if kind == 'square':
        return 1.0 if p < math.pi else -1.0
    if kind == 'pulse':
        return 1.0 if p < TAU * 0.25 else -1.0
    if kind == 'saw':
        return p / math.pi - 1.0
    if kind == 'tri':
        return abs(p / math.pi - 1.0) * 2 - 1.0
    raise ValueError(kind)


def osc(out, start, dur, f0, f1=None, gain=0.4, kind='square', a=0.002, r=0.03, decay=0.0, fm=0.0, fm_ratio=2.0, fm_decay=0.0, lp=0.0):
    """Oscillator with optional FM (index `fm`, modulator at fm_ratio*f) and one-pole low-pass `lp` (Hz)."""
    f1 = f0 if f1 is None else f1
    n = int(SR * dur)
    s0 = int(SR * start)
    ph = mph = y = 0.0
    alpha = 1.0 if lp <= 0 else min(1.0, TAU * lp / SR)
    for i in range(n):
        if s0 + i >= len(out):
            break
        k = i / max(1, n - 1)
        f = f0 * ((f1 / f0) ** k)
        mph += TAU * f * fm_ratio / SR
        idx = fm * math.exp(-fm_decay * i / SR) if fm_decay else fm
        ph += TAU * f / SR
        v = wave_of(kind, ph + idx * math.sin(mph))
        y += alpha * (v - y)
        out[s0 + i] += y * env(i, n, a, r) * math.exp(-decay * i / SR) * gain


def noise(out, start, dur, gain=0.2, lo=0.0, sweep=None, a=0.002, r=0.05):
    n = int(SR * dur)
    s0 = int(SR * start)
    y = 0.0
    for i in range(n):
        if s0 + i >= len(out):
            break
        k = i / max(1, n - 1)
        cut = lo if sweep is None else lo * ((sweep / lo) ** k)
        alpha = 1.0 if cut <= 0 else min(1.0, TAU * cut / SR)
        y += alpha * ((random.random() * 2 - 1) - y)
        out[s0 + i] += y * env(i, n, a, r) * gain


def arp(out, start, notes, step, dur, gain=0.3, kind='pulse', **kw):
    for j, f in enumerate(notes):
        osc(out, start + j * step, dur, f, None, gain * (0.85 ** j) if kw.pop('fade', False) else gain, kind, **kw)


def bitcrush(out, bits=7, hold=3):
    q = 2 ** (bits - 1)
    last = 0.0
    for i in range(len(out)):
        if i % hold == 0:
            last = round(out[i] * q) / q
        out[i] = last
    return out


def glitch(out, start, dur, gain=0.2):
    """A stuttered burst of random-pitch ticks, like a data transfer."""
    t = start
    while t < start + dur:
        step = random.choice((0.012, 0.018, 0.024))
        osc(out, t, step * 0.8, random.choice((1800, 2400, 3200, 4000, 5200)), None, gain, 'square', a=0.0005, r=0.004)
        t += step


def delay(out, time=0.12, fb=0.35, taps=3, tail=0.3, lp=3500):
    """Ping-style digital echo with a darker repeat each tap."""
    res = list(out) + [0.0] * int(SR * tail)
    d = int(SR * time)
    alpha = min(1.0, TAU * lp / SR)
    for t in range(1, taps + 1):
        g, y = fb ** t, 0.0
        for i in range(len(out)):
            y += alpha * (out[i] - y)
            if i + d * t < len(res):
                res[i + d * t] += y * g
    return res


def save(name, out, peak=0.7):
    m = max(abs(x) for x in out) or 1.0
    k = peak / m
    fade = int(SR * 0.004)
    with wave.open(os.path.join(HERE, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for i, x in enumerate(out):
            if i > len(out) - fade:
                x *= (len(out) - i) / fade
            frames += struct.pack('<h', int(max(-1, min(1, x * k)) * 32767))
        w.writeframes(bytes(frames))


# Style: short, low, rounded plucks (a sine with a faint octave, fast decay, almost no pitch movement) at a low
# level. No glides: rising chirps read as birdsong. Few sounds on purpose: wake, end of listening, windows, approval.
PEAK = 0.2


def pluck(o, start, f, gain=0.5, dur=0.2):
    osc(o, start, dur, f * 1.015, f, gain, 'sine', a=0.004, r=0.12, decay=16)
    osc(o, start, dur * 0.6, f * 2, None, gain * 0.14, 'sine', a=0.003, r=0.06, decay=30)


def swish(o, start, dur, gain, up=True):
    lo, hi = (700, 2600) if up else (2600, 700)
    noise(o, start, dur, gain, lo=lo, sweep=hi, a=0.03, r=dur * 0.6)


def room(o, tail=0.25):
    return delay(o, 0.09, 0.2, 2, tail, lp=2000)


# mic-on: after the wake word. Two plucks, a fourth apart, going up.
o = buf(0.3)
pluck(o, 0.0, 784, 0.5)
pluck(o, 0.075, 1047, 0.5)
save('mic-on', room(o), PEAK)

# mic-off: dropped without sending. One low, soft pluck.
o = buf(0.25)
pluck(o, 0.0, 587, 0.5, 0.18)
save('mic-off', room(o, 0.2), PEAK * 0.9)

# speech-end: the mirror of mic-on, going down: the turn has been handed over.
o = buf(0.3)
pluck(o, 0.0, 1047, 0.5)
pluck(o, 0.075, 784, 0.5)
save('speech-end', room(o), PEAK)

# window-open: a breath of air under a low pluck.
o = buf(0.35)
swish(o, 0.0, 0.16, 0.5)
pluck(o, 0.08, 659, 0.5, 0.22)
save('window-open', room(o, 0.25), PEAK)

# window-close: the breath going the other way, lower and shorter.
o = buf(0.3)
swish(o, 0.0, 0.12, 0.4, up=False)
pluck(o, 0.04, 440, 0.45, 0.16)
save('window-close', room(o, 0.2), PEAK * 0.85)

# approval: two equal plucks, the only sound that asks for attention.
o = buf(0.4)
pluck(o, 0.0, 880, 0.5)
pluck(o, 0.16, 880, 0.5)
save('approval', room(o, 0.25), PEAK * 1.2)
