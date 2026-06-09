-- ============================================================
-- BOLÃO FRAM · COPA 2026 — Schema do banco (Supabase / Postgres)
-- ============================================================
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Ele cria todas as tabelas, regras de segurança e índices de uma vez.
-- É seguro rodar de novo: usa "if not exists" / "drop ... if exists".
-- ============================================================

-- ---------- PARTICIPANTES ----------
-- Cada pessoa do escritório. Senha simples, guardada com hash (nunca em texto puro).
create table if not exists participantes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  senha_hash  text not null,
  is_admin    boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- ---------- JOGOS ----------
-- Os 104 jogos da Copa. Preenchidos pelo seed (Codex gera) e atualizados pela API.
-- fase: 'grupos' | 'r32' | 'oitavas' | 'quartas' | 'semis' | 'final'
create table if not exists jogos (
  id            int primary key,            -- id estável (1..104) para casar palpite com jogo
  fase          text not null,
  grupo         text,                       -- 'A'..'L' na fase de grupos; null no mata-mata
  time_casa     text not null,
  time_fora     text not null,
  data_hora     timestamptz,                -- início do jogo (horário de Brasília)
  gols_casa     int,                        -- null = ainda sem resultado
  gols_fora     int,
  finalizado    boolean not null default false,
  fonte_externa text                        -- id do jogo na openfootball, p/ casar resultados
);

-- ---------- PALPITES ----------
-- Um palpite por participante por jogo. Placar cheio (casa x fora).
create table if not exists palpites (
  id              uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes(id) on delete cascade,
  jogo_id         int  not null references jogos(id) on delete cascade,
  gols_casa       int  not null,
  gols_fora       int  not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (participante_id, jogo_id)
);

-- ---------- PALPITE DE CAMPEÃO ----------
-- Bônus de +10. Um por participante.
create table if not exists palpite_campeao (
  participante_id uuid primary key references participantes(id) on delete cascade,
  selecao         text not null,
  criado_em       timestamptz not null default now()
);

-- ---------- CONFIG ----------
-- Configurações simples do bolão, como o campeão real para o bônus final.
create table if not exists config (
  chave text primary key,
  valor text
);

-- ---------- TRAVAS POR FASE ----------
-- Define quando os palpites de cada fase fecham. Admin controla; a API também respeita.
-- Antes do deadline: pode editar. Depois: bloqueado.
create table if not exists travas_fase (
  fase     text primary key,    -- 'grupos','r32','oitavas','quartas','semis','final','campeao'
  deadline timestamptz not null
);

-- Deadlines iniciais (ajuste no admin depois). 'grupos' e 'campeao' fecham no 1º jogo.
insert into travas_fase (fase, deadline) values
  ('grupos',   '2026-06-11 13:00:00-03'),
  ('campeao',  '2026-06-11 13:00:00-03'),
  ('r32',      '2026-06-29 13:00:00-03'),
  ('oitavas',  '2026-07-04 13:00:00-03'),
  ('quartas',  '2026-07-09 13:00:00-03'),
  ('semis',    '2026-07-14 13:00:00-03'),
  ('final',    '2026-07-19 13:00:00-03')
on conflict (fase) do nothing;

-- ---------- ÍNDICES ----------
create index if not exists idx_palpites_participante on palpites(participante_id);
create index if not exists idx_palpites_jogo on palpites(jogo_id);
create index if not exists idx_jogos_fase on jogos(fase);
create index if not exists idx_jogos_finalizado on jogos(finalizado);

-- ============================================================
-- SEGURANÇA (Row Level Security)
-- ============================================================
-- O site usa a chave pública (anon) no navegador. As escritas sensíveis
-- (resultados, criação de participantes, login) passam por rotas de servidor
-- que usam a chave service_role e ignoram o RLS. Por isso:
--   - leitura: liberada (todo mundo vê jogos, ranking, etc.)
--   - escrita de palpite: liberada porém validada na rota de servidor
--   - resultados/admin: só via service_role (servidor)
-- ============================================================

alter table participantes    enable row level security;
alter table jogos            enable row level security;
alter table palpites         enable row level security;
alter table palpite_campeao  enable row level security;
alter table config           enable row level security;
alter table travas_fase      enable row level security;

-- Leitura pública (o ranking precisa ler tudo)
drop policy if exists leitura_jogos on jogos;
create policy leitura_jogos on jogos for select using (true);

drop policy if exists leitura_palpites on palpites;
create policy leitura_palpites on palpites for select using (true);

drop policy if exists leitura_campeao on palpite_campeao;
create policy leitura_campeao on palpite_campeao for select using (true);

drop policy if exists leitura_config on config;
create policy leitura_config on config for select using (true);

drop policy if exists leitura_travas on travas_fase;
create policy leitura_travas on travas_fase for select using (true);

-- Participantes: só expõe id, nome e is_admin para leitura (senha_hash fica protegido
-- porque o navegador nunca faz select nessa tabela direto — só via rota de servidor).
drop policy if exists leitura_participantes on participantes;
create policy leitura_participantes on participantes for select using (true);

-- Nenhuma policy de INSERT/UPDATE/DELETE para o navegador:
-- todas as escritas passam pelas rotas de servidor com service_role.
-- (Sem policy = bloqueado para a chave anon, que é o que queremos.)
