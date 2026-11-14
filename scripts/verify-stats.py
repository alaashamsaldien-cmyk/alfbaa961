#!/usr/bin/env python3
"""تحقق مستقل: حساب الإحصائيات المتوقعة مباشرة من SQLite ومقارنتها بمخرجات API"""
import sqlite3
import json
import urllib.request
from datetime import datetime, timezone, timedelta

DB = "/home/z/my-project/db/custom.db"
BASE = "http://localhost:3000"

conn = sqlite3.connect(DB)
cur = conn.cursor()

# توقيت بغداد UTC+3 ثابت كما في src/lib/time.ts
TZ_OFF = 3 * 3600 * 1000
now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
now_dt = datetime.now(timezone.utc)
baghdad_key = datetime.fromtimestamp(now_ms / 1000, tz=timezone(timedelta(hours=3))).strftime("%Y-%m-%d")
y, m, d = map(int, baghdad_key.split("-"))
day_start = datetime(y, m, d, tzinfo=timezone.utc).timestamp() * 1000 - TZ_OFF
day_end = day_start + 24 * 3600 * 1000 - 1
today_start = day_start
today_end = day_end
week_start = day_start - 6 * 24 * 3600 * 1000
month_start = day_start - 29 * 24 * 3600 * 1000

# ——— الإحصائيات المتوقعة من قاعدة البيانات مباشرة ———
total = cur.execute("SELECT COUNT(*) FROM School").fetchone()[0]
visited = cur.execute("SELECT COUNT(*) FROM School WHERE lastVisitAt IS NOT NULL").fetchone()[0]
contracted = cur.execute("SELECT COUNT(*) FROM School WHERE contractStatus='CONTRACTED'").fetchone()[0]
not_contracted = cur.execute("SELECT COUNT(*) FROM School WHERE contractStatus='NOT_CONTRACTED'").fetchone()[0]
available = cur.execute("SELECT COUNT(*) FROM School WHERE availabilityStatus='AVAILABLE'").fetchone()[0]
unavailable = cur.execute("SELECT COUNT(*) FROM School WHERE availabilityStatus='UNAVAILABLE'").fetchone()[0]
due_reviews = cur.execute(
    "SELECT COUNT(*) FROM FollowUp WHERE status='PENDING' AND type='REVIEW' AND dueDate<=?", (today_end,)
).fetchone()[0]
unassigned = cur.execute("SELECT COUNT(*) FROM School WHERE coordinatorId IS NULL").fetchone()[0]

expected_stats = {
    "total": total, "visited": visited, "notVisited": total - visited,
    "contracted": contracted, "notContracted": not_contracted,
    "available": available, "unavailable": unavailable, "dueReviews": due_reviews,
}

# نشاط اليوم
expected_today = {}
for t in ["VISIT", "CALL", "INITIAL_APPROVAL", "CONTRACT"]:
    n = cur.execute(
        "SELECT COUNT(*) FROM Activity WHERE type=? AND occurredAt>=? AND occurredAt<=?",
        (t, today_start, today_end),
    ).fetchone()[0]
    expected_today[t] = n

# توزيع المناطق
expected_regions = dict(
    cur.execute(
        "SELECT r.name, COUNT(s.id) FROM Region r LEFT JOIN School s ON s.regionId=r.id "
        "WHERE r.isActive=1 GROUP BY r.id ORDER BY r.name"
    ).fetchall()
)

# المتابعات
exp_today_reviews = cur.execute(
    "SELECT COUNT(*) FROM FollowUp WHERE status='PENDING' AND type='REVIEW' AND dueDate>=? AND dueDate<=?",
    (today_start, today_end),
).fetchone()[0]
exp_overdue_reviews = cur.execute(
    "SELECT COUNT(*) FROM FollowUp WHERE status='PENDING' AND type='REVIEW' AND dueDate<?", (today_start,)
).fetchone()[0]
exp_upcoming = cur.execute(
    "SELECT COUNT(*) FROM FollowUp WHERE status='PENDING' AND type='FOLLOW_UP' AND dueDate>?", (today_end,)
).fetchone()[0]

conn.close()

# ——— جلب مخرجات API لكل الفترات ———
def fetch(period):
    url = f"{BASE}/api/dashboard?period={period}"
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.load(r)

results = {}
for period in ["today", "week", "month", "all"]:
    results[period] = fetch(period)

