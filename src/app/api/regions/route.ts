// المناطق — قائمة حقيقية من قاعدة البيانات + إضافة
// كل منطقة تعرض أعداداً محسوبة فعلياً: مدارسها، متعاقداتها، منسقاتها النشطات، مدارس بلا تخصيص
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";
import { syncRegionAssignments } from "@/lib/region-sync";
import { syncGovernorateMapSchools } from "@/lib/map-sync";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const governorate = request.nextUrl.searchParams.get("governorate");

    const regionWhere = {
      isActive: true,
      ...(governorate && governorate !== "all" ? { governorate } : {}),
    };
    // مزامنة تلقائية للمحافظة: مدارس الخريطة تُضاف وتُوزّع على مناطقها (أقضيتها) قبل العرض
    if (governorate && governorate !== "all") {
      await syncGovernorateMapSchools(governorate).catch((error) => console.error("تعذرت مزامنة مدارس المحافظة", error));
    }
    // مزامنة تلقائية: أي مدرسة دخلت منطقة منسّبة تُنسّب لمنسقاتها قبل عرض الأعداد
    const regionIds = (await db.region.findMany({ where: regionWhere, select: { id: true } })).map((r) => r.id);
    await syncRegionAssignments(db, { regionIds }).catch((error) => console.error("تعذرت مزامنة تنسيب المناطق", error));

    const regions = await db.region.findMany({
      where: regionWhere,
      orderBy: [{ governorate: "asc" }, { name: "asc" }],
      include: {
        schools: {
          select: {
            contractStatus: true,
            coordinatorId: true,
            assignments: { select: { coordinatorId: true } },
            availabilityStatus: true,
          },
        },
        coordinatorLinks: { select: { coordinator: { select: { id: true, name: true, isActive: true } } } },
      },
    });

    return NextResponse.json({
      regions: regions.map((r) => ({
        id: r.id,
        name: r.name,
        governorate: r.governorate,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        schoolCount: r.schools.length,
        assignableCount: r.schools.length,
        contractedCount: r.schools.filter((s) => s.contractStatus === "CONTRACTED").length,
        unassignedCount: r.schools.filter((s) => !s.coordinatorId && !s.assignments.length).length,
        availableCount: r.schools.filter((s) => s.availabilityStatus === "AVAILABLE").length,
        coordinators: [
          ...new Set(r.schools.flatMap(s => [s.coordinatorId, ...s.assignments.map(a => a.coordinatorId)]).filter(Boolean)),
        ].length,
        regionCoordinators: r.coordinatorLinks
          .filter((l) => l.coordinator.isActive)
          .map((l) => ({ id: l.coordinator.id, name: l.coordinator.name })),
      })),
      governorates: IRAQ_GOVERNORATES.map((g) => g.name),
    });
  } catch (error) {
    console.error("خطأ في جلب المناطق:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة المناطق." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));

    // إضافة مناطق محافظة كاملة من القائمة المرجعية الرسمية (أسماء جغرافية حقيقية)
    if (body.action === "addGovernorateAreas") {
      const governorate = typeof body.governorate === "string" ? body.governorate : "";
      if (!governorate) {
        return NextResponse.json({ error: "حدد المحافظة." }, { status: 400 });
      }
      if (governorate !== "بغداد") {
        return NextResponse.json(
          { error: "قائمة المناطق المرجعية متاحة حالياً لبغداد — المحافظات الأخرى تُضاف يدوياً بعد اعتماد أسمائها الرسمية." },
          { status: 400 }
        );
      }
      const { BAGHDAD_AREAS } = await import("@/lib/geo/iraq");
      const existing = await db.region.findMany({ where: { governorate } });
      const existingNames = new Set(existing.map((r) => r.name));
      const toAdd = BAGHDAD_AREAS.map((a) => a.name).filter((n) => !existingNames.has(n));
      if (toAdd.length === 0) {
        return NextResponse.json({ added: 0, message: "كل مناطق بغداد المرجعية موجودة فعلاً في النظام." });
      }
      await db.region.createMany({ data: toAdd.map((name) => ({ name, governorate })) });
      return NextResponse.json({ added: toAdd.length }, { status: 201 });
    }

    // إضافة منطقة واحدة
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const governorate = typeof body.governorate === "string" && body.governorate.trim() ? body.governorate.trim() : "بغداد";
    if (!name) {
      return NextResponse.json({ error: "اسم المنطقة مطلوب." }, { status: 400 });
    }
    if (!IRAQ_GOVERNORATES.some((g) => g.name === governorate)) {
      return NextResponse.json({ error: "المحافظة غير معروفة — اختر من قائمة محافظات العراق." }, { status: 400 });
    }

    const exists = await db.region.findFirst({ where: { name, governorate } });
    if (exists) {
      return NextResponse.json(
        { error: "توجد منطقة بنفس الاسم في هذه المحافظة فعلاً." },
        { status: 409 }
      );
    }

    const created = await db.region.create({ data: { name, governorate } });
    return NextResponse.json({ region: created }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إضافة المنطقة:", error);
    return NextResponse.json({ error: "تعذر إضافة المنطقة." }, { status: 500 });
  }
}
