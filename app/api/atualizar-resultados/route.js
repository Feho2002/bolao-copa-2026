import { supabaseAdmin } from "../../../lib/supabase";

const FONTE =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const FASES_MATA_MATA = new Set(["r32", "oitavas", "quartas", "semis", "final"]);

function nomeTime(time) {
  return String(time?.name || time || "").trim();
}

function normalizar(texto) {
  return String(texto || "").trim().toLowerCase();
}

function fonteExterna(timeCasa, timeFora) {
  return `${normalizar(timeCasa)}|${normalizar(timeFora)}`;
}

function faseDaRodada(rodada) {
  if (String(rodada || "").startsWith("Matchday")) return "grupos";
  if (rodada === "Round of 32") return "r32";
  if (rodada === "Round of 16") return "oitavas";
  if (rodada === "Quarter-final") return "quartas";
  if (rodada === "Semi-final") return "semis";
  if (rodada === "Final" || rodada === "Match for third place") return "final";
  return null;
}

function kickoffUtcMs(jogoFonte) {
  const partes = String(jogoFonte.time || "").match(/^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/);
  if (!partes) return null;

  const [, hora, minuto, offsetTexto] = partes;
  const offset = Number(offsetTexto);

  return Date.UTC(
    Number(jogoFonte.date.slice(0, 4)),
    Number(jogoFonte.date.slice(5, 7)) - 1,
    Number(jogoFonte.date.slice(8, 10)),
    Number(hora) - offset,
    Number(minuto)
  );
}

