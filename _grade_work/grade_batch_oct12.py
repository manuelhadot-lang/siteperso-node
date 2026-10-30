# -*- coding: utf-8 -*-
"""Corrige une série de rendus (oct 12) et met à jour Notes_TP1_TP2_1ere_STI2D_maj_TP2.xlsx
sans toucher à l'original Notes_TP1_TP2_1ere_STI2D.xlsx."""
from __future__ import annotations

import io
import re
import shutil
import zipfile
from pathlib import Path

import build_notes_excel as b
from openpyxl import load_workbook
from openpyxl.styles import Font

ORIG = b.OUT_XLSX
MAJ = ORIG.with_name("Notes_TP1_TP2_1ere_STI2D_maj_TP2.xlsx")

BATCH = [
    {
        "key": "KOMMEGNE_ANNAELLE",
        "also": [],
        "path": Path(r"c:\Users\mhado\Downloads\KOMMEGNE_Annaëlle_2026-10-12 (1).odt"),
    },
    {
        "key": "KUCHLY_LUCIEN",
        "also": [],
        "path": Path(r"c:\Users\mhado\Desktop\TP récupéré\KUCHLY_Lucien_2026-10-12 (1)"),
    },
    {
        "key": "LEGER_MAXIME",
        "also": [],
        "path": Path(r"c:\Users\mhado\Downloads\LEGER_Maxime_2026-10-12 (2).zip"),
    },
    {
        "key": "MEHREZI_NAHIL",
        "also": [],
        "path": Path(r"c:\Users\mhado\Desktop\TP récupéré\MEHREZI_Nahil_2026-10-12.zip"),
    },
    {
        "key": "MONTERO_PIERRE",
        "also": [],
        "path": Path(r"c:\Users\mhado\Downloads\MONTERO_Pierre_2026-10-12 (3).zip"),
    },
]


def content_from_path(p: Path) -> dict:
    if p.is_dir():
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in p.rglob("*"):
                if f.is_file():
                    zf.write(f, arcname=str(f.relative_to(p)).replace("\\", "/"))
        zinfo = b.analyze_zip_bytes(buf.getvalue())
        return {
            "filename": p.name + "/",
            "size": sum(f.stat().st_size for f in p.rglob("*") if f.is_file()),
            "text": p.name + "\n" + zinfo["text"],
            "images": zinfo["images"],
            "videos": zinfo.get("videos", 0),
            "inos": zinfo.get("inos", []),
            "ext": "dir",
        }
    name = p.name.lower()
    data = p.read_bytes()
    out = {
        "filename": p.name,
        "size": p.stat().st_size,
        "text": p.name + "\n",
        "images": 0,
        "videos": 0,
        "inos": [],
        "ext": p.suffix.lower(),
    }
    if name.endswith(".docx"):
        d = b.analyze_docx_bytes(data)
        out["text"] += d["text"]
        out["images"] = d.get("images", 0)
        out["videos"] = d.get("videos", 0)
    elif name.endswith(".odt"):
        d = b.analyze_odt_bytes(data)
        out["text"] += d["text"]
        out["images"] = d.get("images", 0)
        out["videos"] = d.get("videos", 0)
    elif name.endswith(".zip"):
        zinfo = b.analyze_zip_bytes(data)
        out["text"] += zinfo["text"]
        out["images"] = zinfo["images"]
        out["videos"] = zinfo.get("videos", 0)
        out["inos"] = zinfo.get("inos", [])
    else:
        out["text"] += data.decode("utf-8", errors="ignore")
    return out


def norm_cell(s: str) -> str:
    s = (s or "").upper()
    for a, c in [
        ("É", "E"), ("È", "E"), ("Ê", "E"), ("Ë", "E"),
        ("À", "A"), ("Â", "A"), ("Ù", "U"), ("Û", "U"),
        ("Ô", "O"), ("Î", "I"), ("Ï", "I"), ("Ç", "C"), ("Œ", "OE"),
        ("Ä", "A"), ("Ö", "O"), ("Ü", "U"),
    ]:
        s = s.replace(a, c)
    return re.sub(r"[^A-Z0-9 ]", "", s)


