# -*- coding: utf-8 -*-
# معالجة لاحقة للتوافق مع Word/WPS:
# 1) تذييل الفهرس: PAGE → PAGE \* ROMAN \* MERGEFORMAT
# 2) تذييل المتن: PAGE → PAGE \* arabic \* MERGEFORMAT
# 3) إزالة <w:pgNumType/> الفارغة من قسم الغلاف
# التمييز بين التذييلات: يوجد footer لكل قسم؛ نقرأ document.xml لتحديد أي تذييل مرجعي بأي قسم
import re
import shutil
import sys
import zipfile

DOCX = sys.argv[1]
TMP = DOCX + ".tmpzip"

with zipfile.ZipFile(DOCX, "r") as z:
    names = z.namelist()
    files = {n: z.read(n) for n in names}

doc_xml = files["word/document.xml"].decode("utf-8")

# 1) إزالة pgNumType الفارغة (قسم الغلاف)
doc_xml, n_removed = re.subn(r"<w:pgNumType/>", "", doc_xml)

# 2) تحديد التذييل المرجعي لكل قسم حسب ترتيب الظهور في document.xml
#    الأقسام بالترتيب: غلاف (بلا تذييل)، فهرس (روماني)، متن (عربي)
#    docx-js يكتب مراجع footerReference داخل sectPr لكل قسم
sect_prs = re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc_xml, flags=re.S)
footer_fmt = {}  # rId → fmt
fmt_sequence = []
for i, sp in enumerate(sect_prs):
    refs = re.findall(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', sp)
    fmt = None
    if 'w:fmt="upperRoman"' in sp:
        fmt = "ROMAN"
    elif 'w:fmt="decimal"' in sp or "pageNumbers" in sp or refs:
        fmt = "arabic" if refs else None
    if refs and fmt:
        for rid in refs:
            footer_fmt[rid] = fmt
        fmt_sequence.append((i, refs, fmt))
print("الأقسام:", len(sect_prs), "| خرائط التذييل:", footer_fmt)

# 3) حلّ rId إلى أسماء ملفات التذييل من document.xml.rels
rels = files["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_file = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="(footer\d+\.xml)"', rels))
print("مراجع التذييل:", rid_to_file)

patched = 0
for rid, fmt in footer_fmt.items():
    fname = rid_to_file.get(rid)
    if not fname:
        continue
    key = "word/" + fname
    if key not in files:
        continue
    xml = files[key].decode("utf-8")
    new_xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + fmt + r" \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        files[key] = new_xml.encode("utf-8")
        patched += n
        print(f"  {fname}: عولج {n} حقل PAGE بصيغة {fmt}")

files["word/document.xml"] = doc_xml.encode("utf-8")
print(f"pgNumType الفارغة المحذوفة: {n_removed} | إجمالي حقول PAGE المعالجة: {patched}")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, files[n])
shutil.move(TMP, DOCX)
print("تمت المعالجة اللاحقة بنجاح:", DOCX)