function dataHoraBrasilia(jogoFonte) {
  const utcMs = kickoffUtcMs(jogoFonte);
  if (utcMs == null) return null;

  const br = new Date(utcMs - 3 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");

  return `${br.getUTCFullYear()}-${p(br.getUTCMonth() + 1)}-${p(br.getUTCDate())} ${p(
    br.getUTCHours()
  )}:${p(br.getUTCMinutes())}:00-03`;
}

function confrontoDefinido(jogoFonte, selecoes) {
  return selecoes.has(normalizar(nomeTime(jogoFonte.team1))) && selecoes.has(normalizar(nomeTime(jogoFonte.team2)));
}

function mesmoHorario(jogoBanco, utcMs) {
  const horarioBanco = Date.parse(jogoBanco.data_hora);
  return Number.isFinite(horarioBanco) && Math.abs(horarioBanco - utcMs) < 60_000;
}

function deveAtualizarConfronto(jogoBanco, confronto) {
  return (
    jogoBanco.time_casa !== confronto.time_casa ||
    jogoBanco.time_fora !== confronto.time_fora ||
    jogoBanco.fase !== confronto.fase ||
    jogoBanco.fonte_externa !== confronto.fonte_externa ||
    !mesmoHorario(jogoBanco, confronto.utcMs)
  );
}

function selecoesDaFonte(jogosFonte) {
  return new Set(
    jogosFonte
      .filter((jogo) => faseDaRodada(jogo.round) === "grupos")
      .flatMap((jogo) => [nomeTime(jogo.team1), nomeTime(jogo.team2)])
      .map(normalizar)
      .filter(Boolean)
  );
}

async function carregarFonte() {
  const resposta = await fetch(FONTE, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`fonte indisponivel: ${resposta.status}`);
  return resposta.json();
}

async function sincronizarConfrontosMataMata(db, jogosFonte) {
  const selecoes = selecoesDaFonte(jogosFonte);
  const confrontosDefinidos = jogosFonte
    .map((jogoFonte) => {
      const fase = faseDaRodada(jogoFonte.round);
      const utcMs = kickoffUtcMs(jogoFonte);
      const data_hora = dataHoraBrasilia(jogoFonte);
      const time_casa = nomeTime(jogoFonte.team1);
      const time_fora = nomeTime(jogoFonte.team2);

      return {
        fase,
        utcMs,
        data_hora,
        time_casa,
        time_fora,
        fonte_externa: fonteExterna(time_casa, time_fora),
        definido: fase && FASES_MATA_MATA.has(fase) && confrontoDefinido(jogoFonte, selecoes),
      };
    })
    .filter((jogo) => jogo.definido && jogo.utcMs != null && jogo.data_hora);

  if (confrontosDefinidos.length === 0) return 0;

  const { data: jogosBanco, error } = await db
    .from("jogos")
    .select("id, fase, time_casa, time_fora, data_hora, finalizado, fonte_externa");

  if (error) throw new Error(error.message);

  const jogos = jogosBanco || [];
  const porFonte = new Map(
    jogos
      .filter((jogo) => FASES_MATA_MATA.has(jogo.fase))
      .map((jogo) => [`${jogo.fase}|${jogo.fonte_externa}`, jogo])
  );
  const usados = new Set();
  let maxId = jogos.reduce((maior, jogo) => Math.max(maior, Number(jogo.id) || 0), 0);
  let confrontosNovos = 0;

  for (const confronto of confrontosDefinidos) {
    let jogoBanco = porFonte.get(`${confronto.fase}|${confronto.fonte_externa}`);

    if (!jogoBanco) {
      jogoBanco = jogos.find(
        (jogo) =>
          !usados.has(jogo.id) &&
          !jogo.finalizado &&
          jogo.fase === confronto.fase &&
          mesmoHorario(jogo, confronto.utcMs)
      );
    }

    if (jogoBanco?.finalizado) {
      usados.add(jogoBanco.id);
      continue;
    }

    if (jogoBanco) {
      usados.add(jogoBanco.id);
      if (!deveAtualizarConfronto(jogoBanco, confronto)) continue;

      const { error: updateError } = await db
        .from("jogos")
        .update({
          fase: confronto.fase,
          time_casa: confronto.time_casa,
          time_fora: confronto.time_fora,
          data_hora: confronto.data_hora,
          finalizado: false,
          fonte_externa: confronto.fonte_externa,
        })
        .eq("id", jogoBanco.id);

      if (updateError) throw new Error(updateError.message);
      confrontosNovos += 1;
      continue;
    }

    maxId += 1;
    const { error: insertError } = await db.from("jogos").insert({
      id: maxId,
      fase: confronto.fase,
      grupo: null,
      time_casa: confronto.time_casa,
      time_fora: confronto.time_fora,
      data_hora: confronto.data_hora,
      gols_casa: null,
      gols_fora: null,
      finalizado: false,
      fonte_externa: confronto.fonte_externa,
    });

    if (insertError) throw new Error(insertError.message);
    confrontosNovos += 1;
  }

  return confrontosNovos;
}

async function abrirFasesDefinidas(db, jogosFonte) {
  const selecoes = selecoesDaFonte(jogosFonte);
  const porFase = new Map();

  for (const jogoFonte of jogosFonte) {
    const fase = faseDaRodada(jogoFonte.round);
    if (!FASES_MATA_MATA.has(fase)) continue;

    const item = {
      definido: confrontoDefinido(jogoFonte, selecoes),
      utcMs: kickoffUtcMs(jogoFonte),
      data_hora: dataHoraBrasilia(jogoFonte),
    };

    if (!porFase.has(fase)) porFase.set(fase, []);
    porFase.get(fase).push(item);
  }

  const { data: travas, error } = await db.from("travas_fase").select("fase, deadline");
  if (error) throw new Error(error.message);

  const travaPorFase = new Map((travas || []).map((trava) => [trava.fase, trava.deadline]));
  const fasesAbertas = [];

  for (const [fase, jogos] of porFase.entries()) {
    if (jogos.length === 0 || jogos.some((jogo) => !jogo.definido || jogo.utcMs == null)) continue;

    const primeiroJogo = [...jogos].sort((a, b) => a.utcMs - b.utcMs)[0];
    const deadlineAtual = travaPorFase.get(fase);
    if (deadlineAtual && mesmoHorario({ data_hora: deadlineAtual }, primeiroJogo.utcMs)) continue;

    const { error: upsertError } = await db
      .from("travas_fase")
      .upsert({ fase, deadline: primeiroJogo.data_hora }, { onConflict: "fase" });

    if (upsertError) throw new Error(upsertError.message);
    fasesAbertas.push(fase);
  }

  return fasesAbertas;
}

async function atualizarPlacares(db, jogosFonte) {
  const jogosComPlacar = jogosFonte.filter(
    (jogo) => jogo.score && Array.isArray(jogo.score.ft) && jogo.score.ft.length >= 2
  );

  const { data: nossos, error } = await db
    .from("jogos")
    .select("id, time_casa, time_fora, data_hora, finalizado, fonte_externa");

  if (error) throw new Error(error.message);

  const indice = new Map();
  for (const jogo of nossos || []) {
    const chave = jogo.fonte_externa || fonteExterna(jogo.time_casa, jogo.time_fora);
    if (!indice.has(chave)) indice.set(chave, []);
    indice.get(chave).push(jogo);
  }

  let atualizados = 0;
  for (const jogoFonte of jogosComPlacar) {
    const timeCasa = nomeTime(jogoFonte.team1);
    const timeFora = nomeTime(jogoFonte.team2);
    const candidatos = indice.get(fonteExterna(timeCasa, timeFora)) || [];
    const utcMs = kickoffUtcMs(jogoFonte);
    const jogo =
      candidatos.find((candidato) => utcMs != null && mesmoHorario(candidato, utcMs)) ||
      candidatos.find((candidato) => !candidato.finalizado);

    if (!jogo || jogo.finalizado) continue;

    const [golsCasa, golsFora] = jogoFonte.score.ft;
    const { error: updateError } = await db
      .from("jogos")
      .update({ gols_casa: golsCasa, gols_fora: golsFora, finalizado: true })
      .eq("id", jogo.id);

    if (updateError) throw new Error(updateError.message);
    atualizados += 1;
  }

  return atualizados;
}

function autorizado(request) {
  const token = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  return Boolean(token) && authorization === `Bearer ${token}`;
}

export async function GET(request) {
  if (!autorizado(request)) {
    return Response.json({ ok: false, erro: "nao autorizado" }, { status: 401 });
  }

  const db = supabaseAdmin();

  try {
    const dados = await carregarFonte();
    const jogosFonte = dados?.matches || [];
    const confrontosNovos = await sincronizarConfrontosMataMata(db, jogosFonte);
    const placaresAtualizados = await atualizarPlacares(db, jogosFonte);
    const fasesAbertas = await abrirFasesDefinidas(db, jogosFonte);

    return Response.json({
      ok: true,
      placares_atualizados: placaresAtualizados,
      confrontos_novos: confrontosNovos,
      fases_abertas: fasesAbertas,
    });
  } catch (error) {
    return Response.json({ ok: false, erro: String(error) }, { status: 502 });
  }
}
