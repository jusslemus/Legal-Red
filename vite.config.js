// Proxy exclusivo para pruebas locales. No proporciona autenticación de usuarios.
import fs from 'node:fs';

function config() {
  const values = {};
  if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
    const match=line.match(/^\s*(SAN_API_KEY|SAN_AREA_LEGAL)\s*=\s*(.*?)\s*$/);
    if(match) values[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
  return {...values,...Object.fromEntries(['SAN_API_KEY','SAN_AREA_LEGAL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))};
}

export default {
  server: { host:'127.0.0.1' },
  plugins: [{ name:'legal-san-local-proxy', configureServer(server) {
    server.middlewares.use('/api/tickets',async(req,res)=>{
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      const end=(status,msg)=>{res.statusCode=status;res.end(JSON.stringify({ok:false,message:msg}));};
      if(req.method!=='GET')return end(405,'Método no permitido');
      const settings=config(), area=settings.SAN_AREA_LEGAL, key=settings.SAN_API_KEY;
      if(!area||!/^[A-Za-z0-9_-]+$/.test(area)||!key)return end(503,'Configure SAN_AREA_LEGAL y SAN_API_KEY en .env.local.');
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
