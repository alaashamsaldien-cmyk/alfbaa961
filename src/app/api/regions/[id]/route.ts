// تعديل/حذف منطقة — الحذف مسموح فقط للمنطقة الخالية من المدارس (حماية البيانات)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.governorate === "string" && body.governorate.trim()) data.governorate = body.governorate.trim();
    if ("isActive" in body) data.isActive = Boolean(body.isActive);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    if (data.name || data.governorate) {
      // تفادي تكرار الاسم ضمن نفس المحافظة
      const current = await db.region.findUnique({ where: { id } });
      if (!current) return NextResponse.json({ error: "المنطقة غير موجودة." }, { status: 404 });
      const name = (data.name as string) ?? current.name;
      const gov = (data.governorate as string) ?? current.governorate;
      const dup = await db.region.findFirst({ where: { name, governorate: gov, id: { not: id } } });
      if (dup) {
        return NextResponse.json({ error: "توجد منطقة بنفس الاسم في هذه المحافظة." }, { status: 409 });
      }
    }

    const updated = await db.region.update({ where: { id }, data: data as never });
    return NextResponse.json({ region: updated });
  } catch (error) {
    console.error("خطأ في تعديل المنطقة:", error);
    return NextResponse.json({ error: "تعذر تعديل المنطقة." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const region = await db.region.findUnique({
      where: { id },
      include: { _count: { select: { schools: true } } },
    });
    if (!region) return NextResponse.json({ error: "المنطقة غير موجودة." }, { status: 404 });
    if (region._count.schools > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف المنطقة — ترتبط بـ ${region._count.schools} مدرسة. يمكنك تعطيلها بدلاً من حذفها.`,
        },
        { status: 409 }
      );
    }
    await db.region.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف المنطقة:", error);
    return NextResponse.json({ error: "تعذر حذف المنطقة." }, { status: 500 });
  }
}
