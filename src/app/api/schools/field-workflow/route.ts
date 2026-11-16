import { NextRequest, NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFieldPermissions, getFieldSchoolScope } from "@/lib/field-account";
import { checkPermission } from "@/lib/permissions";

async function access(schoolId: string) {
  const p = await getPrincipal();
  if (!p) return null;
  if (p.type === "ADMIN" && p.role === "ADMIN") return {id:p.userId,name:p.name,admin:true,coordinator:false,canWrite:true};
  const account = {userId:p.type === "COORDINATOR"?p.coordinatorId:p.userId,isCoordinator:p.type === "COORDINATOR"};
  const perms = await getFieldPermissions(account);
  if (!checkPermission(perms,"schools","view").ok && !checkPermission(perms,"visit_register","create").ok) return null;
  const scope = await getFieldSchoolScope(account);
  if (!await db.school.findFirst({where:{id:schoolId,AND:[scope]},select:{id:true}})) return null;
  return {id:account.userId,name:p.name,admin:false,coordinator:account.isCoordinator,canWrite:checkPermission(perms,"visit_register","create").ok};
}
export async function GET(request: NextRequest) {
  const schoolId=request.nextUrl.searchParams.get("schoolId")??"";
  const actor=await access(schoolId);
  if(!actor)return NextResponse.json({error:"غير مصرح."},{status:403});
  const [lastVisit, plans, reports] = await Promise.all([
    db.schoolVisit.findFirst({where:{schoolId,contactType:"FIELD_VISIT"},orderBy:{createdAt:"desc"},select:{createdAt:true,result:true,coordinator:{select:{name:true}},employee:{select:{name:true}}}}),
    db.followUp.findMany({where:{schoolId,status:"PENDING"},orderBy:{dueDate:"asc"},take:50,select:{id:true,title:true,type:true,dueDate:true,coordinatorId:true,userId:true,coordinator:{select:{name:true}},user:{select:{name:true}}}}),
    actor.admin?db.activity.findMany({where:{schoolId,type:"SCHOOL_REPORT"},orderBy:{createdAt:"desc"},take:50,select:{id:true,result:true,notes:true,createdAt:true,coordinator:{select:{name:true}},user:{select:{name:true}}}}):[],
  ]);
  return NextResponse.json({canWrite:actor.canWrite,admin:actor.admin,lastVisit:lastVisit?{at:lastVisit.createdAt,result:lastVisit.result,name:lastVisit.coordinator?.name??lastVisit.employee?.name??""}:null,
    plans:plans.map(p=>({id:p.id,title:p.title,type:p.type,dueDate:p.dueDate,name:p.coordinator?.name??p.user?.name??"",mine:actor.coordinator?p.coordinatorId===actor.id:p.userId===actor.id})),reports});
}
export async function POST(request: NextRequest) {
  try {
    const body=await request.json();
    if(typeof body.schoolId!=="string")return NextResponse.json({error:"حدد المدرسة."},{status:400});
    const actor=await access(body.schoolId);
    if(!actor || !actor.canWrite)return NextResponse.json({error:"غير مصرح."},{status:403});
    const owner=actor.coordinator?{coordinatorId:actor.id}:{userId:actor.id};
    await db.$transaction(async tx=>{
      if(body.action==="plan" || body.action==="followup") {
        const date=new Date(body.dueDate);
        if(!Number.isFinite(date.getTime())||date<=new Date())throw new Error("اختر موعداً قادماً.");
        await tx.followUp.create({data:{schoolId:body.schoolId,...owner,type:body.action==="plan"?"VISIT_PLAN":"FOLLOW_UP",title:body.action==="plan"?"ناوي أزورها":"متابعة المدرسة",dueDate:date}});
      } else if(body.action==="cancel" || body.action==="done") {
        const result=await tx.followUp.updateMany({where:{id:body.id,schoolId:body.schoolId,status:"PENDING",...(actor.admin?{}:owner)},data:{status:body.action==="done"?"DONE":"CANCELLED",completedAt:body.action==="done"?new Date():null}});
        if(!result.count)throw new Error("الموعد غير متاح للتعديل.");
      } else if(body.action==="report") {
        if(!["WRONG_LOCATION","CLOSED"].includes(body.kind)||typeof body.notes!=="string"||!body.notes.trim()||body.notes.length>2000)throw new Error("حدد نوع البلاغ واكتب التفاصيل.");
        await tx.activity.create({data:{schoolId:body.schoolId,...owner,type:"SCHOOL_REPORT",result:"PENDING",notes:JSON.stringify({kind:body.kind,text:body.notes.trim()})}});
        await tx.notification.create({data:{title:"بلاغ مدرسة للمراجعة",message:`${actor.name}: ${body.kind==="CLOSED"?"مدرسة مغلقة":"موقع غير صحيح"} — راجع تفاصيل المدرسة.`,type:"WARNING"}});
      } else if(body.action==="resolve" && actor.admin) {
        if(!["REVIEWED","REJECTED"].includes(body.status))throw new Error("اختر نتيجة المراجعة.");
        const result=await tx.activity.updateMany({where:{id:body.id,schoolId:body.schoolId,type:"SCHOOL_REPORT",result:"PENDING"},data:{result:body.status}});
        if(!result.count)throw new Error("البلاغ غير متاح للمراجعة.");
      } else throw new Error("عملية غير صحيحة.");
      await tx.auditLog.create({data:{actorType:actor.admin?"ADMIN":actor.coordinator?"COORDINATOR":"EMPLOYEE",actorId:actor.id,actorName:actor.name,action:"SCHOOL_WORKFLOW",entityType:"SCHOOL",entityId:body.schoolId,details:JSON.stringify({action:body.action,id:body.id,status:body.status,dueDate:body.dueDate})}});
    });
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"تعذر الحفظ."},{status:400});}
}
