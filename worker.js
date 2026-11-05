// Cloudflare Worker: يستقبل المهام من التطبيق وينبهك بتلكرام
// المتغيرات: BOT_TOKEN, SECRET (Secrets) + KV Binding باسم TASKS
const CATS={rep:'مندوبين',order:'أوردر',sale:'فواتير مبيعات',ret:'مرتجعات',offer:'عروض',inv:'جرد'};
const H={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-key','access-control-allow-methods':'POST,OPTIONS'};
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:H});
const api=(env,m,b)=>fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${m}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});

async function chatId(env){
  let c=await env.TASKS.get('chat');if(c)return c;
  const r=await(await api(env,'getUpdates')).json();
  const m=(r.result||[]).reverse().find(u=>u.message);
  if(!m)return null;
  c=String(m.message.chat.id);await env.TASKS.put('chat',c);return c;
}
const send=(env,c,text)=>api(env,'sendMessage',{chat_id:c,text});
const load=async env=>JSON.parse(await env.TASKS.get('data')||'{"tasks":[],"interval":60}');

export default {
  async fetch(req,env){
    if(req.method==='OPTIONS')return J({});
    if(req.method!=='POST')return J({ok:true,msg:'tasks worker'});
    if(req.headers.get('x-key')!==env.SECRET)return J({ok:false,error:'auth'},401);
    const b=await req.json(),old=await load(env),prev={};
    old.tasks.forEach(t=>prev[t.id]=t);
    const tasks=(b.tasks||[]).filter(t=>!t.done&&t.due).map(t=>({...t,n:prev[t.id]&&prev[t.id].due===t.due?prev[t.id].n:0}));
    await env.TASKS.put('data',JSON.stringify({tasks,interval:b.interval||60}));
    const c=await chatId(env);
    if(!c)return J({ok:false,error:'no_chat'},400);
    await send(env,c,`✅ تمت المزامنة: ${tasks.length} مهمة بتنبيه`);
    return J({ok:true,count:tasks.length});
  },
  async scheduled(ev,env){
    const d=await load(env),c=await chatId(env);
    if(!c)return;
    const now=Date.now();let ch=false;
    for(const t of d.tasks){
      if(t.due<=now&&now-t.n>=d.interval*60000){
        const when=new Date(t.due).toLocaleString('ar-EG',{timeZone:'Asia/Baghdad',weekday:'short',hour:'numeric',minute:'2-digit'});
        await send(env,c,`⏰ تنبيه مهمة\n\n${t.text}\n📂 ${CATS[t.cat]||''}${t.rep?`\n👤 ${t.rep}`:''}${t.co?`\n🏢 ${t.co}`:''}\n🕒 ${when}`);
        t.n=now;ch=true;
      }
    }
    if(ch)await env.TASKS.put('data',JSON.stringify(d));
  }
};
