// Salva/atualiza o palpite de campeão, respeitando a trava específica.
import { supabaseAdmin } from "../../../lib/supabase";

export async function POST(request) {
  const { participante_id, selecao } = await request.json();
  const selecaoLimpa = String(selecao || "").trim();

  if (!participante_id || !selecaoLimpa) {
    return Response.json({ ok: false, erro: "dados incompletos" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: trava } = await db
    .from("travas_fase")
    .select("deadline")
    .eq("fase", "campeao")
    .maybeSingle();

  if (trava && new Date(trava.deadline) <= new Date()) {
    return Response.json({ ok: false, erro: "Palpite de campeão já encerrou." }, { status: 403 });
  }

  const { error } = await db
    .from("palpite_campeao")
    .upsert({ participante_id, selecao: selecaoLimpa }, { onConflict: "participante_id" });

  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
