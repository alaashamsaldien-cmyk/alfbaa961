import { NextRequest, NextResponse } from "next/server";
import { getDashboardData, parseActivityPeriod } from "@/lib/dashboard";
import { requireAdmin } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/session";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    await ensureBootstrap();
    const period = parseActivityPeriod(request.nextUrl.searchParams.get("period"));
    const data = await getDashboardData(period);
    return NextResponse.json(data);
  } catch (error) {
    console.error("خطأ في جلب بيانات لوحة التحكم:", error);
    return NextResponse.json(
      { error: "تعذر جلب بيانات لوحة التحكم. حاول مرة أخرى." },
      { status: 500 }
    );
  }
}
