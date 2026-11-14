// معلومات النظام الفعلية لقسم الإعدادات — أعداد حقيقية وحالة المزودات
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { googlePlacesEnabled } from "@/lib/geo/providers";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const [schools, regions, coordinators, activities, users] = await Promise.all([
      db.school.count(),
      db.region.count({ where: { isActive: true } }),
      db.coordinator.count({ where: { isActive: true } }),
      db.activity.count(),
      db.user.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      googlePlacesEnabled: googlePlacesEnabled(),
      basemapTiles: "OSM",
      counts: { schools, regions, coordinators, activities, users },
      currentUser: {
        name: guard.principal.name,
        email: guard.principal.email,
        role: guard.principal.role,
      },
    });
  } catch (error) {
    console.error("خطأ في جلب معلومات النظام:", error);
    return NextResponse.json({ error: "تعذر جلب معلومات النظام." }, { status: 500 });
  }
}
