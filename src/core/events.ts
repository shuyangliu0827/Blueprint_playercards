export type EventName =
  | "valid_input_submitted" | "input_rejected" | "generation_requested"
  | "card_generated" | "generation_qa_completed" | "auto_collected"
  | "share_asset_generated" | "share_asset_download_triggered"
  | "share_longpress_hint_shown" | "share_intent" | "shared_link_opened"
  | "comparison_requested" | "generation_retry" | "generation_failed"
  | "generation_refunded" | "generation_restored" | "ip_pollution_window_flagged"
  | "ip_pollution_after_exhaustion";

export type GenerationReason = "initial" | "new" | "quality_repair" | "retry";
export type EventTrust = "client" | "server_validated";

export interface EventBase {
  schemaVersion: "v0";
  eventId: string;
  actorAnonId: string;
  occurredAt: string;
  pollution?: boolean;
}

export type AnalyticsEvent = EventBase & { name: EventName; trust: EventTrust; generationId?: string; reason?: GenerationReason; channel?: "panel" | "system_share" | "copy_link"; rejectionCode?: string; latencyMs?: number; qaOutcome?: "pass" | "fail"; hardVetoCategory?: "face_swap" | "extra_limb" | "wrong_ball" | "wrong_hand" | "wrong_number"; visitorAnonId?: string; referralCreatorAnonId?: string; refId?: string; assetType?: "card" | "poster" | "thumbnail" | "comparison"; tier?: string; configVersion?: string; windowSeconds?: number; distinctVisitorCount?: number };

type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const EVENT_NAMES: readonly EventName[] = ["valid_input_submitted", "input_rejected", "generation_requested", "card_generated", "generation_qa_completed", "auto_collected", "share_asset_generated", "share_asset_download_triggered", "share_longpress_hint_shown", "share_intent", "shared_link_opened", "comparison_requested", "generation_retry", "generation_failed", "generation_refunded", "generation_restored", "ip_pollution_window_flagged", "ip_pollution_after_exhaustion"];
const SERVER_EVENT_NAMES = new Set<EventName>(["shared_link_opened", "ip_pollution_window_flagged", "ip_pollution_after_exhaustion"]);
const ALLOWED_FIELDS = new Set(["schemaVersion", "eventId", "actorAnonId", "occurredAt", "pollution", "name", "generationId", "reason", "channel", "rejectionCode", "latencyMs", "qaOutcome", "hardVetoCategory", "visitorAnonId", "referralCreatorAnonId", "refId", "assetType", "tier", "configVersion", "windowSeconds", "distinctVisitorCount"]);
const DICTIONARY_FIELDS = new Set([...ALLOWED_FIELDS].filter((field) => !["schemaVersion", "name"].includes(field)));
const FORBIDDEN_FIELDS = new Set(["rawIp", "ipHash", "photo", "photoUrl", "playerName", "fullName", "freeform", "notes"]);
const CLIENT_REQUIRED: Partial<Record<EventName, string[]>> = {
  generation_requested: ["generationId", "reason"], card_generated: ["generationId"],
  generation_qa_completed: ["generationId", "qaOutcome"], auto_collected: ["generationId"],
  share_asset_generated: ["generationId"], share_asset_download_triggered: ["generationId"],
  share_longpress_hint_shown: ["generationId"], share_intent: ["generationId", "channel"],
  comparison_requested: ["generationId"], generation_retry: ["generationId"],
  generation_failed: ["generationId"], generation_refunded: ["generationId"],
  generation_restored: ["generationId"], ip_pollution_window_flagged: ["windowSeconds", "distinctVisitorCount"],
  ip_pollution_after_exhaustion: ["windowSeconds", "distinctVisitorCount"],
};

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("event must be an object");
}

