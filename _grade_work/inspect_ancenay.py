# -*- coding: utf-8 -*-
import re
from pathlib import Path
import build_notes_excel as b

_, alls = b.collect_submissions()
key = [k for k in alls if "ANCENAY" in k][0]
print("KEY", key)
for sub in b.dedupe_subs(alls[key]):
    print("SUB", sub["name"], sub["kind"], sub["size"])
    c = b.extract_content(sub)
    text = c["text"]
    Path("ancenay_text.txt").write_text(text, encoding="utf-8")
    print("imgs", c["images"], "vids", c.get("videos"), "len", len(text))
    # all urls
    urls = re.findall(r"https?://[^\s)\"'<>]+", text)
    print("URLS", len(urls))
    for u in urls:
        print(" ", u[:200])
    # mp4 mentions
    for m in re.finditer(r".{0,80}(?:mp4|mov|vid[eéo]|drive|hyperlink|lien).{0,80}", text, re.I):
        print("HIT:", m.group(0).replace("\n", " ")[:180])
    print("--- score ---")
    s1 = b.score_tp1(c)
    print({k: v for k, v in s1.items() if not k.startswith("_")})
    print("video evidence", b._has_video_evidence(c, text.lower()))
    print("photo evidence", b._has_photo_evidence(c, text.lower()))
