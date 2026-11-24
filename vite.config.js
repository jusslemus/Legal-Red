import { createUserAdminHandler } from './server/user-admin.js';
// Proxy exclusivo para pruebas locales. No proporciona autenticación de usuarios.
import fs from 'node:fs';

function config() {
  const values = {};
  if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
    const match=line.match(/^\s*(SAN_API_KEY|SAN_AREA_LEGAL|VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY)\s*=\s*(.*?)\s*$/);
    if(match) values[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
  return {...values,...Object.fromEntries(['SAN_API_KEY','SAN_AREA_LEGAL','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))};
}

export default {
  server: { host:'127.0.0.1' },
  plugins: [{ name:'legal-san-local-proxy', configureServer(server) {
    server.middlewares.use('/api/users',createUserAdminHandler(config));
    server.middlewares.use('/api/tickets',async(req,res)=>{
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      const end=(status,msg)=>{res.statusCode=status;res.end(JSON.stringify({ok:false,message:msg}));};
      if(req.method!=='GET')return end(405,'Método no permitido');
      const settings=config(), area=settings.SAN_AREA_LEGAL, key=settings.SAN_API_KEY;
      if(!area||!/^[A-Za-z0-9_-]+$/.test(area)||!key)return end(503,'Configure SAN_AREA_LEGAL y SAN_API_KEY en .env.local.');
      // Verificar la identidad y el perfil en Supabase en cada consulta a SAN.
      const auth=req.headers.authorization||'';
      if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))return end(401,'Inicia sesión para consultar SAN.');
      const base=settings.VITE_SUPABASE_URL, publicKey=settings.VITE_SUPABASE_PUBLISHABLE_KEY;
      if(!base||!publicKey)return end(503,'Falta configurar Supabase en .env.local.');
      try {
        const origin=new URL(base);
        if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')||origin.pathname!=='/'||origin.search||origin.hash)return end(503,'La URL de Supabase no es válida.');
        const headers={apikey:publicKey,Authorization:auth};
        const userResponse=await fetch(new URL('/auth/v1/user',origin),{headers,signal:AbortSignal.timeout(10000)});
        if(userResponse.status===401||userResponse.status===403)return end(401,'Sesión inválida o vencida.');
        if(!userResponse.ok)return end(503,'No se pudo validar la sesión.');
        const user=await userResponse.json();
        if(!/^[0-9a-f-]{36}$/i.test(user.id||''))return end(401,'Sesión inválida.');
        const profileUrl=new URL('/rest/v1/perfiles_legal',origin);
        profileUrl.searchParams.set('select','rol,activo');profileUrl.searchParams.set('usuario_id','eq.'+user.id);
        const profileResponse=await fetch(profileUrl,{headers,signal:AbortSignal.timeout(10000)});
        if(!profileResponse.ok)return end(503,'No se pudo verificar el perfil.');
        const profiles=await profileResponse.json();
        if(!Array.isArray(profiles)||profiles.length!==1||profiles[0].activo!==true||!['admin','visor'].includes(profiles[0].rol))return end(403,'Usuario sin acceso autorizado.');
      }catch{return end(503,'No se pudo conectar con Supabase para verificar el acceso.');}
      const params=new URL(req.url,'http://localhost').searchParams;
      const start=params.get('fecha_desde'),finish=params.get('fecha_hasta');
      const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!Number.isNaN(Date.parse(`${d}T00:00:00Z`));
      if(!valid(start)||!valid(finish)||start>finish||Date.parse(finish)-Date.parse(start)>92*86400000)return end(400,'Seleccione un rango válido de hasta 92 días.');
      const url=new URL('https://san.red.com.sv/API/getTicketsFiltrados');
      url.searchParams.set('arecod',area);url.searchParams.set('fecha_desde',start);url.searchParams.set('fecha_hasta',finish);
      try {
        const response=await fetch(url,{headers:{'x-api-key':key,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
        if(!response.ok)return end(502,`SAN devolvió HTTP ${response.status}. Verifique acceso y parámetros.`);
        const payload=await response.json();
        if(!payload.ok||!Array.isArray(payload.data))return end(502,'SAN devolvió una respuesta inesperada.');
        if(payload.data.some(row=>String(row.codigo_area??'')!==area))return end(502,'La respuesta contiene tickets de un área distinta o sin código de área.');
        res.end(JSON.stringify({ok:true,data:payload.data}));
      } catch {return end(502,'No fue posible consultar SAN. Compruebe la conexión y la configuración.');}
    });
  }}]
};
