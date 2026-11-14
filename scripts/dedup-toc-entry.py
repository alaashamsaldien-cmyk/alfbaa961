#!/usr/bin/env python3
"""إزالة الإدخال الافتراضي المكرر الذي يولّده docx-js داخل فقرة افتتاح حقل TOC.
الفقرة الافتتاحية يجب أن تبقى فيها أعلام الحقل فقط (begin + instrText + separate)
دون أي محتوى إدخال، لأن سكربت الفهرس يدرج الإدخالات الكاملة بعدها.
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

xml = files["word/document.xml"].decode("utf-8")

# فقرة افتتاح حقل TOC: تحتوي instrText يبدأ بـ TOC
m = re.search(r"<w:p\b(?:(?!</w:p>).)*?instrText[^>]*>\s*TOC\s[^<]*</w:instrText>.*?</w:p>", xml, re.S)
if not m:
    print("لم يُعثر على فقرة افتتاح حقل TOC")
    sys.exit(1)

para = m.group(0)
new_para, n_link = re.subn(r"<w:hyperlink\b.*?</w:hyperlink>", "", para, flags=re.S)
if n_link == 0:
    print("لا يوجد رابط مكرر داخل فقرة الافتتاح — لا حاجة لإصلاح")
    sys.exit(0)

# تأكد من بقاء أعلام الحقل
assert 'fldCharType="begin"' in new_para and "instrText" in new_para and 'fldCharType="separate"' in new_para
xml = xml[: m.start()] + new_para + xml[m.end():]

files["word/document.xml"] = xml.encode("utf-8")
with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, files[n])
shutil.move(TMP, DOCX)
print(f"أُزيل الإدخال المكرر ({n_link} رابطاً) من فقرة افتتاح حقل TOC")
