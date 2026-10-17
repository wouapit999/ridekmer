"""Composes the RideKmer marketing video (1080x1920, 30 fps, H.264) from screenshots and cards.
Usage: python3 compose.py <shots_dir> <cards_dir> <offsets_json> <out.mp4>"""
import json, subprocess, sys
from PIL import Image

shots, cards, offsets, out = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), sys.argv[4]
W, H, FPS, XF = 1080, 1920, 30, 0.45  # crossfade seconds

def load(p):
    return Image.open(p).convert("RGB")

def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)

cache = {}
def img(name, folder=None):
    key = (folder or shots, name)
    if key not in cache:
        cache[key] = load(f"{folder or shots}/{name}")
    return cache[key]

def cap(key):
    k = ("cap", key)
    if k not in cache:
        cache[k] = Image.open(f"{cards}/cap-{key}.png").convert("RGBA")
    return cache[k]

def window(page, y):
    y = int(max(0, min(y, page.height - H)))
    frame = page.crop((0, y, W, y + H))
    if frame.height < H:
        pad = Image.new("RGB", (W, H), (250, 248, 245)); pad.paste(frame, (0, 0)); frame = pad
    return frame

def zoom(frame, z):
    if z <= 1.001: return frame
    w, h = int(W / z), int(H / z)
    x, y = (W - w) // 2, (H - h) // 2
    return frame.crop((x, y, x + w, y + h)).resize((W, H), Image.LANCZOS)

# Scene: (duration, render(t)->RGB frame, caption key or None)
def static(name, z0=1.0, z1=1.04, folder=None):
    return lambda t, d: zoom(window(img(name, folder), 0), z0 + (z1 - z0) * ease(t / d))

def pan(name, y0, y1, hold=0.15):
    def r(t, d):
        p = (t / d - hold) / (1 - 2 * hold)
        return window(img(name), y0 + (y1 - y0) * ease(p))
    return r

o = offsets
cat0 = o["catalogueFirst"][0] - 140
scenes = [
    (3.2, static("intro.png", 1.0, 1.03, folder=cards), None),
    (3.4, static("01-home.png"), "home"),
    (3.4, static("02-search.png", 1.0, 1.03), "search"),
    (7.5, pan("03-catalogue.png", cat0, cat0 + 2 * (o["catalogueFirst"][1] - o["catalogueFirst"][0])), "catalogue"),
    (3.6, static("04-detail.png", 1.0, 1.05), "detail"),
    (4.2, pan("04-detail.png", o["priceDetail"] - 1250, o["priceDetail"] - 520, hold=0.1), "price"),
    (3.2, static("05-chauffeur.png"), "chauffeur"),
    (3.6, pan("06-bookings.png", 0, 520), "bookings"),
    (3.4, static("08-partner.png"), "partner"),
    (3.4, static("10-owner-form.png", 1.0, 1.03), "ownerForm"),
    (3.2, pan("09-owner.png", 0, 600), "owner"),
    (4.6, pan("11-admin.png", o["adminOverview"][0] - 120, o["adminOverview"][0] + 2300, hold=0.08), "admin"),
    (4.8, static("outro.png", 1.0, 1.02, folder=cards), None),
    (3.0, static("credits.png", 1.0, 1.0, folder=cards), None),
]

starts, t = [], 0.0
for i, (d, _, _) in enumerate(scenes):
    starts.append(t); t += d - (XF if i < len(scenes) - 1 else 0)
total = t
print(f"duration {total:.1f}s", file=sys.stderr)

def render_scene(i, t):
    d, fn, key = scenes[i]
    frame = fn(t, d).copy()
    if key:
        c = cap(key)
        a = ease((t - 0.25) / 0.35)  # caption fades and rises in
        if a > 0:
            y = 1920 - 150 - c.height + int((1 - a) * 40)
            x = (W - c.width) // 2
            layer = c if a >= 1 else Image.fromarray(__import__("numpy").array(c) * [1, 1, 1, a]).convert("RGBA") if False else c.copy()
            if a < 1:
                alpha = layer.getchannel("A").point(lambda v: int(v * a)); layer.putalpha(alpha)
            frame.paste(layer, (x, y), layer)
    return frame

ff = subprocess.Popen([
    "ffmpeg", "-y", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high", "-level", "4.1",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "64k", out,
], stdin=subprocess.PIPE)
n = int(total * FPS)
for f in range(n):
    t = f / FPS
    active = [i for i, s in enumerate(starts) if s <= t < s + scenes[i][0]]
    if len(active) == 1:
        frame = render_scene(active[0], t - starts[active[0]])
    else:
        a, b = active[0], active[-1]
        fa, fb = render_scene(a, t - starts[a]), render_scene(b, t - starts[b])
        frame = Image.blend(fa, fb, ease((t - starts[b]) / XF))
    ff.stdin.write(frame.tobytes())
ff.stdin.close(); ff.wait()
print("done", out, file=sys.stderr)
