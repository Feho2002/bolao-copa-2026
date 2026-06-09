# 🏆 Bolão FRAM · Copa 2026

Site de bolão da Copa do Mundo 2026 para o escritório. Login simples, palpites por
placar, ranking ao vivo, resultados automáticos 2x/dia e tela de admin.

## Para colocar no ar
👉 Siga o **PASSO-A-PASSO.md** (40 min, tudo grátis, sem precisar programar).

## Partes que faltam gerar (delegadas ao Codex)
👉 Veja **PROMPTS-CODEX.md** — prompts prontos para gerar o seed dos 104 jogos,
a página de palpites e a de admin.

## Como funciona a pontuação
- Placar exato: **3 pts** · Só o resultado (vitória/empate): **1 pt** · Campeão: **+10**
- Peso por fase: grupos x1, R32 x2, oitavas x3, quartas x4, semis x5, final x6
- Tudo configurável no topo de `lib/pontuacao.js`.

## Stack
Next.js · Supabase (banco + login + tempo real) · Vercel (hospedagem) · cron-job.org
Fonte de resultados: openfootball/worldcup.json (domínio público, sem chave de API).

## O que já está pronto (núcleo)
- `supabase/schema.sql` — banco + segurança
- `lib/pontuacao.js` — lógica de pontuação (testável)
- `app/api/login` — login com senha por hash
- `app/api/palpites` — salvar palpite respeitando a trava da fase
- `app/api/atualizar-resultados` — busca placares e atualiza (chamado pelo cron)
- `app/page.js` — home com login + ranking ao vivo
