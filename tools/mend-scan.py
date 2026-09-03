#!/usr/bin/env python3
"""
mend-scan.py

Rebuilds an Internet Archive OCR EPUB into something worth reading.

    python3 tools/mend-scan.py in.epub out.epub \
        --title "Мастер и Маргарита" --author "Михаил Булгаков" --lang ru

The Archive's automatic conversion produces text that is often perfectly
good and a container that is not. Measured on one: 695 files, one per
scanned page, every one of them beginning with the literal words "Page 10";
no title, no author, no declared language; and an Archive notice sitting
where the first chapter should be.

That costs real things. The page numbers are read out loud in the middle of
sentences. A missing language means the reader picks the device's own voice,
so a Russian novel is spoken by an English one. A file per printed page means
no chapters, no table of contents, and no sense of how far through she is.

This finds the chapter headings the OCR already captured, joins the loose
pages back into chapters, strips the running heads, and writes the metadata.
Nothing in the prose is altered.

Chapter patterns are Russian by default. Pass --heading for another language.
"""

import argparse
import html
import os
import re
import sys
import uuid
import zipfile

# Chapter openings, as they appear at the very start of a scanned page.
RU_HEADING = r'(?:Часть\s+\w+|ГЛАВА\s+\d+|Глава\s+\d+|ЭПИЛОГ|Эпилог|Пролог)'

# Pages the Archive adds that are not part of the book.
ARCHIVE_PAGE = re.compile(r'notice|cover', re.I)

# The scan usually keeps the book's own contents page, which carries the
# chapter titles exactly as the publisher set them. Guessing them out of the
# running prose gets "Понтий Пилат В белом плаще с кровавым"; reading them
# here gets "Понтий Пилат".
TOC_LINE = re.compile(r'Глава\s+(\d+)\s+(.*?)(?=\s*(?:\[\d+\])?\s*(?:Глава\s+\d+|Часть\s|Эпилог|$))')


def titles_from_contents(pages, read):
    """{chapter number: title} taken from the scanned contents page."""
    out = {}
    for name in pages[:12]:
        t = read(name)
        if 'Оглавление' not in t and len(TOC_LINE.findall(t)) < 3:
            continue
        for num, title in TOC_LINE.findall(t):
            title = re.sub(r'\[\d+\]', '', title).strip(' .—-')
            if title and len(title) < 70:
                out[int(num)] = title
    return out


# Footnote references the OCR scattered through the prose: "[137]", "(1,",
# an unclosed "[1.", a stray "196]". They are read out loud mid-sentence.
FOOTNOTE_NOISE = [
    re.compile(r'\s*\[\s*\d+\s*\]'),      # [137]
    re.compile(r'\s*\[\s*\d+(?=[\s.,])'),   # [1 . or [1,
    re.compile(r'(?<=[а-яё])\s*\d+\s*\]'),  # Москву 196]
    re.compile(r'\s*"\s*\d+(?=[\s.,])'),    # "1
    re.compile(r'(?<=[а-яё])\s+Ё!(?=\s)'),  # a marker the OCR read as Ё!
    re.compile(r'(?<=[А-ЯЁа-яё])\s+Г\](?=[\s,.])'),
]


def denoise(text):
    """Strip OCR footnote markers. Returns (text, how many removed)."""
    n = 0
    for pat in FOOTNOTE_NOISE:
        text, k = pat.subn('', text)
        n += k
    return re.sub(r'\s{2,}', ' ', text).strip(), n


def reparagraph(text):
    """Put the paragraph breaks back.

       The scan flattens each printed page into a single <p>, so without this
       the book renders as one unbroken wall, which is hardest on exactly the
       reader who needs it most.

       Russian dialogue opens a paragraph with an em dash, but an em dash also
       introduces the attribution inside a line, and the two look identical:

           — Пиво есть? — сиплым голосом осведомился Бездомный.

       Splitting on every dash after a full stop breaks that line in half. What
       separates them is the next word: a new speaker starts with a capital, an
       attribution ("сказал", "спросил") does not."""
    parts = re.split(r'(?<=[.!?…»])\s+(?=[—–]\s+[«"А-ЯЁA-Z])', text)
    return [p.strip() for p in parts if p.strip()]


