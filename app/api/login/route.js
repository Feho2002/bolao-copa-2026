import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../../../lib/supabase";

function hash(senha, salt) {
  return scryptSync(senha, salt, 32).toString("hex");
}

function erroSupabase(prefixo, error) {
  return {
    ok: false,
    erro: `${prefixo}: ${error.message}`,
    codigo: error.code || null,
    detalhe: error.details || null,
  };
}

export async function POST(request) {
  const { nome, senha } = await request.json();

  if (!nome || !senha) {
    return Response.json({ ok: false, erro: "Informe nome e senha." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const nomeLimpo = nome.trim();

  const { data: existente, error: buscaError } = await db
    .from("participantes")
    .select("id, nome, senha_hash, is_admin")
    .eq("nome", nomeLimpo)
    .maybeSingle();

  if (buscaError) {
    return Response.json(erroSupabase("Erro ao buscar participante", buscaError), { status: 500 });
  }

  if (existente) {
    const [salt, h] = existente.senha_hash.split(":");
    const tentativa = hash(senha, salt);
    const ok = timingSafeEqual(Buffer.from(tentativa, "hex"), Buffer.from(h, "hex"));

    if (!ok) return Response.json({ ok: false, erro: "Senha incorreta." }, { status: 401 });

    return Response.json({
      ok: true,
      participante: {
        id: existente.id,
        nome: existente.nome,
        is_admin: existente.is_admin,
      },
    });
  }

  const salt = randomBytes(8).toString("hex");
  const senha_hash = `${salt}:${hash(senha, salt)}`;
  const { data: novo, error } = await db
    .from("participantes")
    .insert({ nome: nomeLimpo, senha_hash })
    .select("id, nome, is_admin")
    .single();

  if (error) {
    return Response.json(erroSupabase("Nao foi possivel criar participante", error), {
      status: 500,
    });
  }

  return Response.json({ ok: true, participante: novo, novo: true });
}
