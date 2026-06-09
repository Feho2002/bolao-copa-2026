import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUILD_URL = "https://example.supabase.co";
const BUILD_KEY = "build-placeholder";

export const supabaseBrowser = createClient(URL || BUILD_URL, ANON || BUILD_KEY);

export function supabaseAdmin() {
  if (!URL || !SERVICE) {
    throw new Error(
      "Supabase nao configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });
}
