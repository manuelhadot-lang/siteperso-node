# -*- coding: utf-8 -*-
from pathlib import Path
import zipfile
import io
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_notes_excel as b

TP = Path(r"c:\Users\mhado\Desktop") / "TP récupéré"
out = []
out.append(f"TP dir exists: {TP.exists()} -> {TP}")

for p in sorted(TP.iterdir()):
    out.append(f"{'DIR' if p.is_dir() else 'FILE'} {p.name} {p.stat().st_size if p.is_file() else ''}")

def list_tree(folder: Path, prefix=""):
    for p in sorted(folder.rglob("*")):
        if p.is_file():
            out.append(f"  {p.relative_to(folder)} ({p.stat().st_size})")

out.append("\n=== Boucher ===")
list_tree(TP / "Boucher")
out.append("\n=== Normand_Francois ===")
list_tree(TP / "Normand_Francois")

for zname in [
    "SIN_TP2_Constance_BENOIT_Romain_ANCENAY.zip",
    "TP_2_HOEFFLER_Léo_WIPFF_Hugo_1STI2D1.zip",
]:
    zp = TP / zname
    if not zp.exists():
        # try fuzzy
        cands = list(TP.glob("SIN_TP2*.zip")) + list(TP.glob("TP_2_HOEFFLER*.zip"))
        out.append(f"missing {zname}, cands={[c.name for c in cands]}")
        continue
    out.append(f"\n=== ZIP {zp.name} ===")
    with zipfile.ZipFile(zp) as zf:
        for n in zf.namelist()[:40]:
            out.append(f"  {n}")

docx = list(TP.glob("TP_2_Mesurer*.docx"))
if docx:
    out.append(f"\n=== DOCX {docx[0].name} ===")
    d = b.analyze_docx_bytes(docx[0].read_bytes())
    out.append(f"imgs={d['images']} vids={d['videos']} textlen={len(d['text'])}")
    out.append(d["text"][:2500])

Path("tp2_recup_inspect.txt").write_text("\n".join(out), encoding="utf-8")
print("written", len(out), "lines")