function validateCommon(input: unknown): Record<string, unknown> {
  assertRecord(input);
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_FIELDS.has(key)) throw new Error(`forbidden PII field: ${key}`);
    if (!ALLOWED_FIELDS.has(key)) throw new Error(`non-whitelisted event field: ${key}`);
  }
  for (const key of ["eventId", "actorAnonId", "occurredAt", "name"]) if (typeof input[key] !== "string" || input[key] === "") throw new Error(`missing ${key}`);
  if (!EVENT_NAMES.includes(input.name as EventName)) throw new Error(`unknown event name: ${String(input.name)}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.occurredAt as string) || Number.isNaN(Date.parse(input.occurredAt as string))) throw new Error("invalid occurredAt: explicit timezone required");
  if (input.schemaVersion !== undefined && input.schemaVersion !== "v0") throw new Error("invalid schemaVersion");
  if (input.pollution !== undefined && typeof input.pollution !== "boolean") throw new Error("invalid pollution");
  for (const field of ["generationId", "rejectionCode", "refId", "visitorAnonId", "referralCreatorAnonId", "tier", "configVersion"]) if (input[field] !== undefined && (typeof input[field] !== "string" || input[field] === "")) throw new Error(`invalid ${field}`);
  if (input.qaOutcome !== undefined && !["pass", "fail"].includes(input.qaOutcome as string)) throw new Error("invalid qaOutcome");
  if (input.hardVetoCategory !== undefined && !["face_swap", "extra_limb", "wrong_ball", "wrong_hand", "wrong_number"].includes(input.hardVetoCategory as string)) throw new Error("invalid hardVetoCategory");
  if (input.channel !== undefined && !["panel", "system_share", "copy_link"].includes(input.channel as string)) throw new Error("invalid channel");
  if (input.tier !== undefined && !["base", "silver", "prism", "gold", "obsidian"].includes(input.tier as string)) throw new Error("invalid tier");
  if (input.latencyMs !== undefined && (typeof input.latencyMs !== "number" || !Number.isFinite(input.latencyMs) || input.latencyMs < 0)) throw new Error("invalid latencyMs");
  if (input.reason !== undefined && !["initial", "new", "quality_repair", "retry"].includes(input.reason as string)) throw new Error("invalid generation reason");
  if (input.assetType !== undefined && !["card", "poster", "thumbnail", "comparison"].includes(input.assetType as string)) throw new Error("invalid assetType");
  for (const field of ["windowSeconds", "distinctVisitorCount"]) if (input[field] !== undefined && (!Number.isInteger(input[field]) || (input[field] as number) < 0)) throw new Error(`invalid ${field}`);
  return input;
}

export function acceptClientEvent(input: unknown): AnalyticsEvent {
  if (input && typeof input === "object" && SERVER_EVENT_NAMES.has((input as { name?: EventName }).name as EventName)) throw new Error(`${String((input as { name?: unknown }).name)} requires a validated server adapter boundary`);
  const event = validateCommon(input);
  assertEventContract(event);
  for (const key of CLIENT_REQUIRED[event.name as EventName] ?? []) if (event[key] === undefined) throw new Error(`missing ${key}`);
  return { ...event, schemaVersion: "v0", trust: "client" } as AnalyticsEvent;
}

export function acceptSharedLinkOpen(input: unknown): AnalyticsEvent {
  const event = validateCommon(input);
  if (event.name !== "shared_link_opened") throw new Error("server adapter accepts only shared_link_opened");
  assertEventContract(event);
  for (const key of ["visitorAnonId", "referralCreatorAnonId", "refId"]) if (typeof event[key] !== "string" || event[key] === "") throw new Error(`missing ${key}`);
  return { ...event, schemaVersion: "v0", trust: "server_validated" } as AnalyticsEvent;
}

export function acceptIpPollutionEvent(input: unknown): AnalyticsEvent {
  const event = validateCommon(input);
  if (event.name !== "ip_pollution_window_flagged" && event.name !== "ip_pollution_after_exhaustion") throw new Error("server adapter accepts only IP pollution aggregate events");
  assertEventContract(event);
  return { ...event, schemaVersion: "v0", trust: "server_validated" } as AnalyticsEvent;
}

export interface EventDictionaryRow { event_name: EventName; category: "input" | "generation" | "quality" | "collection" | "sharing" | "referral" | "operations"; trust: EventTrust; required_fields: string[]; optional_fields: string[]; description: string; active_metric: "completion_denominator" | "descriptive" | "repeat_generation" | "successful_recipients" | "a1_quality" | "save_upper_bound" | "referral" | "excluded_from_metrics" }

type DictionaryContract = Pick<EventDictionaryRow, "category" | "trust" | "active_metric"> & { required_fields: string[]; optional_fields: string[] };
const baseFields = ["eventId", "actorAnonId", "occurredAt"];
const contract = (category: EventDictionaryRow["category"], trust: EventTrust, active_metric: EventDictionaryRow["active_metric"], required: string[] = [], optional: string[] = ["pollution"]): DictionaryContract => ({ category, trust, active_metric, required_fields: [...baseFields, ...required], optional_fields: optional });
const EVENT_CONTRACTS: Record<EventName, DictionaryContract> = {
  valid_input_submitted: contract("input", "client", "completion_denominator"),
  input_rejected: contract("input", "client", "descriptive", [], ["rejectionCode", "pollution"]),
  generation_requested: contract("generation", "client", "repeat_generation", ["generationId", "reason"], ["tier", "configVersion", "pollution"]),
  card_generated: contract("generation", "client", "successful_recipients", ["generationId"], ["latencyMs", "qaOutcome", "tier", "configVersion", "pollution"]),
  generation_qa_completed: contract("quality", "client", "a1_quality", ["generationId", "qaOutcome"], ["hardVetoCategory", "pollution"]),
  generation_retry: contract("operations", "client", "excluded_from_metrics", ["generationId"], ["tier", "configVersion", "pollution"]),
  generation_failed: contract("operations", "client", "excluded_from_metrics", ["generationId"], ["tier", "configVersion", "pollution"]),
  generation_refunded: contract("operations", "client", "excluded_from_metrics", ["generationId"], ["tier", "configVersion", "pollution"]),
  generation_restored: contract("operations", "client", "excluded_from_metrics", ["generationId"], ["tier", "configVersion", "pollution"]),
  auto_collected: contract("collection", "client", "descriptive", ["generationId"]),
  comparison_requested: contract("sharing", "client", "descriptive", ["generationId"], ["assetType", "tier", "configVersion", "pollution"]),
  share_asset_generated: contract("sharing", "client", "save_upper_bound", ["generationId"], ["assetType", "tier", "configVersion", "pollution"]),
  share_asset_download_triggered: contract("sharing", "client", "descriptive", ["generationId"], ["assetType", "tier", "configVersion", "pollution"]),
  share_longpress_hint_shown: contract("sharing", "client", "descriptive", ["generationId"], ["assetType", "tier", "configVersion", "pollution"]),
  share_intent: contract("sharing", "client", "descriptive", ["generationId", "channel"], ["assetType", "tier", "configVersion", "pollution"]),
  shared_link_opened: contract("referral", "server_validated", "referral", ["visitorAnonId", "referralCreatorAnonId", "refId"]),
  ip_pollution_window_flagged: contract("operations", "server_validated", "excluded_from_metrics", ["windowSeconds", "distinctVisitorCount"]),
  ip_pollution_after_exhaustion: contract("operations", "server_validated", "excluded_from_metrics", ["windowSeconds", "distinctVisitorCount"]),
};

function assertEventContract(event: Record<string, unknown>): void {
  const name = event.name as EventName;
  const eventContract = EVENT_CONTRACTS[name];
  const permitted = new Set(["name", "schemaVersion", ...eventContract.required_fields, ...eventContract.optional_fields]);
  for (const key of Object.keys(event)) if (!permitted.has(key)) throw new Error(`${name} does not permit field ${key}`);
  for (const key of eventContract.required_fields) if (event[key] === undefined) throw new Error(`${name} missing required field ${key}`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []; let current = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i]!; if (ch === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted; } else if (ch === "," && !quoted) { out.push(current); current = ""; } else current += ch; }
  out.push(current); return out;
}

export function validateEventDictionary(csv: string): ValidationResult<EventDictionaryRow[]> {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim()); const errors: string[] = [];
  const header = lines.shift()?.split(",") ?? [];
  const expected = ["event_name", "category", "trust", "required_fields", "optional_fields", "description", "active_metric"];
  if (header.join(",") !== expected.join(",")) errors.push("invalid or missing dictionary header");
  const rows: EventDictionaryRow[] = []; const seen = new Set<string>();
  lines.forEach((line, index) => {
    const cols = parseCsvLine(line); const row = Object.fromEntries(expected.map((key, i) => [key, cols[i] ?? ""])) as Record<string, string>;
    const at = `row ${index + 2}`;
    if (cols.length !== expected.length) errors.push(`${at}: expected ${expected.length} columns`);
    const eventName = row.event_name ?? ""; const category = row.category ?? "";
    const trust = row.trust ?? ""; const activeMetric = row.active_metric ?? "";
    if (!EVENT_NAMES.includes(eventName as EventName)) errors.push(`${at}: invalid event_name ${eventName}`);
    if (seen.has(eventName)) errors.push(`${at}: duplicate event_name ${eventName}`); seen.add(eventName);
    if (!["input", "generation", "quality", "collection", "sharing", "referral", "operations"].includes(category)) errors.push(`${at}: invalid category`);
    if (!["client", "server_validated"].includes(trust)) errors.push(`${at}: invalid trust`);
    if (!["completion_denominator", "descriptive", "repeat_generation", "successful_recipients", "a1_quality", "save_upper_bound", "referral", "excluded_from_metrics"].includes(activeMetric)) errors.push(`${at}: invalid active_metric ${activeMetric}`);
    const required_fields = (row.required_fields ?? "").split("|").filter(Boolean); const optional_fields = (row.optional_fields ?? "").split("|").filter(Boolean);
    for (const field of [...required_fields, ...optional_fields]) if (!DICTIONARY_FIELDS.has(field)) errors.push(`${at}: forbidden or unknown field ${field}`);
    for (const field of required_fields) if (optional_fields.includes(field)) errors.push(`${at}: field ${field} is both required and optional`);
    for (const field of ["eventId", "actorAnonId", "occurredAt"]) if (!required_fields.includes(field)) errors.push(`${at}: missing required base field ${field}`);
    if (SERVER_EVENT_NAMES.has(eventName as EventName) && trust !== "server_validated") errors.push(`${at}: server event must be server_validated`);
    if (!SERVER_EVENT_NAMES.has(eventName as EventName) && trust !== "client") errors.push(`${at}: client event must use client trust`);
    const description = row.description ?? "";
    if (!description) errors.push(`${at}: missing description`);
    rows.push({ event_name: eventName as EventName, category: category as EventDictionaryRow["category"], trust: trust as EventTrust, required_fields, optional_fields, description, active_metric: activeMetric as EventDictionaryRow["active_metric"] });
  });
  for (const name of EVENT_NAMES) if (!seen.has(name)) errors.push(`missing event row ${name}`);
  const sameFields = (left: string[], right: string[]) => [...left].sort().join("|") === [...right].sort().join("|");
  for (const row of rows) {
    const expectedContract = EVENT_CONTRACTS[row.event_name];
    if (!expectedContract) continue;
    if (!sameFields(row.required_fields, expectedContract.required_fields)) errors.push(`${row.event_name} required_fields do not match runtime contract`);
    if (!sameFields(row.optional_fields, expectedContract.optional_fields)) errors.push(`${row.event_name} optional_fields do not match runtime contract`);
    if (row.category !== expectedContract.category) errors.push(`${row.event_name} category does not match runtime contract`);
    if (row.trust !== expectedContract.trust) errors.push(`${row.event_name} trust does not match runtime contract`);
    if (row.active_metric !== expectedContract.active_metric) errors.push(`${row.event_name} active_metric does not match runtime contract`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: rows };
}

export interface MetricsConfig { version: "v0"; gates: { a1: { firstPass: { passAtOrAbove: number; fixAtOrAbove: number; stopBelow: number }; retryDelivery: { passAtOrAbove: number }; hardVeto: { maximum: number; categoryMaximum: number }; textAndLabels: { passAtOrAbove: number }; latencyMs: { p50Maximum: number; p95Maximum: number } }; a2: { completion: { passAtOrAbove: number }; saveUpperBound: { status: "active_upper_bound"; numerator: string; denominator: string; passAtOrAbove: number; stopBelow: number }; legacyActiveSave: { status: "superseded_inactive"; passAtOrAbove: number; stopBelow: number; reason: string }; legacyActiveShare: { status: "superseded_inactive"; passAtOrAbove: number; improveBelow: number; reason: string }; referral: { passAtOrAbove: number; rethinkBelow: number }; repeatGeneration: { passAtOrAbove: number; oneOffBelow: number } } }; sample: { unprovenBelow: number; target: number } }

export function validateMetricsConfig(input: unknown): ValidationResult<MetricsConfig> {
  const errors: string[] = []; const obj = input as any;
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["config must be an object"] };
  const allowedKeys: Record<string, readonly string[]> = {
    "": ["version", "gates", "sample"], gates: ["a1", "a2"], "gates.a1": ["firstPass", "retryDelivery", "hardVeto", "textAndLabels", "latencyMs"],
    "gates.a1.firstPass": ["passAtOrAbove", "fixAtOrAbove", "stopBelow"], "gates.a1.retryDelivery": ["passAtOrAbove"],
    "gates.a1.hardVeto": ["maximum", "categoryMaximum"], "gates.a1.textAndLabels": ["passAtOrAbove"], "gates.a1.latencyMs": ["p50Maximum", "p95Maximum"],
    "gates.a2": ["completion", "saveUpperBound", "legacyActiveSave", "legacyActiveShare", "referral", "repeatGeneration"],
    "gates.a2.completion": ["passAtOrAbove"], "gates.a2.saveUpperBound": ["status", "numerator", "denominator", "passAtOrAbove", "stopBelow"],
    "gates.a2.legacyActiveSave": ["status", "passAtOrAbove", "stopBelow", "reason"], "gates.a2.legacyActiveShare": ["status", "passAtOrAbove", "improveBelow", "reason"],
    "gates.a2.referral": ["passAtOrAbove", "rethinkBelow"], "gates.a2.repeatGeneration": ["passAtOrAbove", "oneOffBelow"], sample: ["unprovenBelow", "target"],
  };
  for (const [path, allowed] of Object.entries(allowedKeys)) {
    const node = path ? path.split(".").reduce((value: any, key) => value?.[key], obj) : obj;
    if (node !== undefined && (!node || typeof node !== "object" || Array.isArray(node))) { errors.push(`${path || "config"} must be an object`); continue; }
    if (node) for (const key of Object.keys(node)) if (!allowed.includes(key)) errors.push(`unknown field ${path ? `${path}.` : ""}${key}`);
  }
  if (obj.version !== "v0") errors.push("version must be v0");
  const required = ["gates.a1.firstPass", "gates.a1.retryDelivery", "gates.a1.hardVeto", "gates.a1.textAndLabels", "gates.a1.latencyMs", "gates.a2.completion", "gates.a2.saveUpperBound", "gates.a2.legacyActiveSave", "gates.a2.legacyActiveShare", "gates.a2.referral", "gates.a2.repeatGeneration", "sample"];
  const at = (path: string) => path.split(".").reduce((v: any, key) => v?.[key], obj);
  for (const path of required) if (at(path) === undefined) errors.push(`missing ${path}`);
  const rates = ["gates.a1.firstPass.passAtOrAbove", "gates.a1.firstPass.fixAtOrAbove", "gates.a1.firstPass.stopBelow", "gates.a1.retryDelivery.passAtOrAbove", "gates.a1.hardVeto.maximum", "gates.a1.hardVeto.categoryMaximum", "gates.a1.textAndLabels.passAtOrAbove", "gates.a2.completion.passAtOrAbove", "gates.a2.saveUpperBound.passAtOrAbove", "gates.a2.saveUpperBound.stopBelow", "gates.a2.legacyActiveSave.passAtOrAbove", "gates.a2.legacyActiveSave.stopBelow", "gates.a2.legacyActiveShare.passAtOrAbove", "gates.a2.legacyActiveShare.improveBelow", "gates.a2.referral.passAtOrAbove", "gates.a2.referral.rethinkBelow", "gates.a2.repeatGeneration.passAtOrAbove", "gates.a2.repeatGeneration.oneOffBelow"];
  for (const path of rates) { const value = at(path); if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) errors.push(`${path} must be a finite number between 0 and 1`); }
  if (obj.gates?.a2?.saveUpperBound?.status !== "active_upper_bound") errors.push("saveUpperBound status must be active_upper_bound");
  for (const key of ["legacyActiveSave", "legacyActiveShare"]) if (obj.gates?.a2?.[key]?.status !== "superseded_inactive") errors.push(`${key} status must be superseded_inactive`);
  for (const path of ["gates.a1.latencyMs.p50Maximum", "gates.a1.latencyMs.p95Maximum", "sample.unprovenBelow", "sample.target"]) { const value = at(path); if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) errors.push(`${path} must be a positive finite number`); }
  if (typeof obj.gates?.a2?.saveUpperBound?.numerator !== "string" || !obj.gates.a2.saveUpperBound.numerator) errors.push("saveUpperBound numerator is required");
  if (typeof obj.gates?.a2?.saveUpperBound?.denominator !== "string" || !obj.gates.a2.saveUpperBound.denominator) errors.push("saveUpperBound denominator is required");
  for (const path of ["gates.a2.legacyActiveSave.reason", "gates.a2.legacyActiveShare.reason"]) if (typeof at(path) !== "string" || !at(path)) errors.push(`${path} must be a non-empty string`);
  const exactValues: Record<string, number> = {
    "gates.a1.firstPass.passAtOrAbove": 0.70, "gates.a1.firstPass.fixAtOrAbove": 0.55, "gates.a1.firstPass.stopBelow": 0.55,
    "gates.a1.retryDelivery.passAtOrAbove": 0.85, "gates.a1.hardVeto.maximum": 0.05, "gates.a1.hardVeto.categoryMaximum": 0.03,
    "gates.a1.textAndLabels.passAtOrAbove": 1, "gates.a1.latencyMs.p50Maximum": 15000, "gates.a1.latencyMs.p95Maximum": 45000,
    "gates.a2.completion.passAtOrAbove": 0.80, "gates.a2.saveUpperBound.passAtOrAbove": 0.50, "gates.a2.saveUpperBound.stopBelow": 0.30,
    "gates.a2.legacyActiveSave.passAtOrAbove": 0.50, "gates.a2.legacyActiveSave.stopBelow": 0.30,
    "gates.a2.legacyActiveShare.passAtOrAbove": 0.25, "gates.a2.legacyActiveShare.improveBelow": 0.15,
    "gates.a2.referral.passAtOrAbove": 0.50, "gates.a2.referral.rethinkBelow": 0.20,
    "gates.a2.repeatGeneration.passAtOrAbove": 0.40, "gates.a2.repeatGeneration.oneOffBelow": 0.20,
    "sample.unprovenBelow": 150, "sample.target": 300,
  };
  for (const [path, expected] of Object.entries(exactValues)) if (!Object.is(at(path), expected)) errors.push(`${path} must equal confirmed value ${expected}`);
  return errors.length ? { ok: false, errors } : { ok: true, value: obj as MetricsConfig };
}

const ratio = (numerator: number, denominator: number): number | null => denominator === 0 ? null : numerator / denominator;

export function computeMetrics(events: readonly AnalyticsEvent[]) {
  const actions = events.filter((event) => event.name !== "ip_pollution_window_flagged" && event.name !== "ip_pollution_after_exhaustion");
  const submitters = new Set(actions.filter((event) => event.name === "valid_input_submitted").map((event) => event.actorAnonId));
  const cardEvents = actions.filter((event) => event.name === "card_generated");
  const recipients = new Set(cardEvents.map((event) => event.actorAnonId));
  const generated = new Set(actions.filter((event) => event.name === "share_asset_generated" && recipients.has(event.actorAnonId)).map((event) => event.actorAnonId));
  const firstCardTime = new Map<string, number>();
  for (const event of cardEvents) firstCardTime.set(event.actorAnonId, Math.min(firstCardTime.get(event.actorAnonId) ?? Infinity, Date.parse(event.occurredAt)));
  const repeated = new Set(actions.filter((event) => event.name === "generation_requested" && event.reason === "new" && (firstCardTime.get(event.actorAnonId) ?? Infinity) < Date.parse(event.occurredAt)).map((event) => event.actorAnonId));
  const opens = actions.filter((event) => event.name === "shared_link_opened" && event.trust === "server_validated" && event.visitorAnonId !== event.referralCreatorAnonId && recipients.has(event.referralCreatorAnonId!));
  opens.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  const visitorAttribution = new Map<string, string>();
  for (const event of opens) if (!visitorAttribution.has(event.visitorAnonId!)) visitorAttribution.set(event.visitorAnonId!, event.referralCreatorAnonId!);
  const attributionCounts = new Map<string, number>();
  for (const creator of visitorAttribution.values()) attributionCounts.set(creator, (attributionCounts.get(creator) ?? 0) + 1);
  const referralAttribution = Object.fromEntries(attributionCounts);
  return { validInputSubmitters: submitters.size, successfulRecipients: recipients.size, completionRate: ratio(recipients.size, submitters.size), saveUpperBoundPeople: generated.size, saveUpperBoundRate: ratio(generated.size, recipients.size), repeatGenerationPeople: repeated.size, repeatGenerationRate: ratio(repeated.size, recipients.size), attributedReferralVisitors: visitorAttribution.size, referralRate: ratio(visitorAttribution.size, recipients.size), referralAttribution };
}
