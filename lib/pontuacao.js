// ============================================================
// BOLÃO FRAM · COPA 2026 — Lógica de pontuação (o coração do sistema)
// ============================================================
// Regras:
//   - Placar EXATO          -> 3 pontos (base)
//   - Só o RESULTADO certo  -> 1 ponto  (base) (quem ganhou, ou empate)
//   - Errou                 -> 0
//   - Campeão certo         -> +10 (uma vez, no fim)
//
// Peso por fase (multiplica a pontuação base do jogo):
//   grupos x1, r32 x2, oitavas x3, quartas x4, semis x5, final x6
//   (Ex.: cravar o placar da final = 3 * 6 = 18 pontos.)
// ============================================================

export const PESO_FASE = {
  grupos: 1,
  r32: 2,
  oitavas: 3,
  quartas: 4,
  semis: 5,
  final: 6,
};

export const PONTOS_PLACAR_EXATO = 3;
export const PONTOS_RESULTADO = 1;
export const BONUS_CAMPEAO = 10;

// sinal do resultado: 1 = casa vence, 0 = empate, -1 = fora vence
function resultado(golsCasa, golsFora) {
  if (golsCasa > golsFora) return 1;
  if (golsCasa < golsFora) return -1;
  return 0;
}

// Pontos de UM palpite contra UM resultado real, já aplicando o peso da fase.
// Retorna 0 se o jogo ainda não finalizou.
export function pontosDoJogo(palpite, jogo) {
  if (!jogo.finalizado || jogo.gols_casa == null || jogo.gols_fora == null) return 0;
  if (!palpite || palpite.gols_casa == null || palpite.gols_fora == null) return 0;

  const peso = PESO_FASE[jogo.fase] ?? 1;

  // Placar exato
  if (palpite.gols_casa === jogo.gols_casa && palpite.gols_fora === jogo.gols_fora) {
    return PONTOS_PLACAR_EXATO * peso;
  }
  // Só o resultado (quem venceu / empate)
  if (resultado(palpite.gols_casa, palpite.gols_fora) === resultado(jogo.gols_casa, jogo.gols_fora)) {
    return PONTOS_RESULTADO * peso;
  }
  return 0;
}

// Calcula o ranking completo.
// participantes: [{id, nome, is_admin}]
// jogos:        [{id, fase, finalizado, gols_casa, gols_fora}]
// palpites:     [{participante_id, jogo_id, gols_casa, gols_fora}]
// campeoes:     [{participante_id, selecao}]
// campeaoReal:  string | null  (definido quando a final acabar; admin marca)
//
// Retorna lista ordenada: [{id, nome, pontos, exatos, acertos_resultado}]
// Desempate: mais placares exatos -> mais acertos de resultado -> nome (alfabético).
export function calcularRanking({ participantes, jogos, palpites, campeoes = [], campeaoReal = null }) {
  const jogoPorId = new Map(jogos.map((j) => [j.id, j]));
  const palpitePorChave = new Map(palpites.map((p) => [`${p.participante_id}:${p.jogo_id}`, p]));
  const campeaoPorPart = new Map(campeoes.map((c) => [c.participante_id, c.selecao]));

  const linhas = participantes.map((part) => {
    let pontos = 0;
    let exatos = 0;
    let acertosResultado = 0;

    for (const jogo of jogos) {
      if (!jogo.finalizado) continue;
      const palpite = palpitePorChave.get(`${part.id}:${jogo.id}`);
      const pts = pontosDoJogo(palpite, jogo);
      pontos += pts;
      if (pts > 0) {
        const exato =
          palpite.gols_casa === jogo.gols_casa && palpite.gols_fora === jogo.gols_fora;
        if (exato) exatos += 1;
        else acertosResultado += 1;
      }
    }

    // Bônus campeão
    if (campeaoReal && campeaoPorPart.get(part.id) === campeaoReal) {
      pontos += BONUS_CAMPEAO;
    }

    return { id: part.id, nome: part.nome, pontos, exatos, acertos_resultado: acertosResultado };
  });

  linhas.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.exatos !== a.exatos) return b.exatos - a.exatos;
    if (b.acertos_resultado !== a.acertos_resultado) return b.acertos_resultado - a.acertos_resultado;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return linhas;
}
