#!/usr/bin/env python3
"""Bake art/source/*.png into assets/sprites/*.png.

Each sprite is area-averaged (premultiplied alpha) down to its on-screen size from art/sprites.json,
alpha is thresholded to 0/255, colours are snapped to art/palette.hex (nearest in OKLab) and the
result is written as an indexed PNG (index 0 = transparent). The road is quantized without resizing.

  python3 tools/build_sprites.py                 # build everything
  python3 tools/build_sprites.py --derive 48     # (re)derive art/palette.hex from the sources first
  python3 tools/build_sprites.py --sheet out.png # also write a before/after contact sheet

Needs Pillow, numpy and scipy (scikit-learn only for --derive).
"""
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'art' / 'source', ROOT / 'assets' / 'sprites'
M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]])


def to_lab(rgb8):
    c = rgb8.astype(float) / 255
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return np.cbrt(lin @ M1.T) @ M2.T


def to_rgb8(lab):
    lin = np.clip(((lab @ np.linalg.inv(M2).T) ** 3) @ np.linalg.inv(M1).T, 0, 1)
    c = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return np.clip(np.round(c * 255), 0, 255).astype(np.uint8)


def load_palette():
    rows = [l.strip() for l in (ROOT / 'art' / 'palette.hex').read_text().split() if l.strip()]
    return np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in rows], dtype=np.uint8)


def dims(spec):
    """sprites.json entry: N, or {"size": N, "margin": M} (transparent margin inside the frame)."""
    if isinstance(spec, dict):
        return spec['size'], spec.get('margin', 0)
    return spec, 0


def bake(name, spec):
    size, margin = dims(spec) if spec else (None, 0)
    src = Image.open(SRC / f'{name}.png')
    if size:
        inner = size - 2 * margin
        src = src.convert('RGBa').resize((inner, inner), Image.BOX).convert('RGBA')
        if margin:
            framed = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            framed.paste(src, (margin, margin))
            src = framed
    a = np.array(src.convert('RGBA'))
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return a


def quantize(a, pal):
    m = a[..., 3] == 255
    idx = np.zeros(a.shape[:2], np.uint8)
    idx[m] = cKDTree(to_lab(pal)).query(to_lab(a[m][:, :3]))[1] + 1
    img = Image.fromarray(idx, 'P')
    flat = [0, 0, 0] + [int(v) for c in pal for v in c]
    img.putpalette(flat + [0] * (768 - len(flat)))
    return img, idx


def derive_palette(k, sizes):
    from sklearn.cluster import KMeans
    rng = np.random.default_rng(1)
    labs, ws = [], []
    for name in list(sizes) + ['road']:
        a = bake(name, sizes.get(name))
        px = a[a[..., 3] == 255][:, :3]
        if len(px) > 30000:
            px = px[rng.choice(len(px), 30000, replace=False)]
        lab = to_lab(px)
        chroma = np.hypot(lab[:, 1], lab[:, 2])
        labs.append(lab)
        ws.append((1.5 if name == 'road' else 1.0) / len(px) * (1 + 3 * chroma))
    km = KMeans(n_clusters=k, n_init=10, random_state=1).fit(np.vstack(labs), sample_weight=np.concatenate(ws))
    pal = np.unique(to_rgb8(km.cluster_centers_), axis=0)
    pal = pal[np.argsort(to_lab(pal)[:, 0])]
    (ROOT / 'art' / 'palette.hex').write_text('\n'.join('%02x%02x%02x' % tuple(c) for c in pal) + '\n')
    print(f'derived {len(pal)} colours -> art/palette.hex')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--derive', type=int, metavar='N')
    ap.add_argument('--sheet', metavar='PNG')
    args = ap.parse_args()
    sizes = {k: v for k, v in json.loads((ROOT / 'art' / 'sprites.json').read_text()).items() if not k.startswith('_')}
    if args.derive:
        derive_palette(args.derive, sizes)
    pal = load_palette()
    OUT.mkdir(parents=True, exist_ok=True)
    total, tiles = 0, []
    for name in list(sizes) + ['road']:
        a = bake(name, sizes.get(name))
        img, idx = quantize(a, pal)
        path = OUT / f'{name}.png'
        img.save(path, optimize=True, transparency=0)
        total += path.stat().st_size
        print(f'{name:11s} {a.shape[1]}x{a.shape[0]}  {path.stat().st_size / 1024:6.1f} KB')
        if name != 'road':
            tiles.append(Image.open(path).convert('RGBA'))
    print(f'total {total / 1024:.1f} KB, palette {len(pal)} colours')
    if args.sheet:
        w = sum(t.width for t in tiles) + 10 * (len(tiles) + 1)
        sheet = Image.new('RGBA', (w, 170), (107, 107, 107, 255))
        x = 10
        for t in tiles:
            sheet.alpha_composite(t, (x, 8)); x += t.width + 10
        sheet.convert('RGB').resize((w * 2, 340), Image.NEAREST).save(args.sheet)


if __name__ == '__main__':
    sys.exit(main())
