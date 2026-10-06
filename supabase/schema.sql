-- Rode no Supabase: SQL Editor > New query > Run
-- ATENÇÃO: apaga as tabelas antigas (dados de teste na nuvem). Os dados locais dos aparelhos são reenviados no próximo login.
drop table if exists obras, config, convites, membros, empresas cascade;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table empresas (id uuid primary key default gen_random_uuid(), nome text not null default 'Minha empresa');
create table membros (
  empresa_id uuid not null references empresas on delete cascade,
  email text not null,
  papel text not null default 'socio' check (papel in ('admin','socio')),
  primary key (empresa_id, email)
);
create table obras (
  empresa_id uuid not null references empresas on delete cascade,
  id bigint not null,
  nome text not null,
  status text not null default 'Em andamento',
  orc numeric not null default 0,
  dados jsonb not null default '{"gastos":[],"checklist":[],"diario":[]}',
  updated_at timestamptz not null default now(),
  primary key (empresa_id, id)
);
create table config (empresa_id uuid primary key references empresas on delete cascade, modelo jsonb not null default '[]');
create table convites (
  token_hash bytea primary key,
  empresa_id uuid not null references empresas on delete cascade,
  expires_at timestamptz not null
);

create or replace function meu_email() returns text language sql stable as $$ select lower(auth.jwt()->>'email') $$;
create or replace function minha_empresa() returns uuid language sql stable security definer set search_path=public as
$$ select empresa_id from membros where email=meu_email() limit 1 $$;
create or replace function sou_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from membros where email=meu_email() and papel='admin') $$;

-- Chamada pelo app após o login: acha a empresa do convite; se não houver convite, cria uma nova com a pessoa como admin.
create or replace function entrar_empresa() returns table(emp uuid, pap text) language plpgsql security definer set search_path=public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  if not exists (select 1 from membros where email=meu_email()) then
    insert into empresas default values returning id into e;
    insert into membros values (e, meu_email(), 'admin');
  end if;
  return query select m.empresa_id, m.papel from membros m where m.email=meu_email() limit 1;
end $$;
revoke execute on function entrar_empresa() from public, anon;
grant execute on function entrar_empresa() to authenticated;

create or replace function criar_link_convite() returns text language plpgsql security definer set search_path=public,extensions as $$
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
revoke execute on function criar_link_convite() from public, anon;
grant execute on function criar_link_convite() to authenticated;

create or replace function aceitar_convite(p_token text) returns table(emp uuid,pap text)
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
revoke execute on function aceitar_convite(text) from public, anon;
grant execute on function aceitar_convite(text) to authenticated;

alter table empresas enable row level security;
alter table membros enable row level security;
alter table obras enable row level security;
alter table config enable row level security;
alter table convites enable row level security;
create policy "empresa: ver a minha" on empresas for select using (id = minha_empresa());
create policy "membros: ver equipe" on membros for select using (empresa_id = minha_empresa());
create policy "membros: admin convida" on membros for insert with check (empresa_id = minha_empresa() and sou_admin());
create policy "membros: admin remove" on membros for delete using (empresa_id = minha_empresa() and sou_admin() and email <> meu_email());
create policy "obras: equipe" on obras for all using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
create policy "config: equipe" on config for all using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
