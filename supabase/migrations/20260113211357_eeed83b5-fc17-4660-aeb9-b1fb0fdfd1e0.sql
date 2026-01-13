-- ============================================================
-- VIEWS PARA DASHBOARD AFONSINA - VAPI, AGENTE, MEETINGS, FUNIL
-- ============================================================

-- ==================== VAPI VIEWS ====================

-- View: Ligações por assistente por dia
CREATE OR REPLACE VIEW public.vw_vapi_calls_by_assistant_daily_v3 AS
SELECT 
  org_id,
  call_date as day,
  'default' as assistant_id,
  'Agente Principal' as assistant_name,
  SUM(calls_total) as calls_total,
  SUM(calls_answered) as calls_answered,
  SUM(calls_missed) as calls_missed,
  AVG(avg_duration_seconds) as avg_duration_seconds
FROM vapi_calls
WHERE call_date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY org_id, call_date
ORDER BY call_date DESC;

-- View: Ligações por hora
CREATE OR REPLACE VIEW public.vw_vapi_calls_hourly_v3 AS
SELECT 
  org_id,
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as calls_total
FROM vapi_calls
WHERE call_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY org_id, EXTRACT(HOUR FROM created_at)
ORDER BY hour;

-- View: Reuniões originadas de ligações (placeholder)
CREATE OR REPLACE VIEW public.vw_vapi_calls_meetings_daily_v3 AS
SELECT 
  org_id,
  call_date as day,
  0 as meetings_from_calls
FROM vapi_calls
WHERE call_date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY org_id, call_date;

-- ==================== DASHBOARD KPIS ====================

