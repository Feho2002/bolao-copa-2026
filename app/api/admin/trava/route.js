// Atualiza o deadline de uma fase. Apenas admins confirmados no banco podem gravar.
import { supabaseAdmin } from "../../../../lib/supabase";

const FASES = new Set(["grupos", "campeao", "r32", "oitavas", "quartas", "semis", "final"]);

async function validarAdmin(db, participanteId) {
  if (!participanteId) return false;

  const { data } = await db
    .from("participantes")
    .select("is_admin")
    .eq("id", participanteId)
    .maybeSingle();

  return Boolean(data?.is_admin);
}

function normalizarDeadline(deadline) {
  const valor = String(deadline || "").trim();
  if (!valor) return null;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) {
    return `${valor}:00-03`;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(valor)) {
    return `${valor}:00-03`;
  }

  return valor;
}

export async function POST(request) {
  const { participante_id, fase, deadline } = await request.json();
  const faseLimpa = String(fase || "").trim();
  const deadlineNormalizado = normalizarDeadline(deadline);

  if (!FASES.has(faseLimpa) || !deadlineNormalizado || Number.isNaN(Date.parse(deadlineNormalizado))) {
    return Response.json({ ok: false, erro: "fase ou deadline inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!(await validarAdmin(db, participante_id))) {
    return Response.json({ ok: false, erro: "não autorizado" }, { status: 403 });
  }

  const { error } = await db
    .from("travas_fase")
    .upsert({ fase: faseLimpa, deadline: deadlineNormalizado }, { onConflict: "fase" });

  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
