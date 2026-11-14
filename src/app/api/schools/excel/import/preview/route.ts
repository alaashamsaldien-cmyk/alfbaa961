// معاينة ملف الاستيراد — تتحقق وتكتشف التكرار دون كتابة أي شيء في القاعدة
import { NextRequest, NextResponse } from "next/server";
import { previewImport } from "@/lib/excel-schools";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "أرفق ملف Excel (.xlsx أو .csv)." }, { status: 400 });
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      return NextResponse.json({ error: "الملف يجب أن يكون بصيغة xlsx أو csv." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم الملف يتجاوز 5 ميغابايت." }, { status: 400 });
    }
    const preview = await previewImport(file.name, buffer);
    return NextResponse.json(preview);
  } catch (error) {
    console.error("خطأ في معاينة الاستيراد:", error);
    return NextResponse.json({ error: "تعذر قراءة الملف. تأكد أنه ملف Excel صحيح." }, { status: 500 });
  }
}
