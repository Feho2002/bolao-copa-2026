# 🤖 Prompts para o Codex — partes mecânicas do Bolão FRAM

Cole estes prompts no Codex, um de cada vez, **com a pasta do projeto aberta** (assim ele enxerga os arquivos existentes e mantém consistência). Cada prompt é autossuficiente.

A divisão é proposital: o núcleo de risco (schema, lógica de pontuação `lib/pontuacao.js`, login, atualizador de resultados, salvamento de palpites, e a home com o ranking) **já está pronto e validado**. O Codex só preenche o volume repetitivo, seguindo os contratos já definidos.

---

## PROMPT 1 — Gerar o seed dos 104 jogos

```
Contexto: projeto Next.js de um bolão da Copa 2026. Já existe a tabela `jogos` no
Postgres (Supabase) com este formato (ver supabase/schema.sql):
  jogos(id int PK, fase text, grupo text, time_casa text, time_fora text,
        data_hora timestamptz, gols_casa int, gols_fora int,
        finalizado bool default false, fonte_externa text)

Tarefa: gere o arquivo supabase/seed.sql com INSERTs dos 104 jogos da Copa do Mundo 2026.

Fonte de verdade (use exatamente os nomes de time daqui, pois o atualizador de
resultados casa por nome): 
https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json

Regras:
- id de 1 a 104, sequencial pela data/hora do jogo.
- fase: 'grupos' para a primeira fase; para o mata-mata use 'r32','oitavas',
  'quartas','semis','final' conforme a rodada.
- grupo: letra 'A'..'L' nos jogos de grupos; NULL no mata-mata.
- data_hora: converta para o fuso de Brasília (-03).
- time_casa = team1, time_fora = team2.
- fonte_externa: monte como lower("team1")||'|'||lower("team2") (sem acentos extras,
  trim), para casar com o atualizador em app/api/atualizar-resultados/route.js.
- gols_casa/gols_fora ficam NULL; finalizado = false.
- No mata-mata, se os confrontos ainda não estiverem definidos na fonte, use os
  rótulos da fonte (ex.: "Winner Group A") como nome do time mesmo.
- Comece o arquivo com: delete from jogos;  (para poder rodar de novo sem duplicar)

Saída: apenas o arquivo supabase/seed.sql, pronto para colar no SQL Editor do Supabase.
```

---

## PROMPT 2 — Página de palpites (app/palpites/page.js)

```
Contexto: Next.js (app router), client component. Já existem:
- lib/supabase.js  -> exporta supabaseBrowser (cliente anon)
- lib/pontuacao.js -> regras (não precisa aqui)
- Rota POST /api/palpites  -> body {participante_id, jogo_id, gols_casa, gols_fora};
  salva via upsert e RECUSA (403) se a fase já travou.
- Estilos em app/globals.css: use as classes .container, .abas/.aba(/.ativa),
  .card, .grupo-hdr, .jogo (com .casa/.x), .aviso/.aviso.travado, .salvo, .btn.
- O usuário logado fica em localStorage na chave "bolao_user"
  ({id, nome, is_admin}); se não houver, redirecione para "/" .

Tarefa: crie app/palpites/page.js. A tela deixa a pessoa palpitar o placar de cada
jogo, agrupado por fase e por grupo (A..L). Para cada jogo, dois inputs numéricos
(casa x fora). Ao alterar, salve automaticamente via POST /api/palpites (debounce de
~600ms) e mostre "Palpite salvo" na linha .salvo; se vier 403, mostre o aviso de
fase travada e desabilite os inputs daquele bloco de fase.

Carregue os jogos de supabaseBrowser.from("jogos").select(...).order("data_hora").
Carregue os palpites já existentes do usuário e pré-preencha os inputs.
Inclua também um seletor de "Campeão da Copa" (lista das 48 seleções presentes nos
jogos de grupos) que salva em /api/palpites? -> NÃO: para campeão, crie e use uma
rota nova POST /api/campeao {participante_id, selecao} que faz upsert em
palpite_campeao e respeita a trava da fase 'campeao'. Gere também essa rota
app/api/campeao/route.js seguindo o mesmo padrão de app/api/palpites/route.js.

Mantenha a navegação por abas idêntica à da home (links para "/", "/palpites",
"/admin" se is_admin). Estética e nomes de classe iguais aos da home. Texto em PT-BR.
```

---

## PROMPT 3 — Página de admin (app/admin/page.js)

```
Contexto: mesmo projeto. Só quem tem is_admin=true (no localStorage "bolao_user")
pode ver; senão redirecione para "/". Já existe lib/supabase.js (supabaseBrowser) e
o padrão de rotas de servidor em app/api/*.

Tarefa A: crie a rota POST /api/admin/resultado
  body {jogo_id, gols_casa, gols_fora, finalizado}
  -> usa supabaseAdmin() (service_role) para atualizar o jogo. Valide que o
     chamador é admin: receba também participante_id e cheque is_admin no banco
     antes de gravar.

Tarefa B: crie a rota POST /api/admin/trava
  body {fase, deadline}  -> atualiza travas_fase (upsert).

Tarefa C: crie app/admin/page.js com:
  1) Lista de todos os jogos (order data_hora), cada um com dois inputs de placar e
     um checkbox "finalizado", e botão "Salvar" que chama /api/admin/resultado.
     Mostre quais já vieram automaticamente da API (finalizado=true).
  2) Bloco "Prazos das fases": para cada linha de travas_fase, um input datetime-local
     e botão salvar -> /api/admin/trava.
  3) Um campo para definir o "campeão real" da Copa (seleção) que, ao salvar, marca
     o vencedor para o bônus de +10. Guarde isso numa nova linha de config: crie a
     tabela `config(chave text pk, valor text)` no início (via /api/admin/resultado
     não; gere um pequeno SQL em supabase/config.sql com:
       create table if not exists config(chave text primary key, valor text);
     e uma rota POST /api/admin/campeao-real {selecao} que upserta config
     ('campeao_real', selecao). ) 
     Depois ajuste app/page.js para ler config.campeao_real e passar como campeaoReal
     ao calcularRanking (hoje a home usa uma simplificação — troque por essa leitura).

Use as mesmas classes de estilo (.container, .card, .jogo, .btn, .aba). PT-BR.
Capriche em deixar claro o que é automático (API) vs. manual.
```

---

## PROMPT 4 (opcional) — Testes da pontuação

```
Crie testes para lib/pontuacao.js cobrindo: placar exato (3*peso), só resultado
(1*peso), erro (0), jogo não finalizado (0), bônus de campeão (+10), ordenação do
ranking com empate (desempate por exatos, depois por acertos de resultado, depois
nome). Use vitest. Adicione o script "test" no package.json.
```

---

### Ordem sugerida
1 → coloca os jogos no banco · 2 → libera os palpites · 3 → te dá o controle de admin · 4 → garante que a conta está certa.
