# tools

Developer utilities for Kagari. These are not part of the app bundle; they only
help maintain assets in the repo.

## generate_launcher_icons.py

Regenerates the Android launcher icons from one master image,
`design/kagari-icon.png`, so you never have to hand-export each density.

For every mipmap density (mdpi through xxxhdpi) it writes into
`android/app/src/main/res/mipmap-*`:

- `ic_launcher_foreground.png`: transparent flame sized for the adaptive-icon safe zone
- `ic_launcher.png`: flame on the brand background, rounded square
- `ic_launcher_round.png`: flame on the brand background, circular

### Running it

Requires Python 3 and [Pillow](https://python-pillow.org/). Using a throwaway
virtual environment keeps your system Python clean:

```sh
python3 -m venv /tmp/iconvenv
/tmp/iconvenv/bin/pip install pillow
/tmp/iconvenv/bin/python tools/generate_launcher_icons.py
```

Run it whenever you replace `design/kagari-icon.png`, then rebuild the app so the
new icons are picked up. Tuning knobs (luminance key window, sizes, safe-zone
fractions) live at the top of the script.
