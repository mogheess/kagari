#!/usr/bin/env python3
"""Regenerate Android launcher icons from design/kagari-icon.png.

Produces, for every mipmap density:
  - ic_launcher_foreground.png  (transparent flame, sized for the adaptive safe zone)
  - ic_launcher.png             (flame on the brand background, rounded square)
  - ic_launcher_round.png       (flame on the brand background, circular)

Run after replacing the source art:
  /tmp/iconvenv/bin/python tools/generate_launcher_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design" / "kagari-icon.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

BACKGROUND = (14, 20, 19, 255)  # @color/ic_launcher_background (#0E1413)

# Luminance window used to lift the bright flame off the near-black field.
KEY_LO = 45
KEY_HI = 110

FOREGROUND_SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
LEGACY_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

FOREGROUND_FRACTION = 0.62  # flame fits inside the adaptive-icon safe zone
LEGACY_FRACTION = 0.74


def load_flame() -> Image.Image:
    master = Image.open(SOURCE).convert("RGB")
    luminance = master.convert("L")
    alpha = luminance.point(
        lambda v: 0 if v <= KEY_LO else (255 if v >= KEY_HI else int((v - KEY_LO) / (KEY_HI - KEY_LO) * 255))
    )
    flame = master.convert("RGBA")
    flame.putalpha(alpha)

    core = luminance.point(lambda v: 255 if v >= KEY_HI else 0)
    box = core.getbbox()
    if box is None:
        raise SystemExit("No flame detected; check KEY_LO/KEY_HI against the source art.")
    pad = round(0.04 * max(box[2] - box[0], box[3] - box[1]))
    box = (
        max(box[0] - pad, 0),
        max(box[1] - pad, 0),
        min(box[2] + pad, flame.width),
        min(box[3] + pad, flame.height),
    )
    return flame.crop(box)


def scaled(flame: Image.Image, target: int) -> Image.Image:
    ratio = target / max(flame.width, flame.height)
    size = (max(round(flame.width * ratio), 1), max(round(flame.height * ratio), 1))
    return flame.resize(size, Image.LANCZOS)


def centered(canvas: Image.Image, sprite: Image.Image) -> None:
    x = (canvas.width - sprite.width) // 2
    y = (canvas.height - sprite.height) // 2
    canvas.alpha_composite(sprite, (x, y))


def write(image: Image.Image, density: str, name: str) -> None:
    out_dir = RES / f"mipmap-{density}"
    out_dir.mkdir(parents=True, exist_ok=True)
    image.save(out_dir / name)


def main() -> None:
    flame = load_flame()

    for density, size in FOREGROUND_SIZES.items():
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        centered(canvas, scaled(flame, round(size * FOREGROUND_FRACTION)))
        write(canvas, density, "ic_launcher_foreground.png")

    for density, size in LEGACY_SIZES.items():
        sprite = scaled(flame, round(size * LEGACY_FRACTION))

        square = Image.new("RGBA", (size, size), BACKGROUND)
        centered(square, sprite)
        radius = round(size * 0.20)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
        square.putalpha(mask)
        write(square, density, "ic_launcher.png")

        circle = Image.new("RGBA", (size, size), BACKGROUND)
        centered(circle, sprite)
        round_mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(round_mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        circle.putalpha(round_mask)
        write(circle, density, "ic_launcher_round.png")

    print("Launcher icons regenerated.")


if __name__ == "__main__":
    main()
