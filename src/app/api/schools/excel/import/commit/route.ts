// تنفيذ الاستيراد — لا يحذف ولا يستبدل إلا بموافقة صريحة (allowUpdate)
import { NextRequest, NextResponse } from "next/server";
import { commitImport } from "@/lib/excel-schools";
import { getCurrentUser } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "أرفق ملف Excel." }, { status: 400 });
    }
    // الموافقة الصريحة المطلوبة قبل أي تحديث لسجلات موجودة
    const allowUpdate = formData.get("allowUpdate") === "true";
    const forceAddSimilar = formData.get("forceAddSimilar") === "true";

    const user = await getCurrentUser();
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await commitImport({
      fileName: file.name,
      buffer,
      allowUpdate,
      forceAddSimilar,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("خطأ في تنفيذ الاستيراد:", error);
    return NextResponse.json({ error: "تعذر تنفيذ الاستيراد." }, { status: 500 });
  }
}
