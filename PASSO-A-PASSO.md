# 🏆 Bolão FRAM · Copa 2026 — Passo a passo para colocar no ar

Você não precisa saber programar. É copiar, colar e clicar. Reserve ~40 minutos.
Tudo é **gratuito**. Você vai criar 3 contas (Supabase, GitHub, Vercel) e usar 1 site de cron.

---

## Visão geral (o que cada peça faz)

- **Supabase** → o banco de dados. Guarda participantes, palpites, jogos e resultados. Tem o login e o "tempo real".
- **GitHub** → onde o código do site fica guardado (a Vercel lê daqui).
- **Vercel** → coloca o site no ar, de graça, num link tipo `bolao-fram.vercel.app`.
- **cron-job.org** → relógio externo que chama o site às 06h e 23h para atualizar os resultados.

---

## PARTE 1 — Banco de dados (Supabase)  ⏱️ ~10 min

1. Acesse **https://supabase.com** → **Start your project** → entre com seu e-mail/Google.
2. Clique **New project**. Dê um nome (ex.: `bolao-fram`), crie uma **Database Password** (anote num lugar seguro) e escolha a região **South America (São Paulo)**. Clique **Create**.
3. Espere ~2 min até o projeto ficar pronto.
4. No menu lateral, clique no ícone **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/schema.sql` (que veio no pacote), **copie tudo** e **cole** na caixa. Clique **Run** (canto inferior). Deve aparecer "Success".
   - ✅ Isso cria todas as tabelas e as regras de segurança de uma vez.
6. Agora pegue suas chaves: menu lateral **Settings (engrenagem)** → **API**. Anote 3 coisas:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public** (uma chave longa)
   - **service_role** (outra chave longa — **secreta, nunca compartilhe**)
7. Ative o tempo real: menu **Database** → **Replication** (ou **Publications**) → garanta que as tabelas `jogos` e `palpites` estão publicadas. (No Supabase novo costuma já vir ligado; se não achar, pode pular — o ranking ainda atualiza ao recarregar.)

---

## PARTE 2 — Subir o código (GitHub)  ⏱️ ~8 min

1. Acesse **https://github.com** e crie uma conta (se não tiver).
2. Clique no **+** (canto superior direito) → **New repository**. Nome: `bolao-fram`. Deixe **Private**. Clique **Create repository**.
3. Na página seguinte, clique em **uploading an existing file** (link no meio da tela).
4. **Arraste para lá TODOS os arquivos e pastas do pacote** (a pasta `app`, `lib`, `supabase`, e os arquivos soltos como `package.json`). Importante: arraste o **conteúdo** da pasta, não a pasta-mãe zipada.
5. Clique **Commit changes**.

> 💡 Se preferir, peça ao Codex: "suba esta pasta para um novo repositório privado no meu GitHub chamado bolao-fram". Ele faz por linha de comando.

---

## PARTE 3 — Colocar no ar (Vercel)  ⏱️ ~8 min

1. Acesse **https://vercel.com** → **Sign up** → **Continue with GitHub** (use a conta que você acabou de criar).
2. Clique **Add New… → Project**. Encontre o repositório `bolao-fram` e clique **Import**.
3. Antes de finalizar, abra a seção **Environment Variables** e adicione estas 4 (nome à esquerda, valor à direita):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | o **Project URL** da Parte 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave **anon public** |
   | `SUPABASE_SERVICE_ROLE_KEY` | a chave **service_role** |
   | `CRON_SECRET` | invente uma senha longa aleatória (ex.: 30 letras/números) |

4. Clique **Deploy**. Espere ~2 min. No fim aparece um link tipo `https://bolao-fram.vercel.app`. **Esse é o site!** Abra e teste o login.

---

## PARTE 4 — Carregar os 104 jogos  ⏱️ ~5 min

O banco está vazio de jogos. Você tem duas opções:

- **Opção A (recomendada, via Codex):** use o prompt `1` do arquivo `PROMPTS-CODEX.md`. O Codex gera o arquivo `supabase/seed.sql` com os 104 jogos reais (puxando da fonte pública). Depois é só colar esse `seed.sql` no **SQL Editor** do Supabase e **Run**, igual fez com o schema.
- **Opção B (manual):** entre como **admin** no site e cadastre os jogos na tela de admin (mais trabalhoso).

> Para virar admin: faça login no site com um nome qualquer e senha. Depois, no Supabase → **Table Editor → participantes**, ache sua linha e mude `is_admin` para `true`. Recarregue o site: a aba **Admin** aparece.

---

## PARTE 5 — Atualização automática de resultados (cron 2x/dia)  ⏱️ ~5 min

1. Acesse **https://cron-job.org** → crie conta grátis.
2. **Create cronjob**. Em **URL**, cole:
   ```
   https://SEU-SITE.vercel.app/api/atualizar-resultados?token=SEU_CRON_SECRET
   ```
   (troque `SEU-SITE` e use exatamente o mesmo `CRON_SECRET` da Parte 3).
3. Em **Schedule**, configure dois horários: **06:00** e **23:00**. (No cron-job.org dá para marcar horas específicas; selecione 6 e 23, todos os dias.)
4. Salve. Pronto — o site buscará os placares duas vezes por dia sozinho.

> Quer testar agora? Cole a URL acima no navegador. Se aparecer `{"ok":true,...}`, está funcionando. Se aparecer `não autorizado`, o token está diferente do `CRON_SECRET`.

---

## Pronto! ✅

Mande o link `https://SEU-SITE.vercel.app` no grupo do escritório. Cada um cria o login, dá os palpites antes do 1º jogo (11/06), e o ranking se atualiza sozinho.

### Dúvidas frequentes
- **Um resultado não atualizou?** A fonte pública pode demorar algumas horas. Entre como admin e lance o placar na mão — leva 10 segundos.
- **Quero mudar a pontuação?** Está tudo em `lib/pontuacao.js`, no topo do arquivo (os pesos e pontos). Mude, suba no GitHub, a Vercel re-publica sozinha.
- **Quero mudar os prazos das fases?** Tabela `travas_fase` no Supabase (Table Editor), ou pela tela de admin.
