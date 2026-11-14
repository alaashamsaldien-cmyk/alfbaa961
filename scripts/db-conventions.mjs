import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const samples = await p.school.findMany({ take: 5, select: { name: true, institutionType: true, stage: true, sector: true, governorate: true, address: true, regionText: true, dataSource: true, discoveryStatus: true } });
  console.log(JSON.stringify(samples, null, 1));
  const types = await p.school.groupBy({ by: ["institutionType"], _count: true });
  console.log("institutionType values:", JSON.stringify(types));
  const stages = await p.school.groupBy({ by: ["stage"], _count: true });
  console.log("stage values:", JSON.stringify(stages));
}
main().finally(() => p.$disconnect());
