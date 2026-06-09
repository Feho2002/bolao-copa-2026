// Salva/atualiza um palpite, respeitando a trava da fase.
import { supabaseAdmin } from "../../../lib/supabase";

export async function POST(request) {
  const { participante_id, jogo_id, gols_casa, gols_fora } = await request.json();
  if (participante_id == null || jogo_id == null || gols_casa == null || gols_fora == null) {
    return Response.json({ ok: false, erro: "dados incompletos" }, { status: 400 });
  }
  const db = supabaseAdmin();

  // descobre a fase do jogo e checa a trava
  const { data: jogo } = await db.from("jogos").select("fase").eq("id", jogo_id).single();
  if (!jogo) return Response.json({ ok: false, erro: "jogo inexistente" }, { status: 404 });

  const { data: trava } = await db.from("travas_fase").select("deadline").eq("fase", jogo.fase).maybeSingle();
  if (trava && new Date(trava.deadline) <= new Date()) {
    return Response.json({ ok: false, erro: "Palpites desta fase já encerraram." }, { status: 403 });
  }

  const { error } = await db.from("palpites").upsert(
    { participante_id, jogo_id, gols_casa, gols_fora, atualizado_em: new Date().toISOString() },
    { onConflict: "participante_id,jogo_id" }
  );
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