ok = True
def check(label, expected, actual):
    global ok
    status = "PASS" if expected == actual else "FAIL"
    if status == "FAIL":
        ok = False
    print(f"  [{status}] {label}: متوقع={expected} فعلي={actual}")

print("=" * 72)
print("اختبار بطاقات الإحصائيات (يجب ألا تتغير مع تغيير الفترة الزمنية)")
print("=" * 72)
for period in ["today", "week", "month", "all"]:
    s = results[period]["stats"]
    print(f"\n--- الفترة: {period}")
    for k, v in expected_stats.items():
        check(k, v, s[k])

print("\n" + "=" * 72)
print("اختبار نشاط اليوم (ثابت في كل الفترات لأنه إحصاء يوم اليوم فقط)")
print("=" * 72)
key_map = {"VISIT": "visits", "CALL": "calls", "INITIAL_APPROVAL": "initialApprovals", "CONTRACT": "contracts"}
ta = results["all"]["todayActivity"]
for t, k in key_map.items():
    check(k, expected_today[t], ta[k])

print("\n" + "=" * 72)
print("اختبار الفلتر الزمني على آخر النشاطات")
print("=" * 72)
# المتوقع: اليوم = أنشطة اليوم فقط (4+0 الأصلية)؛ أسبوع = اليوم + قبل 3 أيام؛ شهر = نفس الأسبوع؛ الكل = + قبل 40 يوماً
def count_in_range(ms_from, ms_to):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    cond = ""
    params = []
    if ms_from is not None:
        cond += " AND occurredAt>=?"
        params.append(ms_from)
    if ms_to is not None:
        cond += " AND occurredAt<=?"
        params.append(ms_to)
    n = c.execute(f"SELECT COUNT(*) FROM Activity WHERE 1=1{cond}", params).fetchone()[0]
    conn.close()
    return n

exp_by_period = {
    "today": count_in_range(today_start, today_end),
    "week": count_in_range(week_start, today_end),
    "month": count_in_range(month_start, today_end),
    "all": count_in_range(None, None),
}
for period in ["today", "week", "month", "all"]:
    acts = results[period]["recentActivities"]
    check(f"عدد الأنشطة المعروضة (فترة {period})", exp_by_period[period], len(acts))

# التحقق من أن الزيارة القديمة (قبل 40 يوماً) لا تظهر إلا في "الكل"
old_act_in_today = any("قبل 40 يوماً" in (a.get("result") or "") for a in results["today"]["recentActivities"])
old_act_in_all = any("قبل 40 يوماً" in (a.get("result") or "") for a in results["all"]["recentActivities"])
check("الزيارة القديمة مخفية في فترة اليوم", False, old_act_in_today)
check("الزيارة القديمة ظاهرة في كل الفترات", True, old_act_in_all)

print("\n" + "=" * 72)
print("اختبار المتابعات والتوزيع الجغرافي")
print("=" * 72)
fu = results["all"]["followUps"]
check("مراجعات اليوم", exp_today_reviews, len(fu["todayReviews"]))
check("مراجعات متأخرة", exp_overdue_reviews, len(fu["overdueReviews"]))
check("متابعات قادمة", exp_upcoming, len(fu["upcomingFollowUps"]))
check("مدارس بدون منسقة", unassigned, results["all"]["unassignedSchools"])

rd = {item["regionName"]: item["schoolCount"] for item in results["all"]["regionDistribution"]}
print(f"  توزيع API: {rd}")
print(f"  توزيع SQL: {expected_regions}")
if rd == expected_regions:
    print("  [PASS] توزيع المدارس حسب المناطق مطابق لقاعدة البيانات")
else:
    ok = False
    print("  [FAIL] توزيع المناطق غير مطابق")

# فحص حقول جدول آخر النشاطات (اكتمال الأعمدة الستة)
print("\n" + "=" * 72)
print("فحص اكتمال حقول جدول آخر النشاطات")
print("=" * 72)
sample = results["all"]["recentActivities"][0] if results["all"]["recentActivities"] else None
required = ["occurredAt", "schoolName", "regionName", "coordinatorName", "type", "result"]
if sample:
    for k in required:
        check(f"الحقل {k} موجود", True, k in sample)
else:
    print("  لا توجد أنشطة للفحص")

print("\n" + "=" * 72)
print("النتيجة النهائية:", "ALL PASS" if ok else "SOME CHECKS FAILED")
print("=" * 72)
