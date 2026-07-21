import json, subprocess, sys
from pathlib import Path

def check(text, field="passages.text"):
    p = subprocess.run([r".\.venv-pos-check\Scripts\python.exe", "scripts/pos-caps-check.py"], input=json.dumps({"items":[{"id":"x","field":field,"text":text}]}), capture_output=True, text=True, encoding="utf-8")
    return json.loads(p.stdout)

cases = [
 ("Spielen", None),
 ("Stärken", None),
 ("Essen t2-060", None),
 ("geräten", None),
 ("Arbeiten", None),
 ("Spät", None),
 ("Posten", None),
 ("Öffentlicher", None),
 ("schulaktivitäten", None),
 ("geräteschäden", None),
 ("Theoretisches Wissen", "questions.explanation"),
]

# load texts from files
import json as j
root = Path("batches")

def find_token(file, pool, field, token, pidx=None):
    obj = j.loads((root/pool/file).read_text(encoding="utf-8"))
    if field=="passages.text":
        return obj["passages"][pidx or 0]["text"]
    for q in obj.get("questions",[]):
        for k in ["question","explanation","signText"]:
            if field.endswith(k) and q.get(k) and token in q[k]:
                return q[k]
        for opt in q.get("options",[]):
            s = opt if isinstance(opt,str) else opt.get("text","")
            if token in s: return s

texts = {
 "Spielen": find_token("ready/lesen/lesen-t2-gemini-089.json","ready","passages.text","Spielen",0),
 "Stärken": find_token("ready/lesen/lesen-t2-gemini-089.json","ready","questions.explanation","Stärken"),
 "Essen t2-060": find_token("ready/lesen/lesen-t2-gemini-060.json","ready","passages.text","Essen",1),
 "geräten": find_token("ready/lesen/lesen-t1-gemini-174.json","ready","questions.question","geräten"),
 "Arbeiten": find_token("ready/lesen/lesen-t5-gemini-061.json","ready","questions.options","Arbeiten"),
 "Spät": find_token("ready/lesen/lesen-t5-gemini-061.json","ready","questions.question","Spät"),
 "Posten": find_token("generated/lesen-t5-gemini-062.json","generated","questions.options","Posten"),
 "Öffentlicher": find_token("ready/lesen/lesen-t4-gemini-035.json","ready","questions.explanation","Öffentlicher"),
 "schulaktivitäten": find_token("generated/lesen-t5-gemini-062.json","generated","passages.text","schulaktivitäten"),
 "geräteschäden": find_token("generated/lesen-t5-gemini-062.json","generated","passages.text","geräteschäden"),
 "Theoretisches Wissen": "Theoretisches Wissen hilft bei der Prüfung.",
}

for name, text in texts.items():
    if not text:
        print(name, "NO TEXT"); continue
    r = check(text)
    fs = [f"{f['type']}:{f['word']}({f['tag']}/{f['reason']})" for f in r.get("findings",[])]
    print(f"\n=== {name} ===")
    print(text[:120].replace("\n"," "))
    print(" ->", fs if fs else "NONE")
