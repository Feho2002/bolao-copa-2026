"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";

const FASES = ["grupos", "campeao", "r32", "oitavas", "quartas", "semis", "final"];
const FASE_LABEL = {
  grupos: "Grupos",
  campeao: "Campeão",
  r32: "Round of 32",
  oitavas: "Oitavas",
  quartas: "Quartas",
  semis: "Semifinais",
  final: "Final",
};

function formatarData(dataHora) {
  if (!dataHora) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dataHora));
}

function paraDatetimeLocal(valor) {
  if (!valor) return "";
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(valor))
    .replace(" ", "T");

  return partes;
}

async function lerJson(resposta) {
  try {
    return await resposta.json();
  } catch {
    return {};
  }
}

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [jogos, setJogos] = useState([]);
  const [resultados, setResultados] = useState({});
  const [statusJogos, setStatusJogos] = useState({});
  const [travas, setTravas] = useState([]);
  const [campeaoReal, setCampeaoReal] = useState("");
  const [campeaoStatus, setCampeaoStatus] = useState("");
  const [atualizacaoStatus, setAtualizacaoStatus] = useState("");
  const [atualizandoAgora, setAtualizandoAgora] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const salvo = localStorage.getItem("bolao_user");
    if (!salvo) {
      window.location.href = "/";
      return;
    }

    try {
      const participante = JSON.parse(salvo);
      if (!participante?.is_admin) {
        window.location.href = "/";
        return;
      }
      setUser(participante);
      carregar();
    } catch {
      localStorage.removeItem("bolao_user");
      window.location.href = "/";
    }
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro("");

    const [jogosResp, travasResp, configResp] = await Promise.all([
      supabaseBrowser
        .from("jogos")
        .select("id, fase, grupo, time_casa, time_fora, data_hora, gols_casa, gols_fora, finalizado, fonte_externa")
        .order("data_hora", { ascending: true }),
      supabaseBrowser.from("travas_fase").select("fase, deadline"),
      supabaseBrowser.from("config").select("valor").eq("chave", "campeao_real").maybeSingle(),
    ]);

    if (jogosResp.error || travasResp.error) {
      setErro("Não foi possível carregar os dados de admin.");
      setCarregando(false);
      return;
    }

    const proximosResultados = {};
    for (const jogo of jogosResp.data || []) {
      proximosResultados[jogo.id] = {
        gols_casa: jogo.gols_casa ?? "",
        gols_fora: jogo.gols_fora ?? "",
        finalizado: Boolean(jogo.finalizado),
      };
    }

    const travaPorFase = new Map((travasResp.data || []).map((trava) => [trava.fase, trava]));
    setTravas(
      FASES.map((fase) => ({
        fase,
        deadline: paraDatetimeLocal(travaPorFase.get(fase)?.deadline),
        status: "",
      }))
    );
    setJogos(jogosResp.data || []);
    setResultados(proximosResultados);
    setCampeaoReal(configResp.data?.valor || "");
    if (configResp.error) {
      setCampeaoStatus("Rode supabase/config.sql antes de salvar o campeão real.");
    }
    setCarregando(false);
  }

  const selecoes = useMemo(() => {
    const nomes = new Set();
    for (const jogo of jogos) {
      if (jogo.fase !== "grupos") continue;
      nomes.add(jogo.time_casa);
      nomes.add(jogo.time_fora);
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [jogos]);

  function sair() {
    localStorage.removeItem("bolao_user");
    window.location.href = "/";
  }

  function atualizarResultado(jogoId, campo, valor) {
    setResultados((prev) => ({
      ...prev,
      [jogoId]: {
        ...prev[jogoId],
        [campo]: valor,
      },
    }));
    setStatusJogos((prev) => ({ ...prev, [jogoId]: "" }));
  }

  async function salvarResultado(jogo) {
    const linha = resultados[jogo.id];
    setStatusJogos((prev) => ({ ...prev, [jogo.id]: "Salvando..." }));

    const resposta = await fetch("/api/admin/resultado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participante_id: user.id,
        jogo_id: jogo.id,
        gols_casa: linha.gols_casa,
        gols_fora: linha.gols_fora,
        finalizado: linha.finalizado,
      }),
    });
    const json = await lerJson(resposta);

    setStatusJogos((prev) => ({
      ...prev,
      [jogo.id]: resposta.ok && json.ok ? "Resultado salvo" : json.erro || "Erro ao salvar",
    }));
  }

  function atualizarTrava(index, deadline) {
    setTravas((prev) =>
      prev.map((trava, travaIndex) =>
        travaIndex === index ? { ...trava, deadline, status: "" } : trava
      )
    );
  }

  async function salvarTrava(index) {
    const trava = travas[index];
    setTravas((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, status: "Salvando..." } : item
      )
    );

    const resposta = await fetch("/api/admin/trava", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participante_id: user.id,
        fase: trava.fase,
        deadline: trava.deadline,
      }),
    });
    const json = await lerJson(resposta);

    setTravas((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, status: resposta.ok && json.ok ? "Prazo salvo" : json.erro || "Erro" }
          : item
      )
    );
  }

  async function salvarCampeaoReal() {
    if (!campeaoReal) return;
    setCampeaoStatus("Salvando...");

    const resposta = await fetch("/api/admin/campeao-real", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participante_id: user.id, selecao: campeaoReal }),
    });
    const json = await lerJson(resposta);

    setCampeaoStatus(
      resposta.ok && json.ok ? "Campeão real salvo para o bônus de +10" : json.erro || "Erro ao salvar"
    );
  }

  async function atualizarAgora() {
    if (!user) return;

    setAtualizandoAgora(true);
    setAtualizacaoStatus("Atualizando...");

    const resposta = await fetch("/api/admin/atualizar-agora", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participante_id: user.id }),
    });
    const json = await lerJson(resposta);

    if (!resposta.ok || !json.ok) {
      setAtualizacaoStatus(json.erro || "Erro ao atualizar agora.");
      setAtualizandoAgora(false);
      return;
    }

    const fases = (json.fases_abertas || []).join(", ");
    setAtualizacaoStatus(
      `Atualização concluída: ${json.placares_atualizados || 0} placares, ${
        json.confrontos_novos || 0
      } confrontos${fases ? `, fases abertas: ${fases}` : ""}.`
    );
    await carregar();
    setAtualizandoAgora(false);
  }

  return (
    <div className="container">
      <div className="abas">
        <a className="aba" href="/">
          Ranking
        </a>
        <a className="aba" href="/palpites">
          Meus palpites
        </a>
        <a className="aba ativa" href="/admin">
          Admin
        </a>
        {user && (
          <button className="aba" style={{ marginLeft: "auto" }} onClick={sair}>
            Sair ({user.nome})
          </button>
        )}
      </div>

      {erro && <div className="aviso travado">{erro}</div>}
      {carregando && <div className="aviso">Carregando painel de admin...</div>}

      <div className="card">
        <h2 style={{ margin: "0 0 8px" }}>Atualização automática</h2>
        <div className="aviso">
          Busca placares e confrontos definidos na API pública agora, sem esperar o cron.
        </div>
        <button className="btn" onClick={atualizarAgora} disabled={atualizandoAgora}>
          {atualizandoAgora ? "Atualizando..." : "Atualizar agora"}
        </button>
        {atualizacaoStatus && <span className="salvo">{atualizacaoStatus}</span>}
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 8px" }}>Prazos das fases</h2>
        <div className="aviso">
          A API bloqueia palpites depois destes horários. Inputs usam horário de Brasília.
        </div>
        {travas.map((trava, index) => (
          <div className="admin-trava" key={trava.fase}>
            <strong>{FASE_LABEL[trava.fase]}</strong>
            <input
              type="datetime-local"
              value={trava.deadline}
              onChange={(event) => atualizarTrava(index, event.target.value)}
            />
            <button className="btn" onClick={() => salvarTrava(index)}>
              Salvar
            </button>
            <span className="salvo">{trava.status}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 8px" }}>Campeão real</h2>
        <div className="aviso">
          Este campo é manual e ativa o bônus de +10 no ranking quando a Copa terminar.
        </div>
        <div className="admin-campeao">
          <select value={campeaoReal} onChange={(event) => setCampeaoReal(event.target.value)}>
            <option value="">Escolha a seleção campeã</option>
            {selecoes.map((selecao) => (
              <option key={selecao} value={selecao}>
                {selecao}
              </option>
            ))}
          </select>
          <button className="btn" onClick={salvarCampeaoReal}>
            Salvar
          </button>
          <span className="salvo">{campeaoStatus}</span>
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 8px" }}>Resultados dos jogos</h2>
        <div className="aviso">
          A API automática preenche jogos finalizados. Use esta área para corrigir ou lançar
          manualmente quando necessário.
        </div>

        {jogos.map((jogo) => {
          const linha = resultados[jogo.id] || {
            gols_casa: "",
            gols_fora: "",
            finalizado: false,
          };

          return (
            <div className="admin-resultado" key={jogo.id}>
              <div className="jogo">
                <span className="casa">
                  {jogo.time_casa}
                  <small>{formatarData(jogo.data_hora)}</small>
                </span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={linha.gols_casa}
                  aria-label={`Gols de ${jogo.time_casa}`}
                  onChange={(event) => atualizarResultado(jogo.id, "gols_casa", event.target.value)}
                />
                <span className="x">x</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={linha.gols_fora}
                  aria-label={`Gols de ${jogo.time_fora}`}
                  onChange={(event) => atualizarResultado(jogo.id, "gols_fora", event.target.value)}
                />
                <span>
                  {jogo.time_fora}
                  <small>{FASE_LABEL[jogo.fase] || jogo.fase}</small>
                </span>
              </div>
              <div className="admin-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={linha.finalizado}
                    onChange={(event) =>
                      atualizarResultado(jogo.id, "finalizado", event.target.checked)
                    }
                  />{" "}
                  finalizado
                </label>
                <span className="rk-det">
                  {linha.finalizado ? "finalizado=true (API ou ajuste manual)" : "aguardando API"}
                </span>
                <button className="btn" onClick={() => salvarResultado(jogo)}>
                  Salvar
                </button>
                <span className="salvo">{statusJogos[jogo.id]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
