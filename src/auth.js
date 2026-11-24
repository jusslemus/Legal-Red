import './style.css';
import logoUrl from '../img/logo.jpg';
const app=document.querySelector('#app');
const url=(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'';
app.innerHTML=`<main class="login-page"><section class="login-card"><img class="login-logo" src="${logoUrl}" alt="RED Intelfon"><div class="eyebrow">RED INTELFON</div><h1>Bienvenido a Legal RED</h1><p>Ingresa con tu cuenta autorizada para consultar el dashboard.</p><form id="loginForm"><label>Correo electrónico<input id="email" type="email" autocomplete="username" required></label><label>Contraseña<input id="password" type="password" autocomplete="current-password" required></label><p id="loginError" class="login-error" role="alert"></p><button class="login-submit" type="submit">Iniciar sesión</button></form><small>Acceso para personal autorizado</small></section></main>`;
const form=document.querySelector('#loginForm'),error=document.querySelector('#loginError');
form.addEventListener('submit',async e=>{
 e.preventDefault();error.textContent='';const button=form.querySelector('button');button.disabled=true;button.textContent='Ingresando...';
 try {
  let origin;try{origin=new URL(url);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')||origin.pathname!=='/'||origin.search||origin.hash)throw Error()}catch{throw new Error('Configura la URL y la clave pública de Supabase en .env.local.')}
  if(!key)throw new Error('Configura la URL y la clave pública de Supabase en .env.local.');
  const response=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value})});
  if(!response.ok)throw new Error('No fue posible ingresar. Verifica tu correo y contraseña.');
  const session=await response.json();if(!session.access_token||!session.user?.id)throw Error('Respuesta de acceso inválida.');
  const profileUrl=new URL('/rest/v1/perfiles_legal',origin);profileUrl.searchParams.set('select','nombre,rol,activo');profileUrl.searchParams.set('usuario_id','eq.'+session.user.id);
  const profileResponse=await fetch(profileUrl,{headers:{apikey:key,Authorization:'Bearer '+session.access_token}});
  if(!profileResponse.ok)throw Error('No fue posible verificar tu perfil.');const profiles=await profileResponse.json();
  if(!Array.isArray(profiles)||profiles.length!==1||!profiles[0].activo||!['admin','visor'].includes(profiles[0].rol))throw Error('Tu cuenta no tiene acceso al dashboard.');
  document.querySelector('#password').value='';window.legalAccessToken=session.access_token;await import('./main.js');
  document.querySelector('.user b').textContent=profiles[0].nombre;document.querySelector('.user small').textContent=profiles[0].rol==='admin'?'Administrador':'Visor';
  if(profiles[0].rol==='admin'){const {installUserAdmin}=await import('./users.js');installUserAdmin();}
 }catch(err){error.textContent=err instanceof TypeError?'No se pudo conectar con Supabase.':err.message;button.disabled=false;button.textContent='Iniciar sesión'}
});
