"""Draw the Questlog pixel-art shield icon at every size the app needs.

Writes PNGs for the web app (docs/icons) and an .icns for the macOS app (build/Questlog.icns).
Standard library only: python3 scripts/make_icons.py
"""
import os
import struct
import subprocess
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SHIELD = [
    "................",
    "..WWWWWWWWWWWW..",
    "..WbbbbbbbbbbW..",
    "..WbbbbGGbbbbW..",
    "..WbbbGggGbbbW..",
    "..WbbGggggGbbW..",
    "..WBBBGggGBBBW..",
    "..WBBBBGGBBBBW..",
    "..WBBBBBBBBBBW..",
    "...WBBBBBBBBW...",
    "...WBBBBBBBBW...",
    "....WBBBBBBW....",
    ".....WBBBBW.....",
    "......WBBW......",
    ".......WW.......",
    "................",
]
COLORS = {
    "W": (232, 235, 255, 255),
    "b": (42, 58, 162, 255),
    "B": (19, 27, 94, 255),
    "G": (255, 212, 92, 255),
    "g": (255, 236, 168, 255),
}
NIGHT = (10, 13, 38, 255)
CLEAR = (0, 0, 0, 0)


def png(path, w, h, pixels):
    raw = b"".join(b"\x00" + bytes(c for px in pixels[y * w:(y + 1) * w] for c in px) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def render(size, art_frac, rounded):
    """Shield centered on a night-sky square. art_frac = share of the canvas the 16px art spans."""
    cell = max(1, int(size * art_frac / 16))
    art = cell * 16
    off = (size - art) // 2
    radius = size * 0.225 if rounded else 0
    out = []
    for y in range(size):
        for x in range(size):
            bg = NIGHT
            if radius:
                cx = min(max(x + 0.5, radius), size - radius)
                cy = min(max(y + 0.5, radius), size - radius)
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > radius ** 2:
                    bg = CLEAR
            ax, ay = x - off, y - off
            if bg != CLEAR and 0 <= ax < art and 0 <= ay < art:
                ch = SHIELD[ay // cell][ax // cell]
                if ch in COLORS:
                    bg = COLORS[ch]
            out.append(bg)
    return out


def main():
    icons = os.path.join(ROOT, "docs", "icons")
    for name, size, frac in [("icon-180.png", 180, 0.72), ("icon-192.png", 192, 0.72),
                             ("icon-512.png", 512, 0.72), ("icon-maskable-512.png", 512, 0.56),
                             ("favicon-32.png", 32, 1.0)]:
        png(os.path.join(icons, name), size, size, render(size, frac, rounded=False))

    iconset = os.path.join(ROOT, "build", "Questlog.iconset")
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            suffix = "" if scale == 1 else "@2x"
            # macOS icons sit inside a rounded square with a little margin.
            canvas = render(px, 0.62, rounded=True) if px >= 64 else render(px, 0.8, rounded=True)
            png(os.path.join(iconset, f"icon_{base}x{base}{suffix}.png"), px, px, canvas)
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(ROOT, "build", "Questlog.icns")], check=True)
    print("icons written")


if __name__ == "__main__":
    main()
