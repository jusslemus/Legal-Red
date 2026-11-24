-- Ejecutar en Supabase > SQL Editor con una cuenta administradora del proyecto.
-- Las credenciales de acceso las administra Supabase Auth, no esta tabla.
create table if not exists public.perfiles_legal (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  rol text not null check (rol in ('admin', 'visor')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.perfiles_legal enable row level security;
revoke all on table public.perfiles_legal from anon, authenticated;
grant select on table public.perfiles_legal to authenticated;

drop policy if exists perfiles_leer_propio on public.perfiles_legal;
create policy perfiles_leer_propio on public.perfiles_legal
  for select to authenticated using (usuario_id = (select auth.uid()));

-- No se permite escritura desde el navegador, ni siquiera a administradores.
-- La gestión de cuentas requiere un backend autenticado y autorizado que compruebe
-- el rol y utilice las API administrativas de Supabase del lado del servidor.
-- Crear primero a Fátima en Authentication > Users. Luego sustituir el correo
-- y ejecutar esta consulta por separado desde SQL Editor:
-- insert into public.perfiles_legal (usuario_id, nombre, rol, activo)
-- select id, 'Fátima Espinal', 'admin', true from auth.users
-- where lower(email) = lower('CORREO_DE_FATIMA')
-- on conflict (usuario_id) do update set nombre=excluded.nombre,
--   rol='admin', activo=true, actualizado_en=now();
-- Comprobar que el comando afecte exactamente una fila.
