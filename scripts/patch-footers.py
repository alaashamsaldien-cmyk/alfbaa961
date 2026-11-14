#!/usr/bin/env python3
"""معالجة بعدية لترقيم الصفحات وفق toc.md:
1) حذف <w:pgNumType/> الفارغ من قسم الغلاف
2) ترقيع instrText في التذييلات: القسم الروماني → PAGE \\* ROMAN، المتن → PAGE \\* arabic
يُميز كل تذييل عبر ربط footerReference لكل sectPr بترتيب الأقسام في document.xml
"""
import re
import shutil
import sys
import zipfile

DOCX = "/home/z/my-project/download/تقرير_الاختبار_الشامل_لوحة_التحكم_الرئيسية.docx"
TMP = DOCX + ".tmp"

with zipfile.ZipFile(DOCX, "r") as z:
    names = z.namelist()
    files = {n: z.read(n) for n in names}

doc = files["word/document.xml"].decode("utf-8")

# 1) حذف pgNumType الفارغ
doc, n_removed = re.subn(r"<w:pgNumType/>", "", doc)

# 2) استخراج footerReference لكل قسم بالترتيب
sect_blocks = re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc, flags=re.S)
sect_footer_ids = []
for blk in sect_blocks:
    m = re.search(r'<w:footerReference w:type="default" r:id="(rId\d+)"', blk)
    sect_footer_ids.append(m.group(1) if m else None)
print("الأقسام:", len(sect_blocks), "| footerRefs:", sect_footer_ids, "| pgNumType فارغ محذوف:", n_removed)

rels = files["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels))

# ترتيب الأقسام: الغلاف (بلا تذييل)، الفهرس (روماني)، المتن (عربي)
fmt_by_target = {}
seen = []
for i, rid in enumerate(sect_footer_ids):
    if rid is None:
        continue
    target = rid_to_target.get(rid, "").lstrip("/")
    fmt = None
    pg = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect_blocks[i])
    if pg and "oman" in pg.group(1):
        fmt = "ROMAN"
    elif pg:
        fmt = "arabic"
    else:
        fmt = "arabic"
    fmt_by_target.setdefault(target, fmt)
    seen.append((i, target, fmt))
print("خريطة التذييلات:", seen)

patched = 0
for target, fmt in fmt_by_target.items():
    path = "word/" + target if not target.startswith("word/") else target
    if path not in files:
        print("تخطي غير موجود:", path)
        continue
    xml = files[path].decode("utf-8")
    new_xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        files[path] = new_xml.encode("utf-8")
        patched += n
        print(f"رُقِّع {path}: {n} حقل → {fmt}")

files["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, files[n])
shutil.move(TMP, DOCX)
print(f"اكتملت المعالجة: {patched} حقلاً مُرقَّعاً")
