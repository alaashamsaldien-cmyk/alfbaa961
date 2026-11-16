import assert from "node:assert/strict";
import {scryptSync} from "node:crypto";
import {PrismaClient} from "@prisma/client";
// Refuse any database other than the dedicated local fixture.
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55439");
const db=new PrismaClient();const base="http://127.0.0.1:3102";
async function call(path,status,cookie,body,method=body?"POST":"GET"){
 const r=await fetch(base+path,{method,headers:{"content-type":"application/json",...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,path+" "+JSON.stringify(data));return {data,cookie:r.headers.get("set-cookie")?.split(";")[0]};
}
try{
 const password="fixture-password";const passwordHash="scrypt:test:"+scryptSync(password,"test",64).toString("hex");
 await db.user.create({data:{email:"assignment@example.invalid",username:"assignadmin",name:"مدير الاختبار",passwordHash}});
 const people=await Promise.all([1,2,3].map(i=>db.coordinator.create({data:{username:"assign"+i,name:"منسق "+i,passwordHash}})));
 const admin=(await call("/api/auth/login",200,null,{username:"assignadmin",password})).cookie;
 const cookies=await Promise.all(people.map(async p=>(await call("/api/auth/login",200,null,{username:p.username,password})).cookie));
 const schools=await Promise.all([1,2,3].map(i=>db.school.create({data:{name:"مدرسة تنسيب "+i,governorate:"بغداد",dataSource:"CLIENT_KML",discoveryStatus:"MAP_APPROVED",lat:33.3,lng:44.4}})));
 const research=await db.school.create({data:{name:"بحث خاص",lat:33.3,lng:44.4}});
 const payload={schoolIds:schools.map(s=>s.id),coordinatorIds:people.slice(0,2).map(p=>p.id),mode:"shared",action:"add"};
 await call("/api/coordinators/assignments",401,null,payload);
 await call("/api/coordinators/assignments",403,cookies[0],payload);
 await call("/api/coordinators/assignments",409,admin,{...payload,schoolIds:[research.id]});
 const preview=(await call("/api/coordinators/assignments",200,admin,{...payload,preview:true})).data;
 assert.equal(preview.preview[0].after.length,2);assert.equal(await db.schoolAssignment.count(),0);
 await call("/api/coordinators/assignments",200,admin,payload);
 assert.equal(await db.schoolAssignment.count(),6);
 for(const cookie of cookies.slice(0,2)){
  assert.equal((await call("/api/employee/schools?q=مدرسة",200,cookie)).data.schools.length,3);
  await call("/api/employee/schools/"+schools[0].id,200,cookie);
  assert.equal((await call("/api/coordinator-portal/schools",200,cookie)).data.schools.length,3);
 }
 assert.equal((await call("/api/employee/schools?q=مدرسة",200,cookies[2])).data.schools.length,0);
 await call("/api/employee/schools/"+schools[0].id,404,cookies[2]);
 await call("/api/schools/field-workflow?schoolId="+schools[0].id,403,cookies[2]);
 assert.equal((await call("/api/coordinators",200,admin)).data.coordinators[0].schoolCount,3);
 // Repeating add does not duplicate joins; bad school mixed with valid ones rolls back all changes.
 await call("/api/coordinators/assignments",200,admin,payload);assert.equal(await db.schoolAssignment.count(),6);
 await call("/api/coordinators/assignments",409,admin,{...payload,schoolIds:[schools[0].id,"missing"],coordinatorIds:[people[2].id]});assert.equal(await db.schoolAssignment.count(),6);
 const visit={dedupeKey:crypto.randomUUID(),schoolId:schools[0].id,contactType:"FIELD_VISIT",result:"APPROVED",needs:["NONE"],lat:33.3,lng:44.4,locationSource:"SAVED",nextFollowUpAt:"2027-01-01"};
 await call("/api/employee/visits",201,cookies[1],visit);
 await call("/api/employee/visits",200,cookies[1],visit);
 assert.equal(await db.followUp.count(),1);
 const list=(await call("/api/employee/schools",200,cookies[0])).data.schools;
 assert.ok(list[0].lastVisitAt);assert.equal(list[0].lastVisitorName,people[1].name);
 assert.equal((await call("/api/employee/visits",200,cookies[0])).data.total,0);
 assert.equal((await call("/api/employee/visits",200,cookies[1])).data.total,1);
 const flow="/api/schools/field-workflow";
 await call(flow,200,cookies[0],{schoolId:schools[0].id,action:"plan",dueDate:new Date(Date.now()+86400000).toISOString()});
 let state=(await call(flow+"?schoolId="+schools[0].id,200,cookies[1])).data;
 assert.equal(state.lastVisit.name,people[1].name);assert.equal(state.plans.length,2);
 const plan=state.plans.find(p=>p.title==="ناوي أزورها");assert.equal(plan.mine,false);
 await call(flow,400,cookies[1],{schoolId:schools[0].id,action:"cancel",id:plan.id});
 await call(flow,200,cookies[0],{schoolId:schools[0].id,action:"cancel",id:plan.id});
 await call(flow,400,cookies[0],{schoolId:schools[0].id,action:"plan",dueDate:"invalid"});
 await call(flow,200,cookies[0],{schoolId:schools[0].id,action:"report",kind:"WRONG_LOCATION",notes:"تحقق من المدخل"});
 state=(await call(flow+"?schoolId="+schools[0].id,200,admin)).data;assert.equal(state.reports.length,1);
 await call(flow,400,cookies[0],{schoolId:schools[0].id,action:"resolve",id:state.reports[0].id,status:"REVIEWED"});
 await call(flow,200,admin,{schoolId:schools[0].id,action:"resolve",id:state.reports[0].id,status:"REVIEWED"});
 assert.equal((await db.school.findUnique({where:{id:schools[0].id}})).lat,33.3);
 // Separate distribution replaces shared assignments, with exact 2/1 allocation.
 const separate={...payload,mode:"separate",action:"replace"};
 const separatePreview=(await call("/api/coordinators/assignments",200,admin,{...separate,preview:true})).data.preview;
 assert.deepEqual(separatePreview.map(p=>p.after[0].id),[people[0].id,people[1].id,people[0].id]);
 await call("/api/coordinators/assignments",200,admin,separate);assert.equal(await db.schoolAssignment.count(),3);
 await call("/api/employee/schools/"+schools[0].id,404,cookies[1]);
 await call("/api/coordinators/assignments",200,admin,{...payload,schoolIds:[schools[0].id],coordinatorIds:[people[0].id],action:"remove"});
 await call("/api/employee/schools/"+schools[0].id,404,cookies[0]);
 assert.equal(await db.schoolVisit.count(),1);
 const history=(await call("/api/coordinators/assignments?schoolId="+schools[0].id,200,admin)).data.history;
 assert.equal(history.length,4);assert.equal(JSON.parse(history[0].details).after.length,0);
 // Restore shared fixture for browser review.
 await call("/api/coordinators/assignments",200,admin,payload);
 const dist=(await call("/api/distribution",200,admin)).data;
 assert.equal(dist.assignedTotal,3);assert.equal(dist.unassignedTotal,1);
 assert.equal(dist.coordinators.find(c=>c.id===people[0].id).schoolCount,3);
 assert.equal(dist.coordinators.find(c=>c.id===people[1].id).schoolCount,3);
 assert.equal(dist.coordinators.find(c=>c.id===people[0].id).visitedCount,0);
 assert.equal(dist.coordinators.find(c=>c.id===people[1].id).visitedCount,1);
 assert.equal(dist.regionCoverage.reduce((n,r)=>n+r.total,0),4);
 const stale=(await call("/api/coordinators/assignments",200,admin,{...payload,preview:true})).data.preview;
 await call("/api/coordinators/assignments",409,admin,{...payload,expected:[]});
 assert.equal(stale.length,3);
 console.log("PASS: shared/separate, preview, idempotency, permissions, search isolation, visit ownership, follow-ups, reports, history, retained visits");
}finally{await db.$disconnect();}
