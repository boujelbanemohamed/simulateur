import json, re

lines = open("visa-mds.txt").read().split("\n")

JUNK = re.compile(
    r"^(===PAGE \d+===|Merchant Data Standards Manual.*|April \d{4} VISA PUBLIC.*|MCC\s*$|MCC Title/\s*$|"
    r"MCC Description Included in this MCC Similar Merchants\s*$|Section \d+:.*|\d{1,3}\s*$)"
)
HEADER = re.compile(r"^(\d{4}) (?!–|-)(.+?)\s*$")
SIMILAR = re.compile(r"^(\d{4})\s*[–-]\s*(.*)$")

# restrict to the descriptive listing: starts at the first "4011 Railroads" header
start = next(i for i, l in enumerate(lines) if l.strip().startswith("4011 Railroads"))
end = next(i for i, l in enumerate(lines) if "New MCC or MCC Change Requests" in l and i > start)

clean = []
for l in lines[start:end]:
    s = l.strip()
    if not s or JUNK.match(s):
        continue
    clean.append(s)

entries = []
cur = None
for s in clean:
    m = HEADER.match(s)
    if m and not SIMILAR.match(s):
        code, title = m.group(1), m.group(2).strip()
        # a real header has a Title Case/UPPER title, not a lowercase sentence fragment
        if title[:1].isupper():
            cur = {"code": code, "title": title, "body": []}
            entries.append(cur)
            continue
    if cur is not None:
        cur["body"].append(s)

out = []
for e in entries:
    body = e["body"]
    # split off the "Similar Merchants" column: everything from the first "NNNN – ..." line
    first_sim = next((i for i, s in enumerate(body) if SIMILAR.match(s)), len(body))
    pre, sim_lines = body[:first_sim], body[first_sim:]

    similar = []
    for s in sim_lines:
        m = SIMILAR.match(s)
        if m:
            similar.append(m.group(1))
    similar = sorted(set(similar))

    # description = up to the last line ending a sentence; the rest is "Included in this MCC"
    last_dot = max((i for i, s in enumerate(pre) if s.endswith(".")), default=-1)
    desc = " ".join(pre[: last_dot + 1])
    desc = re.sub(r"\s+", " ", desc).strip()
    included_raw = pre[last_dot + 1 :]

    # "Included in this MCC" items wrap across lines: a new item starts on a capitalized line
    included = []
    for s in included_raw:
        if included and not s[:1].isupper():
            included[-1] += " " + s
        else:
            included.append(s)
    included = [re.sub(r"\s+", " ", i).strip() for i in included if i.strip()]

    out.append({
        "code": e["code"],
        "titleEn": e["title"],
        "descriptionEn": desc,
        "includedEn": included,
        "similar": similar,
    })

# de-duplicate (a code can appear once); keep the richest entry
byCode = {}
for e in out:
    prev = byCode.get(e["code"])
    if prev is None or len(e["descriptionEn"]) > len(prev["descriptionEn"]):
        byCode[e["code"]] = e
out = [byCode[c] for c in sorted(byCode)]

json.dump(out, open("mcc-visa-raw.json", "w"), indent=2, ensure_ascii=False)
print("entries:", len(out))
print("sans description:", sum(1 for e in out if not e["descriptionEn"]))
