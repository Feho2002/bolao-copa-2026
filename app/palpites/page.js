"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";

const FASES = ["grupos", "r32", "oitavas", "quartas", "semis", "final"];
const GRUPOS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const FASE_LABEL = {
  grupos: "Fase de grupos",
  r32: "Round of 32",
  oitavas: "Oitavas de final",
  quartas: "Quartas de final",
  semis: "Semifinais",
  final: "Final e terceiro lugar",
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

function faseEstaTravada(deadline) {
  return deadline && new Date(deadline) <= new Date();
}

function numeroValido(valor) {
  if (valor === "") return false;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0;
}

export default function PalpitesPage() {
  const [user, setUser] = useState(null);
  const [jogos, setJogos] = useState([]);
  const [valores, setValores] = useState({});
  const [salvos, setSalvos] = useState({});
  const [avisos, setAvisos] = useState({});
  const [travadas, setTravadas] = useState({});
  const [campeao, setCampeao] = useState("");
  const [campeaoStatus, setCampeaoStatus] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const timers = useRef({});
  const valoresRef = useRef({});

  useEffect(() => {
    const salvo = localStorage.getItem("bolao_user");
    if (!salvo) {
      window.location.href = "/";
      return;
    }

    try {
      const participante = JSON.parse(salvo);
      setUser(participante);
      carregar(participante.id);
    } catch {
      localStorage.removeItem("bolao_user");
      window.location.href = "/";
    }

    return () => {
      Object.values(timers.current).forEach(window.clearTimeout);
    };
  }, []);

  async function carregar(participanteId) {
    setCarregando(true);
    setErro("");

    const [jogosResp, palpitesResp, campeaoResp, travasResp] = await Promise.all([
      supabaseBrowser
        .from("jogos")
        .select("id, fase, grupo, time_casa, time_fora, data_hora, finalizado")
        .order("data_hora", { ascending: true }),
      supabaseBrowser
        .from("palpites")
        .select("jogo_id, gols_casa, gols_fora")
        .eq("participante_id", participanteId),
      supabaseBrowser
        .from("palpite_campeao")
        .select("selecao")
        .eq("participante_id", participanteId)
        .maybeSingle(),
      supabaseBrowser.from("travas_fase").select("fase, deadline"),
    ]);

    if (jogosResp.error || palpitesResp.error) {
      setErro("Não foi possível carregar seus palpites.");
      setCarregando(false);
      return;
    }

    const iniciais = {};
    for (const palpite of palpitesResp.data || []) {
      iniciais[palpite.jogo_id] = {
        casa: String(palpite.gols_casa),
        fora: String(palpite.gols_fora),
      };
    }

    const proximasTravadas = {};
    const proximosAvisos = {};
    for (const trava of travasResp.data || []) {
      if (faseEstaTravada(trava.deadline)) {
        proximasTravadas[trava.fase] = true;
        proximosAvisos[trava.fase] =
          trava.fase === "campeao"
            ? "Palpite de campeão já encerrou."
            : "Palpites desta fase já encerraram.";
      }
    }

    valoresRef.current = iniciais;
    setValores(iniciais);
    setJogos(jogosResp.data || []);
    setCampeao(campeaoResp.data?.selecao || "");
    setTravadas(proximasTravadas);
    setAvisos(proximosAvisos);
    setCampeaoStatus(proximosAvisos.campeao || "");
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

  function atualizarValor(jogo, campo, valor) {
    const atual = valoresRef.current[jogo.id] || { casa: "", fora: "" };
    const proximo = { ...atual, [campo]: valor };
    const proximosValores = { ...valoresRef.current, [jogo.id]: proximo };

    valoresRef.current = proximosValores;
    setValores(proximosValores);
    setSalvos((prev) => ({ ...prev, [jogo.id]: "" }));
    agendarSalvamento(jogo, proximo);
  }

  function agendarSalvamento(jogo, palpite) {
    window.clearTimeout(timers.current[jogo.id]);

    if (!numeroValido(palpite.casa) || !numeroValido(palpite.fora) || travadas[jogo.fase]) {
      return;
    }

    timers.current[jogo.id] = window.setTimeout(() => salvarPalpite(jogo, palpite), 600);
  }

  async function salvarPalpite(jogo, palpite) {
    setSalvos((prev) => ({ ...prev, [jogo.id]: "Salvando..." }));

    const resposta = await fetch("/api/palpites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participante_id: user.id,
        jogo_id: jogo.id,
        gols_casa: Number(palpite.casa),
        gols_fora: Number(palpite.fora),
      }),
    });
    const json = await resposta.json();

    if (resposta.status === 403) {
      setTravadas((prev) => ({ ...prev, [jogo.fase]: true }));
      setAvisos((prev) => ({ ...prev, [jogo.fase]: json.erro || "Fase travada." }));
      setSalvos((prev) => ({ ...prev, [jogo.id]: "" }));
      return;
    }

    setSalvos((prev) => ({
      ...prev,
      [jogo.id]: resposta.ok && json.ok ? "Palpite salvo" : json.erro || "Erro ao salvar",
    }));
  }

  async function alterarCampeao(selecao) {
    setCampeao(selecao);
    if (!selecao || travadas.campeao) return;

    setCampeaoStatus("Salvando...");
    const resposta = await fetch("/api/campeao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participante_id: user.id, selecao }),
    });
    const json = await resposta.json();

    if (resposta.status === 403) {
      setTravadas((prev) => ({ ...prev, campeao: true }));
      setCampeaoStatus(json.erro || "Palpite de campeão já encerrou.");
      return;
    }

    setCampeaoStatus(resposta.ok && json.ok ? "Campeão salvo" : json.erro || "Erro ao salvar");
  }

  function renderJogo(jogo) {
    const palpite = valores[jogo.id] || { casa: "", fora: "" };
    const desabilitado = Boolean(travadas[jogo.fase]);

    return (
      <div key={jogo.id} className="palpite-linha">
        <div className="jogo">
          <span className="casa">
            {jogo.time_casa}
            <small>{formatarData(jogo.data_hora)}</small>
          </span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={palpite.casa}
            disabled={desabilitado}
            aria-label={`Gols de ${jogo.time_casa}`}
            onChange={(event) => atualizarValor(jogo, "casa", event.target.value)}
          />
          <span className="x">x</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={palpite.fora}
            disabled={desabilitado}
            aria-label={`Gols de ${jogo.time_fora}`}
            onChange={(event) => atualizarValor(jogo, "fora", event.target.value)}
          />
          <span>
            {jogo.time_fora}
            <small>{jogo.finalizado ? "apurado" : "a disputar"}</small>
          </span>
        </div>
        <div className="salvo">{salvos[jogo.id]}</div>
      </div>
    );
  }

  function jogosDaFase(fase) {
    return jogos.filter((jogo) => jogo.fase === fase);
  }

  return (
    <div className="container">
      <div className="abas">
        <a className="aba" href="/">
          Ranking
        </a>
        <a className="aba ativa" href="/palpites">
          Meus palpites
        </a>
        {user?.is_admin && (
          <a className="aba" href="/admin">
            Admin
          </a>
        )}
        {user && (
          <button className="aba" style={{ marginLeft: "auto" }} onClick={sair}>
            Sair ({user.nome})
          </button>
        )}
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 12px" }}>Campeão da Copa</h2>
        {campeaoStatus && (
          <div className={travadas.campeao ? "aviso travado" : "salvo"}>{campeaoStatus}</div>
        )}
        <select
          value={campeao}
          disabled={Boolean(travadas.campeao)}
          onChange={(event) => alterarCampeao(event.target.value)}
        >
          <option value="">Escolha uma seleção</option>
          {selecoes.map((selecao) => (
            <option key={selecao} value={selecao}>
              {selecao}
            </option>
          ))}
        </select>
      </div>

      {erro && <div className="aviso travado">{erro}</div>}
      {carregando && <div className="aviso">Carregando jogos e palpites...</div>}

      {FASES.map((fase) => {
        const jogosFase = jogosDaFase(fase);
        if (jogosFase.length === 0) return null;

        return (
          <div className="card" key={fase}>
            <h2 style={{ margin: "0 0 8px" }}>{FASE_LABEL[fase]}</h2>
            {avisos[fase] && <div className="aviso travado">{avisos[fase]}</div>}

            {fase === "grupos"
              ? GRUPOS.map((grupo) => {
                  const jogosGrupo = jogosFase.filter((jogo) => jogo.grupo === grupo);
                  if (jogosGrupo.length === 0) return null;

                  return (
                    <div key={grupo}>
                      <div className="grupo-hdr">Grupo {grupo}</div>
                      {jogosGrupo.map(renderJogo)}
                    </div>
                  );
                })
              : jogosFase.map(renderJogo)}
          </div>
        );
      })}
    </div>
  );
}
