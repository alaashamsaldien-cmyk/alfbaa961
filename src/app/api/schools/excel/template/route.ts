// نموذج Excel الرسمي القابل للتنزيل
import { NextResponse } from "next/server";
import { buildTemplateWorkbook } from "@/lib/excel-schools";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  const buffer = buildTemplateWorkbook();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("نموذج_المدارس_منصة_ألف_باء.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
