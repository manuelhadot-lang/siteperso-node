# -*- coding: utf-8 -*-
import re
import build_notes_excel as b

_, alls = b.collect_submissions()
out = []
for k, items in sorted(alls.items()):
    m = b.merge_contents([b.extract_content(s) for s in b.dedupe_subs(items)])
    t = m["text"].lower()
    vids = m.get("videos", 0)
    imgs = m.get("images", 0)
    links = re.findall(r"https?://[^\s)\"'<>]+", t)[:10]
    media_hints = re.findall(
        r"[^\n]{0,40}(?:\.mov|\.mp4|\.m4v|\.avi|vid[eéo]|youtube|youtu\.be|drive\.google|vdo\d*)[^\n]{0,40}",
        t,
        flags=re.I,
    )[:8]
    if vids or media_hints or any(
        any(w in x for w in ("drive", "youtu", "video", "vdo", "mp4", "mov"))
        for x in links + media_hints
    ):
        out.append(f"==== {k} imgs={imgs} vids={vids}")
        out.append(f"  links: {links[:6]}")
        out.append(f"  hints: {[h.strip()[:90] for h in media_hints[:6]]}")

Path = __import__("pathlib").Path
Path("media_scan.txt").write_text("\n".join(out), encoding="utf-8")
print("written media_scan.txt lines", len(out))
