#!/usr/bin/env python3
"""
Imports one course book into Unihub.

  python3 import_book.py --base https://unihub-beta.vercel.app --token <apps-script token> \
      --course 20109 --title "אלגברה לינארית 1, כרך א" (--file book.pdf | --raw raw/20109-a.pdf) [--position 0]

Splits the PDF into chapters (from its own table of contents, or 30-page parts when it has none),
uploads each chapter to the user's private storage, registers the book, then sends each chapter's
text (pages separated by form feeds) for search, summaries and practice questions.
Needs: pip install pymupdf requests
"""
import argparse, hashlib, io, json, re, sys, urllib.request

import pymupdf


def call(base, token, path, payload):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def put(url, data):
    req = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": "application/pdf", "x-upsert": "true"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.status


def get(url):
    with urllib.request.urlopen(url, timeout=600) as r:
        return r.read()


def clean_title(t):
    t = re.sub(r"\s+", " ", t or "").strip(" .")
    return t[:200] or "פרק"


def chapters_of(doc, max_parts=40, chunk=30):
    """[(title, start, end)] with 1-based inclusive pages."""
    n = doc.page_count
    toc = [(lvl, clean_title(t), p) for lvl, t, p in doc.get_toc(simple=True) if 1 <= p <= n]
    for level in (1, 2):
        tops = [(t, p) for lvl, t, p in toc if lvl == level]
        # need at least 2 sections, not absurdly many
        if 2 <= len(tops) <= max_parts:
            break
    else:
        tops = []
    if not tops:
        return [(f"חלק {i // chunk + 1} (עמ׳ {i + 1}–{min(n, i + chunk)})", i + 1, min(n, i + chunk)) for i in range(0, n, chunk)]
    tops.sort(key=lambda x: x[1])
    out = []
    if tops[0][1] > 1:
        out.append(("פתח דבר ותוכן", 1, tops[0][1] - 1))
    for i, (t, p) in enumerate(tops):
        end = (tops[i + 1][1] - 1) if i + 1 < len(tops) else n
        if end >= p:
            out.append((t, p, end))
    return out


def page_text(page):
    # sort=True gives reading order; Hebrew comes out in logical order with pymupdf's default flags
    t = page.get_text("text", sort=True)
    return re.sub(r"[ \t]+\n", "\n", t).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--token", required=True)
    ap.add_argument("--course", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--file")
    ap.add_argument("--raw", help="storage path of an uploaded raw PDF (inside the user's folder)")
    ap.add_argument("--position", type=int, default=0)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    base = a.base.rstrip("/")

    if a.file:
        data = open(a.file, "rb").read()
        source = None
    elif a.raw:
        data = get(call(base, a.token, "/api/books/download", {"path": a.raw})["url"])
        source = a.raw
    else:
        sys.exit("need --file or --raw")

    doc = pymupdf.open(stream=data, filetype="pdf")
    parts = chapters_of(doc)
    slug = a.course + "-" + hashlib.sha1((a.title + str(len(data))).encode()).hexdigest()[:10]
    print(f"{a.title}: {doc.page_count} pages, {len(parts)} chapters")
    for i, (t, s, e) in enumerate(parts):
        print(f"  {i:2d}. {s:4d}-{e:4d}  {t}")
    if a.dry:
        return

    paths = [f"books/{slug}/{i:02d}.pdf" for i in range(len(parts))]
    ups = {u["path"].split("/", 1)[1]: u for u in call(base, a.token, "/api/books/upload", {"paths": paths})["uploads"]}
    texts = []
    for i, (t, s, e) in enumerate(parts):
        part = pymupdf.open()
        part.insert_pdf(doc, from_page=s - 1, to_page=e - 1)
        buf = io.BytesIO()
        part.save(buf, garbage=4, deflate=True)
        u = ups.get(paths[i])
        if not u or "url" not in u:
            sys.exit(f"no upload url for {paths[i]}: {u}")
        put(u["url"], buf.getvalue())
        texts.append("\f".join(page_text(doc[p]) for p in range(s - 1, e)))
        print(f"  uploaded {i + 1}/{len(parts)} ({len(buf.getvalue()) // 1024} KB)")

    res = call(base, a.token, "/api/books/import", {
        "course_code": a.course, "title": a.title, "source_path": source, "pages": doc.page_count,
        "position": a.position,
        "chapters": [{"idx": i, "title": t, "start_page": s, "end_page": e, "storage_path": paths[i]} for i, (t, s, e) in enumerate(parts)],
    })
    ids = {c["idx"]: c["id"] for c in res["chapters"]}
    for i, txt in enumerate(texts):
        call(base, a.token, "/api/books/text", {"chapter_id": ids[i], "text": txt})
    print(f"done: book {res['book']}, {len(ids)} chapters, {sum(len(t) for t in texts)} chars of text")


if __name__ == "__main__":
    main()