-- View: KPIs executivos 30d
CREATE OR REPLACE VIEW public.vw_dashboard_kpis_30d_v3 AS
SELECT 
  v.org_id,
  COALESCE(SUM(v.calls_total), 0) as ligacoes_total,
  COALESCE(AVG(v.calls_total), 0) as ligacoes_media_dia,
  COUNT(DISTINCT v.call_date) as dias_ativos,
  COALESCE(SUM(v.total_duration_seconds), 0) / 60 as minutos_totais,
  COALESCE((SELECT COUNT(*) FROM leads_v2 l WHERE l.org_id = v.org_id AND l.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as leads_total,
  0 as mensagens_recebidas,
  0 as reunioes_marcadas
FROM vapi_calls v
WHERE v.call_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY v.org_id;

-- View: KPIs executivos 7d
CREATE OR REPLACE VIEW public.vw_dashboard_kpis_7d_v3 AS
SELECT 
  v.org_id,
  COALESCE(SUM(v.calls_total), 0) as ligacoes_total,
  COALESCE(AVG(v.calls_total), 0) as ligacoes_media_dia,
  COUNT(DISTINCT v.call_date) as dias_ativos,
  COALESCE(SUM(v.total_duration_seconds), 0) / 60 as minutos_totais,
  COALESCE((SELECT COUNT(*) FROM leads_v2 l WHERE l.org_id = v.org_id AND l.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as leads_total,
  0 as mensagens_recebidas,
  0 as reunioes_marcadas
FROM vapi_calls v
WHERE v.call_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY v.org_id;

-- View: Dados diários 60d
CREATE OR REPLACE VIEW public.vw_dashboard_daily_60d_v3 AS
SELECT 
  org_id,
  call_date as day,
  calls_total as ligacoes,
  calls_answered as ligacoes_atendidas,
  calls_missed as ligacoes_perdidas,
  total_duration_seconds / 60 as minutos
FROM vapi_calls
WHERE call_date >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY call_date DESC;

-- ==================== FUNIL ====================

-- View: Funil atual (executivo)
CREATE OR REPLACE VIEW public.vw_funnel_current_exec_v4 AS
SELECT 
  e.org_id,
  e.event_type as stage_key,
  CASE 
    WHEN e.event_type = 'lead_created' THEN 'Lead Criado'
    WHEN e.event_type = 'first_contact' THEN 'Primeiro Contato'
    WHEN e.event_type = 'qualified' THEN 'Qualificado'
    WHEN e.event_type = 'meeting_scheduled' THEN 'Reunião Agendada'
    WHEN e.event_type = 'proposal_sent' THEN 'Proposta Enviada'
    WHEN e.event_type = 'closed_won' THEN 'Fechado Ganho'
    WHEN e.event_type = 'closed_lost' THEN 'Fechado Perdido'
    ELSE INITCAP(REPLACE(e.event_type, '_', ' '))
  END as stage_name,
  CASE 
    WHEN e.event_type = 'lead_created' THEN 1
    WHEN e.event_type = 'first_contact' THEN 2
    WHEN e.event_type = 'qualified' THEN 3
    WHEN e.event_type = 'meeting_scheduled' THEN 4
    WHEN e.event_type = 'proposal_sent' THEN 5
    WHEN e.event_type = 'closed_won' THEN 6
    WHEN e.event_type = 'closed_lost' THEN 7
    ELSE 99
  END as stage_order,
  COUNT(DISTINCT e.lead_id) as leads
FROM events_v2 e
WHERE e.event_ts >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY e.org_id, e.event_type
ORDER BY stage_order;

-- View: Funil diário 30d
CREATE OR REPLACE VIEW public.vw_funnel_daily_30d_v3 AS
SELECT 
  org_id,
  DATE(event_ts) as day,
  event_type as stage_key,
  COUNT(DISTINCT lead_id) as leads
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY org_id, DATE(event_ts), event_type
ORDER BY day DESC;

-- ==================== AGENTE / KOMMO ====================

-- View: KPIs do agente 30d
CREATE OR REPLACE VIEW public.vw_agente_kpis_30d AS
SELECT 
  org_id,
  COUNT(*) as eventos_total,
  COUNT(DISTINCT lead_id) as leads_tocados,
  COUNT(DISTINCT DATE(event_ts)) as dias_ativos
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '30 days'
  AND channel = 'kommo'
GROUP BY org_id;

-- View: KPIs do agente 7d
CREATE OR REPLACE VIEW public.vw_agente_kpis_7d AS
SELECT 
  org_id,
  COUNT(*) as eventos_total,
  COUNT(DISTINCT lead_id) as leads_tocados,
  COUNT(DISTINCT DATE(event_ts)) as dias_ativos
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '7 days'
  AND channel = 'kommo'
GROUP BY org_id;

-- View: Mensagens recebidas por dia
CREATE OR REPLACE VIEW public.vw_kommo_msg_in_daily_60d_v3 AS
SELECT 
  org_id,
  DATE(event_ts) as day,
  COUNT(*) as msg_in_total
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '60 days'
  AND event_type = 'message_received'
GROUP BY org_id, DATE(event_ts)
ORDER BY day DESC;

-- View: Mensagens por hora (7d)
CREATE OR REPLACE VIEW public.vw_kommo_msg_in_by_hour_7d_v3 AS
SELECT 
  org_id,
  EXTRACT(HOUR FROM event_ts) as hour,
  COUNT(*) as msg_in_total
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '7 days'
  AND event_type = 'message_received'
GROUP BY org_id, EXTRACT(HOUR FROM event_ts)
ORDER BY hour;

-- View: Heatmap de mensagens (30d)
CREATE OR REPLACE VIEW public.vw_kommo_msg_in_heatmap_30d_v3 AS
SELECT 
  org_id,
  EXTRACT(HOUR FROM event_ts) as hour,
  EXTRACT(DOW FROM event_ts) as dow,
  COUNT(*) as msg_in_total
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '30 days'
  AND event_type = 'message_received'
GROUP BY org_id, EXTRACT(HOUR FROM event_ts), EXTRACT(DOW FROM event_ts);

-- ==================== MEETINGS ====================

-- View: KPIs de reuniões 30d
CREATE OR REPLACE VIEW public.vw_meetings_kpis_30d_v3 AS
SELECT 
  org_id,
  COUNT(*) FILTER (WHERE event_type = 'meeting_scheduled') as meetings_booked,
  COUNT(*) FILTER (WHERE event_type = 'meeting_completed') as meetings_completed,
  COUNT(*) FILTER (WHERE event_type = 'meeting_cancelled') as meetings_cancelled
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY org_id;

-- View: KPIs de reuniões 7d
CREATE OR REPLACE VIEW public.vw_meetings_kpis_7d_v3 AS
SELECT 
  org_id,
  COUNT(*) FILTER (WHERE event_type = 'meeting_scheduled') as meetings_booked,
  COUNT(*) FILTER (WHERE event_type = 'meeting_completed') as meetings_completed,
  COUNT(*) FILTER (WHERE event_type = 'meeting_cancelled') as meetings_cancelled
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY org_id;

-- View: Reuniões diárias 60d
CREATE OR REPLACE VIEW public.vw_meetings_daily_60d_v3 AS
SELECT 
  org_id,
  DATE(event_ts) as day,
  COUNT(*) FILTER (WHERE event_type = 'meeting_scheduled') as meetings_booked,
  COUNT(*) FILTER (WHERE event_type = 'meeting_completed') as meetings_completed
FROM events_v2
WHERE event_ts >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY org_id, DATE(event_ts)
ORDER BY day DESC;

-- View: Próximas reuniões (placeholder usando events)
CREATE OR REPLACE VIEW public.vw_meetings_upcoming_v3 AS
SELECT 
  e.org_id,
  e.event_ts as start_at,
  COALESCE((e.payload->>'summary')::text, 'Reunião') as summary,
  'scheduled' as status,
  COALESCE((e.payload->>'meeting_url')::text, '') as meeting_url,
  l.name as lead_name,
  l.email as lead_email,
  l.phone_e164 as lead_phone
FROM events_v2 e
LEFT JOIN leads_v2 l ON e.lead_id = l.id
WHERE e.event_type = 'meeting_scheduled'
  AND e.event_ts >= CURRENT_DATE
ORDER BY e.event_ts
LIMIT 10;