def find_row(ws, key: str):
    """Trouve la ligne élève correspondant à KEY=NOM_PRENOM."""
    nom_u, prenom_u = key.split("_", 1)
    prenom_u = prenom_u.replace("_", " ")
    for r in range(3, ws.max_row + 1):
        cell = norm_cell(str(ws.cell(r, 1).value or ""))
        if not cell:
            continue
        # "KOMMEGNE ANNAELLE" etc.
        if nom_u in cell.replace(" ", "") or cell.startswith(nom_u.replace("-", " ")):
            # prenom: first token of prenom_u
            p0 = prenom_u.split()[0]
            if p0[:4] in cell.replace(" ", ""):
                return r
            tokens = cell.split()
            if tokens and p0[:3] in tokens[-1]:
                return r
    return None


def apply_scores(ws, row: int, s1: dict, s2: dict, label: str):
    tp1_n = len(b.TP1_COLS)
    tp2_n = len(b.TP2_COLS)
    col_tp1 = 3
    col_tp1_tot = 3 + tp1_n
    col_tp2 = col_tp1_tot + 1
    col_tp2_tot = col_tp2 + tp2_n
    col_grand = col_tp2_tot + 1
    col_comment = col_grand + 1

    prev_f = ws.cell(row, 2).value or ""
    mark = f" + {label}"
    if label not in str(prev_f):
        ws.cell(row, 2, str(prev_f) + mark)

    t1 = t2 = 0
    if s1.get("_rendu"):
        for i, (k, mx, _) in enumerate(b.TP1_COLS):
            val = s1.get(k, 0)
            ws.cell(row, col_tp1 + i, val)
            t1 += val
        ws.cell(row, col_tp1_tot, t1)
        ws.cell(row, col_tp1_tot).font = Font(bold=True)
    else:
        # garder total TP1 existant si présent
        try:
            t1 = float(ws.cell(row, col_tp1_tot).value or 0)
        except Exception:
            t1 = 0

    if s2.get("_rendu"):
        for i, (k, mx, _) in enumerate(b.TP2_COLS):
            val = s2.get(k, 0)
            ws.cell(row, col_tp2 + i, val)
            t2 += val
        ws.cell(row, col_tp2_tot, t2)
        ws.cell(row, col_tp2_tot).font = Font(bold=True)
    else:
        try:
            existing = ws.cell(row, col_tp2_tot).value
            t2 = float(existing) if existing not in (None, "") else 0
        except Exception:
            t2 = 0

    # Si nouveau TP1 et ancien TP1 existait, on prend le max total TP1
    if s1.get("_rendu"):
        try:
            old = ws.cell(row, col_tp1_tot).value
            # already written t1; if we want max with previous before overwrite — handled by re-read
        except Exception:
            pass

    ws.cell(row, col_grand, (t1 if s1.get("_rendu") or t1 else 0) + (t2 if s2.get("_rendu") or t2 else 0))
    # Fix grand total properly
    try:
        t1f = float(ws.cell(row, col_tp1_tot).value or 0)
    except Exception:
        t1f = 0
    try:
        t2f = float(ws.cell(row, col_tp2_tot).value or 0)
    except Exception:
        t2f = 0
    if ws.cell(row, col_tp1_tot).value not in (None, "") or ws.cell(row, col_tp2_tot).value not in (None, ""):
        ws.cell(row, col_grand, t1f + t2f)
        ws.cell(row, col_grand).font = Font(bold=True)

    bits = []
    if s1.get("_rendu"):
        bits.append(f"TP1={t1}/20")
    if s2.get("_rendu"):
        bits.append(f"TP2={t2}/20")
    note = f"Corrigé {label}: " + " ; ".join(bits)
    com = str(ws.cell(row, col_comment).value or "")
    # nettoyer "non rendu" si on a noté
    if s1.get("_rendu"):
        com = com.replace("TP1 non identifiable / non rendu", "").strip(" ;")
    if s2.get("_rendu"):
        com = com.replace("TP2 non identifiable / non rendu", "").strip(" ;")
    if note not in com:
        ws.cell(row, col_comment, (com + " ; " if com else "") + note)


