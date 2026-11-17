const { createHmac, timingSafeEqual, createHash } = require('node:crypto');
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const sign = value => createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status, body) => res.status(status).json(body);
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET || !process.env.STORE_TOKEN) return reply(503, {error:'Serviço em configuração.'});
  if (!['GET','POST','PATCH','DELETE'].includes(req.method)) return reply(405,{error:'Método inválido.'});
  if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))) return reply(403,{error:'Origem inválida.'});
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return reply(400,{error:'Dados inválidos.'}); } }
  if (JSON.stringify(body).length > 2000000) return reply(413,{error:'Importe em lotes menores.'});
  if (req.method === 'POST' && body.action === 'login') {
    // Persistent rate limiting is enforced by the storage function.
    let check; try { check = await fetch(process.env.STORE_URL, {method:'POST',headers:{'Authorization':`Bearer ${process.env.STORE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({action:'attempt',ip:String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0]})});
    } catch { return reply(503,{error:'Não foi possível conectar. Tente novamente.'}); }
    if (!check.ok) return reply(check.status,{error:check.status === 429 ? 'Muitas tentativas. Aguarde 15 minutos.' : 'Não foi possível conectar. Tente novamente.'});
    if (typeof body.password !== 'string' || !equal(body.password, process.env.APP_PASSWORD)) return reply(401,{error:'Senha incorreta.'});
    const expires = String(Date.now() + 30*86400000);
    res.setHeader('Set-Cookie', `cdl_session=${expires}.${sign(expires)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
    return reply(200,{ok:true});
  }
  const cookie = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('cdl_session='));
  const [expires, signature] = (cookie || '').slice(12).split('.');
  if (!expires || !signature || Number(expires) <= Date.now() || !equal(signature,sign(expires))) return reply(401,{error:'Entre com a senha da equipe.'});
  if (body.action === 'logout') {
    res.setHeader('Set-Cookie','cdl_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return reply(200,{ok:true});
  }
  if (body.action === 'session') return reply(200,{ok:true});
  try {
    const action = req.method === 'GET' ? 'list' : req.method === 'DELETE' ? 'delete' : req.method === 'PATCH' ? 'status' : body.action === 'import' ? 'import' : 'save';
    const upstream = await fetch(process.env.STORE_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.STORE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({...body,action}),signal:AbortSignal.timeout(20000)});
    const result = await upstream.json();
    return reply(upstream.status,result);
  } catch { return reply(503,{error:'Não foi possível acessar o banco. Seus dados no formulário foram mantidos. Tente novamente.'}); }
};
