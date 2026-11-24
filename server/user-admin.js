const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createUserAdminHandler(config){return async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 const reply=(status,message,data)=>{res.statusCode=status;res.end(JSON.stringify({ok:status<400,message,...(data?{data}:{})}));};
 try{
  const s=config(),token=req.headers.authorization||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(token))return reply(401,'Inicia sesión nuevamente.');
  let base;try{base=new URL(s.VITE_SUPABASE_URL);if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||base.pathname!=='/'||base.search||base.hash)throw Error()}catch{return reply(503,'Configura la URL de Supabase.');}
  if(!s.VITE_SUPABASE_PUBLISHABLE_KEY||!s.SUPABASE_SECRET_KEY)return reply(503,'Falta SUPABASE_SECRET_KEY en .env.local del servidor.');
  const userHeaders={apikey:s.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:token};
  const meResponse=await fetch(new URL('/auth/v1/user',base),{headers:userHeaders,signal:AbortSignal.timeout(10000)});
  if(!meResponse.ok)return reply(401,'Sesión inválida o vencida.');const me=await meResponse.json();if(!UUID.test(me.id||''))return reply(401,'Sesión inválida.');
  const profileUrl=new URL('/rest/v1/perfiles_legal',base);profileUrl.searchParams.set('select','usuario_id,nombre,rol,activo');profileUrl.searchParams.set('usuario_id','eq.'+me.id);
  const myProfile=await fetch(profileUrl,{headers:userHeaders,signal:AbortSignal.timeout(10000)});if(!myProfile.ok)return reply(503,'No se pudo verificar el perfil.');const mine=await myProfile.json();
  if(!Array.isArray(mine)||mine.length!==1||mine[0].rol!=='admin'||mine[0].activo!==true)return reply(403,'Solo los administradores pueden gestionar usuarios.');
  const serviceHeaders={apikey:s.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
  const api=async(path,options={})=>{const response=await fetch(new URL(path,base),{...options,headers:{...serviceHeaders,...options.headers},signal:AbortSignal.timeout(15000)});let body=null;try{body=await response.json()}catch{}return {response,body}};
  const path=new URL(req.url,'http://localhost').pathname;const id=path==='/'?'':path.slice(1);if(id&&!UUID.test(id))return reply(400,'Identificador inválido.');
  if(req.method==='GET'&&!id){
   const profiles=await api('/rest/v1/perfiles_legal?select=usuario_id,nombre,rol,activo&order=nombre');if(!profiles.response.ok||!Array.isArray(profiles.body))return reply(502,'No se pudieron obtener los usuarios.');
   const rows=[];for(const p of profiles.body){const u=await api('/auth/v1/admin/users/'+p.usuario_id);if(!u.response.ok)return reply(502,'No se pudieron obtener las cuentas de acceso.');rows.push({id:p.usuario_id,nombre:p.nombre,rol:p.rol,email:u.body.email||'',activo:p.activo});}return reply(200,'',rows);
  }
  if(!['POST','PUT','DELETE'].includes(req.method))return reply(405,'Método no permitido.');
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(403,'Origen no autorizado.');
  if(req.method==='DELETE'){
   if(!id)return reply(400,'Selecciona un usuario.');if(id===me.id)return reply(400,'No puedes eliminar tu propia cuenta.');
   const target=await api('/rest/v1/perfiles_legal?select=usuario_id&usuario_id=eq.'+id);if(!target.response.ok||!Array.isArray(target.body)||target.body.length!==1)return reply(404,'Usuario de Legal no encontrado.');
   const result=await api('/auth/v1/admin/users/'+id,{method:'DELETE'});if(!result.response.ok)return reply(502,'No se pudo eliminar la cuenta en Supabase.');return reply(200,'Usuario eliminado.');
  }
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(415,'Formato inválido.');
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)return reply(413,'Solicitud demasiado grande.');}let data;try{data=JSON.parse(raw)}catch{return reply(400,'Datos inválidos.');}
  const nombre=String(data.nombre||'').trim(),email=String(data.email||'').trim().toLowerCase(),rol=data.rol,password=String(data.password||'');
  if(!nombre||nombre.length>120||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','visor'].includes(rol))return reply(400,'Completa nombre, correo y rol válidos.');
  if((req.method==='POST'&&!password)||(password&&password.length<12))return reply(400,'La contraseña debe tener al menos 12 caracteres.');
  if(req.method==='POST'&&!id){
   const created=await api('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password,email_confirm:true})});if(!created.response.ok||!UUID.test(created.body?.id||''))return reply(400,'No se pudo crear la cuenta. Verifica el correo y las políticas de contraseña.');
   const saved=await api('/rest/v1/perfiles_legal',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({usuario_id:created.body.id,nombre,rol,activo:true})});
   if(!saved.response.ok){const rollback=await api('/auth/v1/admin/users/'+created.body.id,{method:'DELETE'});return reply(502,rollback.response.ok?'No se pudo crear el perfil; se revirtió la cuenta.':'No se pudo crear el perfil. Revisa la cuenta creada en Supabase Authentication.');}
   return reply(201,'Usuario creado.');
  }
  if(req.method==='PUT'&&id){
   if(id===me.id&&rol!=='admin')return reply(400,'No puedes quitarte tu propio rol de administrador.');
   const target=await api('/rest/v1/perfiles_legal?select=usuario_id&usuario_id=eq.'+id);if(!target.response.ok||!Array.isArray(target.body)||target.body.length!==1)return reply(404,'Usuario de Legal no encontrado.');
   const attrs={email};if(password)attrs.password=password;
   const account=await api('/auth/v1/admin/users/'+id,{method:'PUT',body:JSON.stringify(attrs)});if(!account.response.ok)return reply(400,'No se pudo actualizar la cuenta. Revisa el correo o la contraseña.');
   const saved=await api('/rest/v1/perfiles_legal?usuario_id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({nombre,rol,actualizado_en:new Date().toISOString()})});
   if(!saved.response.ok)return reply(502,'La cuenta se actualizó, pero el perfil no. Revisa el perfil en Supabase.');return reply(200,'Usuario actualizado.');
  }
  return reply(405,'Método no permitido.');
 }catch{return reply(503,'No se pudo completar la operación con Supabase.');}
};}