def strip_tags(s):
    s = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def page_paragraphs(raw):
    """The page's prose, as paragraphs, with the running head removed."""
    body = re.search(r'<body[^>]*>(.*?)</body>', raw, re.S | re.I)
    inner = body.group(1) if body else raw
    parts = re.split(r'</p\s*>|<br\s*/?>', inner, flags=re.I)
    out = []
    for part in parts:
        t = strip_tags(part)
        # "Page 10" is a scan artefact, not the author's.
        t = re.sub(r'^Page\s+\d+\s*', '', t)
        if t:
            out.append(t)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--title', required=True)
    ap.add_argument('--author', required=True)
    ap.add_argument('--lang', default='ru')
    ap.add_argument('--heading', default=RU_HEADING,
                    help='regex for a chapter opening at the start of a page')
    args = ap.parse_args()

    zin = zipfile.ZipFile(args.src)
    names = zin.namelist()

    pages = sorted(
        (n for n in names if re.search(r'page[_-]?(\d+)\.x?html?$', n, re.I)),
        key=lambda n: int(re.search(r'page[_-]?(\d+)', n, re.I).group(1)))
    if not pages:
        sys.exit('No page files found. This does not look like an Archive scan.')

    head_re = re.compile(r'^(%s)\b' % args.heading)
    any_head = re.compile(args.heading)

    def read(n):
        raw = zin.read(n).decode('utf-8', 'replace')
        return ' '.join(page_paragraphs(raw))

    toc = titles_from_contents(pages, read)
    print(f'  {len(toc)} chapter titles read from the book\'s own contents page')

    chapters = []      # [{title, paras}]
    for name in pages:
        if ARCHIVE_PAGE.search(name):
            continue
        raw = zin.read(name).decode('utf-8', 'replace')
        paras = page_paragraphs(raw)
        if not paras:
            continue
        first = paras[0]

        # A contents page lists many headings at once. A chapter opens with
        # exactly one and then keeps talking.
        starts = head_re.match(first) and len(any_head.findall(' '.join(paras))) < 3

        if starts:
            head = head_re.match(first).group(1)
            num = re.search(r'\d+', head)
            known = toc.get(int(num.group(0))) if num else None

            label = f'{head} {known}'.strip() if known else head
            # The heading runs into the prose on the same line, so it is cut
            # off the front rather than the whole page being thrown away. An
            # earlier pass dropped it and lost the first page of every chapter.
            body = first[len(head):].lstrip(' .—-:')
            if known and body.startswith(known):
                body = body[len(known):].lstrip(' .—-:')
            body = re.sub(r'^\[\d+\]?\s*', '', body)
            chapters.append({'title': label, 'paras': ([body] if body else []) + paras[1:]})
        elif chapters:
            chapters[-1]['paras'].extend(paras)
        else:
            # Front matter before the first heading is dropped: it is the
            # Archive's notice and the scanned title page, not the book.
            continue

    if not chapters:
        sys.exit('No chapter headings matched. Try a different --heading.')

    REMOVED = [0]
    uid = 'urn:uuid:' + str(uuid.uuid4())
    esc = lambda s: html.escape(s, quote=True)

    files = {}
    manifest, spine, nav = [], [], []
    for i, ch in enumerate(chapters):
        fn = f'ch{i:03d}.xhtml'
        flowed = []
        for para in ch['paras']:
            clean, k = denoise(para)
            REMOVED[0] += k
            flowed.extend(reparagraph(clean))
        body = '\n'.join(f'    <p>{html.escape(p)}</p>' for p in flowed)
        files[f'OEBPS/{fn}'] = f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{esc(args.lang)}">
  <head><title>{esc(ch['title'])}</title><meta charset="utf-8"/></head>
  <body epub:type="bodymatter">
    <h2>{esc(ch['title'])}</h2>
{body}
  </body>
</html>
"""
        manifest.append(f'    <item id="c{i}" href="{fn}" media-type="application/xhtml+xml"/>')
        spine.append(f'    <itemref idref="c{i}"/>')
        nav.append(f'        <li><a href="{fn}">{esc(ch["title"])}</a></li>')

    files['OEBPS/nav.xhtml'] = f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{esc(args.lang)}">
  <head><title>Содержание</title><meta charset="utf-8"/></head>
  <body>
    <nav epub:type="toc" id="toc"><h1>Содержание</h1>
      <ol>
{chr(10).join(nav)}
      </ol>
    </nav>
    <nav epub:type="landmarks" hidden="hidden">
      <ol><li><a epub:type="bodymatter" href="ch000.xhtml">Начало</a></li></ol>
    </nav>
  </body>
</html>
"""

    files['OEBPS/content.opf'] = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">{uid}</dc:identifier>
    <dc:title>{esc(args.title)}</dc:title>
    <dc:creator>{esc(args.author)}</dc:creator>
    <dc:language>{esc(args.lang)}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    <meta name="source-note" content="Rebuilt from an Internet Archive OCR scan."/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
{chr(10).join(manifest)}
  </manifest>
  <spine>
{chr(10).join(spine)}
  </spine>
</package>
"""

    files['META-INF/container.xml'] = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""

    with zipfile.ZipFile(args.dst, 'w', zipfile.ZIP_DEFLATED) as z:
        # The mimetype entry has to be first and uncompressed.
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip',
                   compress_type=zipfile.ZIP_STORED)
        for path, data in files.items():
            z.writestr(path, data)

    words = sum(len(' '.join(c['paras']).split()) for c in chapters)
    paras = sum(len(reparagraph(denoise(p)[0])) for c in chapters for p in c['paras'])
    print(f'  {len(pages)} scanned pages -> {len(chapters)} chapters')
    print(f'  {words:,} words in {paras:,} paragraphs')
    print(f'  {REMOVED[0]:,} OCR footnote markers removed')
    print(f'  {os.path.getsize(args.dst)/1e6:.2f} MB  {args.dst}')
    print('\n  chapters:')
    for c in chapters[:6]:
        print(f'    {c["title"][:60]}')
    if len(chapters) > 6:
        print(f'    ... and {len(chapters) - 6} more')


if __name__ == '__main__':
    main()
