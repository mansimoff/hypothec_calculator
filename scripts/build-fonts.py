#!/usr/bin/env python3
"""Пересобирает src/js/exports/fonts/plex-vfs.js из TTF в src/fonts/."""
import base64
from pathlib import Path

root = Path(__file__).resolve().parent.parent


def b64(name: str) -> str:
    return base64.b64encode((root / "src/fonts" / name).read_bytes()).decode()


out = root / "src/js/exports/fonts/plex-vfs.js"
out.write_text(
    "/* Автогенерация: scripts/build-fonts.py. IBM Plex Sans (SIL OFL 1.1) в base64 для jsPDF. */\n"
    "(function (root) {\n  'use strict';\n  root.MortgageCalc = root.MortgageCalc || {};\n"
    "  root.MortgageCalc.fonts = {\n"
    f"    regular: '{b64('IBMPlexSans-Regular.ttf')}',\n"
    f"    bold: '{b64('IBMPlexSans-SemiBold.ttf')}',\n"
    "  };\n})(typeof self !== 'undefined' ? self : globalThis);\n"
)
print("written", out, out.stat().st_size, "bytes")
