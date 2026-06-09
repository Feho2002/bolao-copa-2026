// Define o campeão real usado no bônus de ranking. Apenas admins podem gravar.
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

export async function POST(request) {
  const { participante_id, selecao } = await request.json();
  const selecaoLimpa = String(selecao || "").trim();

  if (!selecaoLimpa) {
    return Response.json({ ok: false, erro: "selecao obrigatória" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!(await validarAdmin(db, participante_id))) {
    return Response.json({ ok: false, erro: "não autorizado" }, { status: 403 });
  }

  const { error } = await db
    .from("config")
    .upsert({ chave: "campeao_real", valor: selecaoLimpa }, { onConflict: "chave" });

  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
