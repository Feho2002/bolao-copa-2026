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

async function lerJson(resposta) {
  try {
    return await resposta.json();
  } catch {
    return {};
  }
}

export async function POST(request) {
  const { participante_id } = await request.json();
  const db = supabaseAdmin();

  if (!(await validarAdmin(db, participante_id))) {
    return Response.json({ ok: false, erro: "nao autorizado" }, { status: 403 });
  }

  const token = process.env.CRON_SECRET;
  if (!token) {
    return Response.json({ ok: false, erro: "CRON_SECRET nao configurado" }, { status: 500 });
  }

  const url = new URL("/api/atualizar-resultados", request.url);

  const resposta = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await lerJson(resposta);

  return Response.json(json, { status: resposta.status });
}