def main():
    results = []
    for item in BATCH:
        p = item["path"]
        print(f"\n=== {item['key']} | {p} exists={p.exists()} ===")
        if not p.exists():
            print("  MANQUANT")
            continue
        content = content_from_path(p)
        s1 = b.score_tp1(content)
        s2 = b.score_tp2(content)
        t1 = sum(v for k, v in s1.items() if not k.startswith("_"))
        t2 = sum(v for k, v in s2.items() if not k.startswith("_"))
        print(f"  imgs={content['images']} vids={content['videos']} textlen={len(content['text'])}")
        print(f"  TP1={'oui' if s1.get('_rendu') else 'non'} {t1}/20 | TP2={'oui' if s2.get('_rendu') else 'non'} {t2}/20")
        print("  TP1 detail", {k: v for k, v in s1.items() if not k.startswith("_")})
        print("  TP2 detail", {k: v for k, v in s2.items() if not k.startswith("_") and v})
        preview = Path(__file__).parent / f"preview_batch_{item['key']}.txt"
        preview.write_text(content["text"][:3000], encoding="utf-8")
        results.append({**item, "content": content, "s1": s1, "s2": s2, "t1": t1, "t2": t2, "label": p.name})

    # Base = maj existante, sinon copie de l'original
    if MAJ.exists():
        print("\nBase Excel:", MAJ.name)
        src = MAJ
    else:
        print("\nCréation maj depuis original")
        shutil.copy2(ORIG, MAJ)
        src = MAJ

    # Toujours travailler sur une copie fraîche de la maj actuelle
    # (on écrase maj, pas l'original)
    wb = load_workbook(src)

    for res in results:
        keys = [res["key"]] + res.get("also", [])
        found = False
        for sheet in wb.sheetnames:
            if sheet in ("Barème", "TP2 ajoutés", "Ajouts"):
                continue
            ws = wb[sheet]
            for key in keys:
                row = find_row(ws, key)
                if row:
                    # Pour TP1: si déjà noté et nouveau score plus bas, garder le max par question
                    # Simplifié: si nouveau TP1 rendu, écrire (souvent complément TP2)
                    # Si Montero a déjà TP1, et nouveau fichier a aussi TP1, prendre max totaux
                    s1 = dict(res["s1"])
                    s2 = dict(res["s2"])
                    if s1.get("_rendu"):
                        old_tot = ws.cell(row, 3 + len(b.TP1_COLS)).value
                        try:
                            old_t = float(old_tot) if old_tot not in (None, "") else None
                        except Exception:
                            old_t = None
                        new_t = res["t1"]
                        if old_t is not None and old_t > new_t and not s2.get("_rendu"):
                            # ne pas dégrader TP1 si le nouveau fichier est surtout autre chose
                            s1 = {"_rendu": False}
                            print(f"  (conserve TP1 existant {old_t} > nouveau {new_t})")
                        elif old_t is not None and old_t > new_t and s2.get("_rendu"):
                            # fichier mixte: garder meilleur TP1, appliquer TP2
                            s1 = {"_rendu": False}
                            print(f"  (conserve TP1 {old_t}, applique TP2)")
                    apply_scores(ws, row, s1, s2, res["label"])
                    print(f"  OK {sheet} row {row} {key}")
                    found = True
        if not found:
            print(f"  NON TROUVÉ dans Excel: {keys}")

    # feuille Ajouts
    name = "Ajouts oct12"
    if name in wb.sheetnames:
        del wb[name]
    ws = wb.create_sheet(name, 0)
    ws["A1"] = "Rendus ajoutés / corrigés (original Excel non modifié)"
    ws["A1"].font = Font(bold=True, size=12)
    ws.append(["Élève", "Fichier", "TP1 /20", "TP2 /20"])
    for res in results:
        ws.append([
            ", ".join([res["key"]] + res.get("also", [])),
            res["label"],
            res["t1"] if res["s1"].get("_rendu") else "—",
            res["t2"] if res["s2"].get("_rendu") else "—",
        ])
    ws.column_dimensions["A"].width = 36
    ws.column_dimensions["B"].width = 55
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12

    wb.save(MAJ)
    print("\nSauvé:", MAJ)
    print("Original intact:", ORIG, "exists=", ORIG.exists())


if __name__ == "__main__":
    main()
