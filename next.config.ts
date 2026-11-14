import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // دليل البناء قابل للتوجيه عبر متغير البيئة — يُستخدم لتشغيل خادم فحص معزول
  // على منفذ منفصل (3100) بقاعدة بيانات معزولة دون المساس بالخادم الفعلي على 3000.
  // بدون المتغير يبقى الدليل الافتراضي .next كما هو تماماً.
  distDir: process.env.NEXT_REVIEW_DIST_DIR || ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
