# -*- coding: utf-8 -*-
import io
import zipfile
import re
from pathlib import Path
import build_notes_excel as b

_, alls = b.collect_submissions()
key = [k for k in alls if "ANCENAY" in k][0]
sub = b.dedupe_subs(alls[key])[0]
data = b.load_submission_bytes(sub)
zf = zipfile.ZipFile(io.BytesIO(data))
print("files sample:")
for n in zf.namelist():
    if "media" in n.lower() or "rel" in n.lower() or n.endswith(".xml"):
        if "theme" in n or "font" in n:
            continue
        print(" ", n, zf.getinfo(n).file_size)

# relationships
for relpath in ["word/_rels/document.xml.rels", "word/_rels/header1.xml.rels"]:
    if relpath in zf.namelist():
        xml = zf.read(relpath).decode("utf-8", errors="ignore")
        print("\n===", relpath, "===")
        for m in re.finditer(r'Target="([^"]+)"', xml):
            t = m.group(1)
            if t.startswith("http") or "mp4" in t.lower() or "mov" in t.lower() or "drive" in t.lower():
                print(" TARGET:", t[:250])

# hyperlinks in document
xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
for m in re.finditer(r"https?://[^\"<\s]+", xml):
    print("DOC URL:", m.group(0)[:250])
# instrText HYPERLINK
for m in re.finditer(r"HYPERLINK\s+&quot;([^&]+)&quot;|HYPERLINK\s+\"([^\"]+)\"", xml):
    print("INSTR:", (m.group(1) or m.group(2))[:250])
