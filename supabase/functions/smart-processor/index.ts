import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LeadRef = {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  external?: {
    kommo_lead_id?: string | null;
    kommo_contact_id?: string | null;
  };
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    adset?: string | null;
    ad?: string | null;
  };
};

type IngestBody = {
  ping?: boolean;
  dedupe_key?: string;
  event_ts?: string;
  channel?: "kommo" | "vapi" | "calendar" | "paid";
  event_type?: string;
  actor?: "agent" | "human" | "system";
  agent_id?: string | null;
  lead_ref?: LeadRef;
  payload?: Record<string, unknown>;
};

function cors(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "content-type, x-ingest-key",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(status: number, obj: unknown, origin: string | null) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...cors(origin) },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeIso(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normStr(s?: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length ? t : null;
}

function normEmail(s?: string | null): string | null {
  const t = normStr(s);
  return t ? t.toLowerCase() : null;
}

function normPhone(s?: string | null): string | null {
  const t = normStr(s);
  return t ? t.replace(/\s+/g, "") : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json(405, { ok: false, error: "Use POST" }, origin);

    const ingestKey = req.headers.get("x-ingest-key")?.trim();
    if (!ingestKey) return json(401, { ok: false, error: "Missing x-ingest-key" }, origin);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json(400, { ok: false, error: "Content-Type must be application/json" }, origin);
    }

    let body: IngestBody = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" }, origin);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) {
      return json(
        500,
        { ok: false, error: "Missing env vars", missing: { SUPABASE_URL: !supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: !serviceRole } },
        origin
      );
    }

    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    // Resolve org via key hash
    const keyHash = await sha256Hex(ingestKey);
    const keyRes = await sb
      .from("ingest_keys_v2")
      .select("org_id,is_active")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyRes.error) return json(500, { ok: false, error: "Key lookup failed", details: keyRes.error.message }, origin);

    const keyRow = keyRes.data;
    if (!keyRow?.org_id || !keyRow.is_active) return json(401, { ok: false, error: "Invalid ingest key" }, origin);

    const org_id = keyRow.org_id as string;

    if (body.ping === true) return json(200, { ok: true, mode: "ping", org_id }, origin);

    // Required fields
    const dedupe_key = normStr(body.dedupe_key);
    if (!dedupe_key || !body.channel || !body.event_type) {
      return json(
        400,
        { ok: false, error: "Missing required fields: dedupe_key, channel, event_type", hint: "Use {\"ping\": true} to test only the key" },
        origin
      );
    }

    // Lead identity
    const leadRef = body.lead_ref || {};
    const phone = normPhone(leadRef.phone);
    const email = normEmail(leadRef.email);
    const kommo_lead_id = normStr(leadRef.external?.kommo_lead_id);
    const kommo_contact_id = normStr(leadRef.external?.kommo_contact_id);

    const hasIdentity = !!(kommo_lead_id || kommo_contact_id || phone || email);

    let lead_id: string | null = null;

    if (hasIdentity) {
      // Find existing by priority
      if (kommo_lead_id) {
        const r = await sb.from("leads_v2").select("id,kommo_contact_id,email,phone_e164").eq("org_id", org_id).eq("kommo_lead_id", kommo_lead_id).maybeSingle();
        if (r.data?.id) lead_id = r.data.id;
      }

      if (!lead_id && kommo_contact_id) {
        const r = await sb.from("leads_v2").select("id,kommo_lead_id,email,phone_e164").eq("org_id", org_id).eq("kommo_contact_id", kommo_contact_id).maybeSingle();
        if (r.data?.id) lead_id = r.data.id;
      }

      if (!lead_id && phone) {
        const r = await sb.from("leads_v2").select("id,kommo_lead_id,kommo_contact_id,email").eq("org_id", org_id).eq("phone_e164", phone).maybeSingle();
        if (r.data?.id) lead_id = r.data.id;
      }

      if (!lead_id && email) {
        const r = await sb.from("leads_v2").select("id,kommo_lead_id,kommo_contact_id,phone_e164").eq("org_id", org_id).eq("email", email).maybeSingle();
        if (r.data?.id) lead_id = r.data.id;
      }

      // Create if not found
      if (!lead_id) {
        const utm = leadRef.utm || {};
        const ins = await sb
          .from("leads_v2")
          .insert({
            org_id,
            name: normStr(leadRef.name),
            email,
            phone_raw: phone,
            phone_e164: phone,
            kommo_lead_id,
            kommo_contact_id,
            utm_source: normStr(utm.source),
            utm_medium: normStr(utm.medium),
            utm_campaign: normStr(utm.campaign),
            utm_adset: normStr(utm.adset),
            utm_ad: normStr(utm.ad),
          })
          .select("id")
          .maybeSingle();

        if (ins.error) {
          // Conflict recovery
          if (kommo_lead_id) {
            const r = await sb.from("leads_v2").select("id").eq("org_id", org_id).eq("kommo_lead_id", kommo_lead_id).maybeSingle();
            if (r.data?.id) lead_id = r.data.id;
          }
          if (!lead_id && kommo_contact_id) {
            const r = await sb.from("leads_v2").select("id").eq("org_id", org_id).eq("kommo_contact_id", kommo_contact_id).maybeSingle();
            if (r.data?.id) lead_id = r.data.id;
          }
          if (!lead_id && phone) {
            const r = await sb.from("leads_v2").select("id").eq("org_id", org_id).eq("phone_e164", phone).maybeSingle();
            if (r.data?.id) lead_id = r.data.id;
          }
          if (!lead_id && email) {
            const r = await sb.from("leads_v2").select("id").eq("org_id", org_id).eq("email", email).maybeSingle();
            if (r.data?.id) lead_id = r.data.id;
          }
          if (!lead_id) return json(500, { ok: false, error: "Lead insert failed", details: ins.error.message }, origin);
        } else {
          lead_id = ins.data?.id ?? null;
        }
      } else {
        // Enrich existing lead
        const utm = leadRef.utm || {};
        await sb
          .from("leads_v2")
          .update({
            name: normStr(leadRef.name) ?? undefined,
            email: email ?? undefined,
            phone_e164: phone ?? undefined,
            phone_raw: phone ?? undefined,
            kommo_lead_id: kommo_lead_id ?? undefined,
            kommo_contact_id: kommo_contact_id ?? undefined,
            utm_source: normStr(utm.source) ?? undefined,
            utm_medium: normStr(utm.medium) ?? undefined,
            utm_campaign: normStr(utm.campaign) ?? undefined,
            utm_adset: normStr(utm.adset) ?? undefined,
            utm_ad: normStr(utm.ad) ?? undefined,
          })
          .eq("org_id", org_id)
          .eq("id", lead_id);
      }
    }

    // Event timestamp
    const event_ts = safeIso(body.event_ts) || new Date().toISOString();

    // Idempotency check
    const existing = await sb
      .from("events_v2")
      .select("id, lead_id")
      .eq("org_id", org_id)
      .eq("dedupe_key", dedupe_key)
      .maybeSingle();

    if (existing.error) {
      return json(500, { ok: false, error: "Event lookup failed", details: existing.error.message }, origin);
    }

    const finalLeadId = (existing.data?.lead_id as string | null) ?? lead_id;

    if (existing.data?.id) {
      const upd = await sb
        .from("events_v2")
        .update({
          lead_id: finalLeadId,
          channel: body.channel,
          event_type: body.event_type,
          event_ts,
          actor: body.actor ?? "system",
          agent_id: body.agent_id ?? null,
          payload: body.payload ?? {},
        })
        .eq("org_id", org_id)
        .eq("id", existing.data.id);

      if (upd.error) return json(500, { ok: false, error: "Event update failed", details: upd.error.message }, origin);

      return json(200, { ok: true, mode: "updated", org_id, lead_id: finalLeadId }, origin);
    }

    // Insert new event
    const insEv = await sb.from("events_v2").insert({
      org_id,
      lead_id: finalLeadId,
      channel: body.channel,
      event_type: body.event_type,
      event_ts,
      actor: body.actor ?? "system",
      agent_id: body.agent_id ?? null,
      dedupe_key,
      payload: body.payload ?? {},
    });

    if (insEv.error) {
      const msg = String(insEv.error.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return json(200, { ok: true, mode: "deduped", org_id, lead_id: finalLeadId }, origin);
      }
      return json(500, { ok: false, error: "Event insert failed", details: insEv.error.message }, origin);
    }

    return json(200, { ok: true, mode: "inserted", org_id, lead_id: finalLeadId }, origin);
  } catch (e) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };
    return json(500, { ok: false, error: "Unhandled exception", ...err }, origin);
  }
});
