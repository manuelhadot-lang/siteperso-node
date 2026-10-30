# -*- coding: utf-8 -*-
import json
from pathlib import Path

d = json.loads(Path("eleves.json").read_text(encoding="utf-8-sig"))
print("classes", list(d.keys()))
for k, v in d.items():
    print("==", k, len(v))
    for e in sorted(v, key=lambda x: (x.get("nom", ""), x.get("prenom", ""))):
        print(f"  {e.get('nom')} {e.get('prenom')} [{e.get('code')}]")
