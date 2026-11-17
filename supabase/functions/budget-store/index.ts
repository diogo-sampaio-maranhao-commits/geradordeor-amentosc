const TOKEN_HASH = '0d81e59e4590d466013a82dedfecf1a994c6721dc3454a5e69907adc2cdc5d92';
const digest = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
Deno.serve(async req => {
 const json = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method !== 'POST' || await digest((req.headers.get('authorization') || '').replace(/^Bearer /,'')) !== TOKEN_HASH) return json(401,{error:'Não autorizado.'});
 const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const base = Deno.env.get('SUPABASE_URL')! + '/rest/v1/';
 async function db(path: string, method='GET', body?: unknown, prefer='return=representation') {
  const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:prefer},body:body === undefined ? undefined : JSON.stringify(body)});
  if(!r.ok) { console.error('Database operation failed',r.status,await r.text()); throw new Error('database'); }
  return r.status === 204 ? null : await r.json();
 }
 try {
  const b=await req.json();
  if(b.action === 'list') {
   const rows=[];for(let offset=0;;offset+=1000){const page=await db(`orcamentos?select=*&order=created_at.desc,id.desc&limit=1000&offset=${offset}`);rows.push(...page);if(page.length<1000)break;}
   return json(200,{rows});
  }
  const validId = (id: unknown) => Number.isSafeInteger(id) && Number(id)>0;
  if(b.action === 'status' || b.action === 'delete') {
   if(!validId(b.id) || (b.action==='status' && !['aberto','ganho','perdido'].includes(b.status)))return json(400,{error:'Dados inválidos.'});
   const rows=await db('orcamentos?id=eq.'+b.id,b.action==='delete'?'DELETE':'PATCH',b.action==='delete'?undefined:{status:b.status});
   return json(rows.length?200:404,{rows,error:rows.length?undefined:'Orçamento não encontrado.'});
  }
  if(b.action !== 'attempt') {
   const rows=b.action==='import'?b.rows:[b.entry];
   if(!['save','import'].includes(b.action) || !Array.isArray(rows) || rows.length>100 || rows.some((h: any)=>!h || !validId(h.id) || typeof h.cliente!=='string' || !h.cliente.trim() || !Number.isFinite(h.total) || !['aberto','ganho','perdido'].includes(h.status||'aberto') || !h.data || !Array.isArray(h.data.items) || h.data.items.some((i: any)=> !i || !Number.isFinite(i.qty)||!Number.isFinite(i.unit)||!Number.isFinite(i.total)||typeof i.desc!=='string')))return json(400,{error:'Dados do orçamento inválidos.'});
   b.rows=rows.map((h: any)=>({id:h.id,cliente:h.cliente,emitido:h.emitido||null,total:h.total,status:h.status||'aberto',data:h.data}));
  }
  if(b.action === 'attempt') {
   const n=await db('rpc/cdl_login_attempt','POST',{ip_hash:await digest(String(b.ip))});
   return json(n ? 200 : 429,{ok:!!n});
  }
  if(!['save','import'].includes(b.action)) return json(400,{error:'Operação inválida.'});
  const input=b.action==='import'?b.rows:[b.entry];
  if(!Array.isArray(input)||!input.length||input.length>100) return json(400,{error:'Lote inválido.'});
  const rows=input.map((e: any)=>{
   if(!e || !Number.isSafeInteger(e.id)||e.id<=0||typeof e.cliente!=='string'||!e.cliente.trim()||e.cliente.length>500||!Number.isFinite(e.total)||!e.data||!Array.isArray(e.data.items)||!['aberto','ganho','perdido'].includes(e.status||'aberto'))throw new Error('validation');
   return {id:e.id,cliente:e.cliente,emitido:e.emitido||null,total:e.total,status:e.status||'aberto',data:e.data};
  });
  if(b.action==='save' && b.editing) {
   const {id,status,...fields}=rows[0]; // Preserve status changed by another device.
   const updated=await db(`orcamentos?id=eq.${id}`,'PATCH',fields);
   return updated.length?json(200,{rows:updated}):json(404,{error:'Orçamento não encontrado.'});
  }
  const saved=await db('orcamentos?on_conflict=id','POST',b.rows,b.action==='import'?'resolution=ignore-duplicates,return=representation':'return=representation');
  return json(200,{rows:saved});
 } catch(e) {return json(e.message==='validation'?400:503,{error:e.message==='validation'?'Dados do orçamento inválidos.':'Não foi possível salvar ou carregar na nuvem. Tente novamente.'});}
});
