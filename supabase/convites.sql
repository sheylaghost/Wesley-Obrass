-- Rode uma vez em projetos existentes para habilitar links de convite de uso único.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.convites (
  token_hash bytea primary key,
  empresa_id uuid not null references public.empresas on delete cascade,
  expires_at timestamptz not null
);
alter table public.convites enable row level security;
revoke all on public.convites from anon, authenticated;

create or replace function public.criar_link_convite()
returns text language plpgsql security definer set search_path=public,extensions as $$
declare
  v_email text := lower(auth.jwt()->>'email');
  v_empresa uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null or v_email is null then raise exception 'login necessário'; end if;
  select m.empresa_id into v_empresa from public.membros m
    where m.email=v_email and m.papel='admin' limit 1;
  if v_empresa is null then raise exception 'somente o administrador pode convidar'; end if;
  insert into public.convites(token_hash,empresa_id,expires_at)
    values (extensions.digest(convert_to(v_token,'UTF8'),'sha256'),v_empresa,now()+interval '7 days');
  return v_token;
end $$;
revoke execute on function public.criar_link_convite() from public, anon;
grant execute on function public.criar_link_convite() to authenticated;

create or replace function public.aceitar_convite(p_token text)
returns table(emp uuid,pap text)
language plpgsql security definer set search_path=public,extensions as $$
declare
  v_email text := lower(auth.jwt()->>'email');
  v_empresa uuid;
  v_papel text;
begin
  if auth.uid() is null or v_email is null then raise exception 'login necessário'; end if;
  if p_token is null or length(p_token) <> 64 then raise exception 'convite inválido ou expirado'; end if;
  delete from public.convites c
    where c.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')
      and c.expires_at>now()
    returning c.empresa_id into v_empresa;
  if v_empresa is null then raise exception 'convite inválido, expirado ou já utilizado'; end if;
  insert into public.membros(empresa_id,email,papel)
    values(v_empresa,v_email,'socio')
    on conflict(empresa_id,email) do nothing;
  select m.papel into v_papel from public.membros m
    where m.empresa_id=v_empresa and m.email=v_email;
  return query select v_empresa,v_papel;
end $$;
revoke execute on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;
