create table if not exists config (
  chave text primary key,
  valor text
);

alter table config enable row level security;

drop policy if exists leitura_config on config;
create policy leitura_config on config for select using (true);
