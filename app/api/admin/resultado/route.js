// Atualiza resultado manualmente. Apenas admins confirmados no banco podem gravar.
import { supabaseAdmin } from "../../../../lib/supabase";

async function validarAdmin(db, participanteId) {
  if (!participanteId) return false;

  const { data } = await db
    .from("participantes")
    .select("is_admin")
    .eq("id", participanteId)
    .maybeSingle();

  return Boolean(data?.is_admin);
}

function normalizarGol(valor) {
  if (valor === "" || valor == null) return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) return undefined;
  return numero;
}

export async function POST(request) {
  const { participante_id, jogo_id, gols_casa, gols_fora, finalizado } = await request.json();

  if (!jogo_id) {
    return Response.json({ ok: false, erro: "jogo_id obrigatório" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!(await validarAdmin(db, participante_id))) {
    return Response.json({ ok: false, erro: "não autorizado" }, { status: 403 });
  }

  const golsCasa = normalizarGol(gols_casa);
  const golsFora = normalizarGol(gols_fora);
  if (golsCasa === undefined || golsFora === undefined) {
    return Response.json({ ok: false, erro: "placar inválido" }, { status: 400 });
  }

  const jogoFinalizado = Boolean(finalizado);
  if (jogoFinalizado && (golsCasa == null || golsFora == null)) {
    return Response.json({ ok: false, erro: "informe o placar final" }, { status: 400 });
  }

  const { error } = await db
    .from("jogos")
    .update({ gols_casa: golsCasa, gols_fora: golsFora, finalizado: jogoFinalizado })
    .eq("id", jogo_id);

  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
