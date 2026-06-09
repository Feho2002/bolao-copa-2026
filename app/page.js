"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";
import { calcularRanking } from "../lib/pontuacao";

export default function Home() {
  const [user, setUser] = useState(null);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [totalJogos, setTotalJogos] = useState(0);
  const [feitos, setFeitos] = useState(0);

  useEffect(() => {
    const salvo = typeof window !== "undefined" && localStorage.getItem("bolao_user");
    if (salvo) setUser(JSON.parse(salvo));
  }, []);

  async function carregarRanking() {
    const [
      { data: participantes },
      { data: jogos },
      { data: palpites },
      { data: campeoes },
      { data: campeaoConfig },
    ] = await Promise.all([
      supabaseBrowser.from("participantes").select("id, nome, is_admin"),
      supabaseBrowser.from("jogos").select("id, fase, finalizado, gols_casa, gols_fora"),
      supabaseBrowser.from("palpites").select("participante_id, jogo_id, gols_casa, gols_fora"),
      supabaseBrowser.from("palpite_campeao").select("participante_id, selecao"),
      supabaseBrowser.from("config").select("valor").eq("chave", "campeao_real").maybeSingle(),
    ]);

    const campeaoReal = campeaoConfig?.valor || null;
    const rk = calcularRanking({
      participantes: participantes || [],
      jogos: jogos || [],
      palpites: palpites || [],
      campeoes: campeoes || [],
      campeaoReal,
    });

    setRanking(rk);
    setTotalJogos((jogos || []).length);
    setFeitos((jogos || []).filter((j) => j.finalizado).length);
  }

  useEffect(() => {
    carregarRanking();
    const canal = supabaseBrowser
      .channel("mudancas")
      .on("postgres_changes", { event: "*", schema: "public", table: "jogos" }, carregarRanking)
      .on("postgres_changes", { event: "*", schema: "public", table: "palpites" }, carregarRanking)
      .on("postgres_changes", { event: "*", schema: "public", table: "palpite_campeao" }, carregarRanking)
      .on("postgres_changes", { event: "*", schema: "public", table: "config" }, carregarRanking)
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(canal);
    };
  }, []);

  async function entrar() {
    setErro("");
    setCarregando(true);

    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, senha }),
      });
      const j = await r.json();

      if (!j.ok) {
        setErro(j.erro || "Erro ao entrar.");
        return;
      }

      localStorage.setItem("bolao_user", JSON.stringify(j.participante));
      setUser(j.participante);
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  function sair() {
    localStorage.removeItem("bolao_user");
    setUser(null);
  }

  const medalha = (i) => (i === 0 ? "ouro" : i === 1 ? "prata" : i === 2 ? "bronze" : "");

  return (
    <div className="container">
      <div className="abas">
        <a className="aba ativa" href="/">
          Ranking
        </a>
        <a className="aba" href="/palpites">
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

      {!user && (
        <div className="card" style={{ maxWidth: 380 }}>
          <h2 style={{ margin: "0 0 4px" }}>Entrar no bolão</h2>
          <p className="rk-det" style={{ marginBottom: 14 }}>
            Primeiro acesso? Escolha seu nome e uma senha; sua conta é criada na hora.
          </p>
          <input
            type="text"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={{ width: "100%", marginBottom: 14 }}
          />
          {erro && <p style={{ color: "var(--erro)", fontSize: 13, marginTop: 0 }}>{erro}</p>}
          <button className="btn" style={{ width: "100%" }} onClick={entrar} disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Classificação</h2>
          <span className="rk-det">
            {feitos} de {totalJogos} jogos apurados
          </span>
        </div>
        {ranking.length === 0 && (
          <p className="rk-det">
            Ninguém pontuou ainda. Assim que os jogos começarem, o ranking aparece aqui.
          </p>
        )}
        {ranking.map((r, i) => (
          <div className="rk-linha" key={r.id}>
            <span className={`rk-pos ${medalha(i)}`}>{i + 1}</span>
            <span>
              <span className="rk-nome">
                {r.nome}
                {user && r.id === user.id ? " (você)" : ""}
              </span>
              <br />
              <span className="rk-det">
                {r.exatos} placares cravados · {r.acertos_resultado} resultados
              </span>
            </span>
            <span className="rk-pts placar-num">{r.pontos}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
