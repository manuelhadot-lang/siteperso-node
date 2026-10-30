# -*- coding: utf-8 -*-
import io
import zipfile
import re
from xml.etree import ElementTree as ET
import build_notes_excel as b

_, alls = b.collect_submissions()
key = [k for k in alls if "ANCENAY" in k][0]
sub = b.dedupe_subs(alls[key])[0]
data = b.load_submission_bytes(sub)
zf = zipfile.ZipFile(io.BytesIO(data))

rels = zf.read("word/_rels/document.xml.rels").decode("utf-8", errors="ignore")
print("=== FULL RELS ===")
print(rels)

xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
print("\n=== hyperlink / instr / ole / package ===")
for pat in [
    r"w:hyperlink[^>]*>",
    r"HYPERLINK[^<]{0,200}",
    r"TargetMode=\"External\"[^/]*/>",
    r"Relationship[^>]+External[^>]+>",
    r"\.mp4",
    r"\.mov",
    r"vid[eé]o",
    r"oleObject",
    r"pkg:part",
    r"a:hlinkClick[^>]*>",
    r"r:link=\"[^\"]+\"",
]:
    hits = re.findall(pat, xml, flags=re.I)
    if hits:
        print(pat, "->", hits[:10])

# also search all zip members for mp4/http video hosts
print("\n=== search all members for mp4/drive ===")
for n in zf.namelist():
    raw = zf.read(n)
    if b".mp4" in raw.lower() or b"youtube" in raw.lower() or b"screenpal" in raw.lower():
        print("found in", n)
        # extract urls
        try:
            txt = raw.decode("utf-8", errors="ignore")
        except Exception:
            txt = ""
        for m in re.finditer(r"https?://[^\s\"'<>]+", txt):
            u = m.group(0)
            if any(x in u.lower() for x in ("mp4", "drive", "youtu", "video", "immich", "screenpal")):
                print(" ", u[:200])
        for m in re.finditer(r"[^\s\"'<>]{0,40}\.mp4[^\s\"'<>]{0,40}", txt, re.I):
            print(" mp4ctx:", m.group(0)[:120])

# extract visible text with more context from document order
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
root = ET.fromstring(xml)
texts = [t.text for t in root.findall(".//w:t", ns) if t.text]
print("\n=== FULL TEXT ===")
print("\n".join(texts))
