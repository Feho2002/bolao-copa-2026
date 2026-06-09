import { describe, expect, it } from "vitest";
import { BONUS_CAMPEAO, calcularRanking, pontosDoJogo } from "./pontuacao";

describe("pontosDoJogo", () => {
  it("pontua placar exato com peso da fase", () => {
    expect(
      pontosDoJogo(
        { gols_casa: 2, gols_fora: 1 },
        { fase: "quartas", finalizado: true, gols_casa: 2, gols_fora: 1 }
      )
    ).toBe(12);
  });

  it("pontua apenas o resultado correto com peso da fase", () => {
    expect(
      pontosDoJogo(
        { gols_casa: 3, gols_fora: 1 },
        { fase: "r32", finalizado: true, gols_casa: 1, gols_fora: 0 }
      )
    ).toBe(2);
  });

  it("retorna zero quando o resultado do palpite esta errado", () => {
    expect(
      pontosDoJogo(
        { gols_casa: 0, gols_fora: 1 },
        { fase: "grupos", finalizado: true, gols_casa: 2, gols_fora: 0 }
      )
    ).toBe(0);
  });

  it("retorna zero para jogo ainda nao finalizado", () => {
    expect(
      pontosDoJogo(
        { gols_casa: 2, gols_fora: 1 },
        { fase: "final", finalizado: false, gols_casa: 2, gols_fora: 1 }
      )
    ).toBe(0);
  });
});

describe("calcularRanking", () => {
  it("aplica o bonus de campeao", () => {
    const ranking = calcularRanking({
      participantes: [
        { id: "p1", nome: "Ana" },
        { id: "p2", nome: "Bruno" },
      ],
      jogos: [],
      palpites: [],
      campeoes: [
        { participante_id: "p1", selecao: "Brazil" },
        { participante_id: "p2", selecao: "France" },
      ],
      campeaoReal: "Brazil",
    });

    expect(ranking[0]).toMatchObject({ id: "p1", pontos: BONUS_CAMPEAO });
    expect(ranking[1]).toMatchObject({ id: "p2", pontos: 0 });
  });

  it("ordena por pontos, exatos, acertos de resultado e nome", () => {
    const participantes = [
      { id: "ana", nome: "Ana" },
      { id: "davi", nome: "Davi" },
      { id: "eva", nome: "Eva" },
      { id: "carlos", nome: "Carlos" },
      { id: "bruno", nome: "Bruno" },
      { id: "bia", nome: "Bia" },
      { id: "zeca", nome: "Zeca" },
    ];
    const jogos = [
      { id: 1, fase: "grupos", finalizado: true, gols_casa: 2, gols_fora: 0 },
      { id: 2, fase: "r32", finalizado: true, gols_casa: 1, gols_fora: 0 },
      { id: 3, fase: "grupos", finalizado: true, gols_casa: 0, gols_fora: 0 },
      { id: 4, fase: "grupos", finalizado: true, gols_casa: 3, gols_fora: 1 },
    ];
    const palpites = [
      { participante_id: "ana", jogo_id: 1, gols_casa: 2, gols_fora: 0 },
      { participante_id: "ana", jogo_id: 3, gols_casa: 1, gols_fora: 1 },
      { participante_id: "ana", jogo_id: 4, gols_casa: 1, gols_fora: 0 },
      { participante_id: "davi", jogo_id: 1, gols_casa: 2, gols_fora: 0 },
      { participante_id: "davi", jogo_id: 2, gols_casa: 2, gols_fora: 1 },
      { participante_id: "eva", jogo_id: 1, gols_casa: 2, gols_fora: 0 },
      { participante_id: "eva", jogo_id: 2, gols_casa: 3, gols_fora: 1 },
      { participante_id: "carlos", jogo_id: 1, gols_casa: 2, gols_fora: 0 },
      { participante_id: "bruno", jogo_id: 1, gols_casa: 1, gols_fora: 0 },
      { participante_id: "bruno", jogo_id: 3, gols_casa: 1, gols_fora: 1 },
      { participante_id: "bruno", jogo_id: 4, gols_casa: 2, gols_fora: 1 },
    ];

    expect(
      calcularRanking({ participantes, jogos, palpites }).map((linha) => linha.nome)
    ).toEqual(["Ana", "Davi", "Eva", "Carlos", "Bruno", "Bia", "Zeca"]);
  });
});
