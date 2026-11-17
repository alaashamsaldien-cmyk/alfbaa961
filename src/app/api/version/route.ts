// رقم النسخة الحالية على الخادم — تستخدمه الواجهة لتعرف أن تحديثاً جديداً نُشر
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
