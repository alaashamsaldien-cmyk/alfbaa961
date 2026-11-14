"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/time";

export function GoogleSchoolCount({ governorate }: { governorate: string }) {
  const [scope, setScope] = useState("governorate");
  const [result, setResult] = useState<{ area: string; count: number }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadCount() {
    setLoading(true);
    setError("");
    setResult(undefined);
    try {
      const params = new URLSearchParams({ governorate, area: scope });
      const response = await fetch(`/api/schools/google/count?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر جلب الإجمالي.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-2 border-b pb-3">
      <div className="flex flex-wrap items-center gap-2">
        {governorate === "نينوى" && (
          <select className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="نطاق الإحصاء"
            value={scope} disabled={loading} onChange={(event) => {
              setScope(event.target.value);
              setResult(undefined);
              setError("");
            }}>
            <option value="governorate">محافظة نينوى</option>
            <option value="mosul">مدينة الموصل</option>
          </select>
        )}
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={loadCount}>
          {loading ? "جارٍ حساب المدارس…" : "إجمالي المدارس على Google Maps"}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm">
        {result && <p><strong>{formatNumber(result.count)}</strong> مدرسة مدرجة على Google Maps في {result.area}</p>}
        {error && <p className="text-destructive">{error}</p>}
      </div>
    </section>
  );
}
