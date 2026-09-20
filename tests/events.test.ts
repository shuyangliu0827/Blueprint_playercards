import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptClientEvent,
  acceptIpPollutionEvent,
  acceptSharedLinkOpen,
  computeMetrics,
  validateEventDictionary,
  validateMetricsConfig,
  type AnalyticsEvent,
} from "../src/core/events.js";

const metricsConfig = JSON.parse(
  readFileSync(new URL("../config/metrics_v0.json", import.meta.url), "utf8"),
);
const dictionaryCsv = readFileSync(
  new URL("../config/events_dictionary.csv", import.meta.url),
  "utf8",
);

const base = {
  schemaVersion: "v0" as const,
  eventId: "evt-1",
  actorAnonId: "person-a",
  occurredAt: "2026-09-20T12:00:00.000Z",
};

describe("configuration validators", () => {
  it("accepts the shipped metrics config and preserves exact v3 thresholds", () => {
    const result = validateMetricsConfig(metricsConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gates.a1.firstPass).toEqual({ passAtOrAbove: 0.7, fixAtOrAbove: 0.55, stopBelow: 0.55 });
    expect(result.value.gates.a1.retryDelivery.passAtOrAbove).toBe(0.85);
    expect(result.value.gates.a1.hardVeto).toEqual({ maximum: 0.05, categoryMaximum: 0.03 });
    expect(result.value.gates.a1.textAndLabels.passAtOrAbove).toBe(1);
    expect(result.value.gates.a1.latencyMs).toEqual({ p50Maximum: 15000, p95Maximum: 45000 });
    expect(result.value.gates.a2.completion.passAtOrAbove).toBe(0.8);
    expect(result.value.gates.a2.saveUpperBound).toMatchObject({ passAtOrAbove: 0.5, stopBelow: 0.3 });
    expect(result.value.gates.a2.legacyActiveShare.status).toBe("superseded_inactive");
    expect(result.value.gates.a2.legacyActiveShare.passAtOrAbove).toBe(0.25);
    expect(result.value.gates.a2.referral).toEqual({ passAtOrAbove: 0.5, rethinkBelow: 0.2 });
    expect(result.value.gates.a2.repeatGeneration).toEqual({ passAtOrAbove: 0.4, oneOffBelow: 0.2 });
    expect(result.value.sample).toEqual({ unprovenBelow: 150, target: 300 });
  });

  it("rejects missing gates, invalid status enums, and out-of-range values", () => {
    const broken = structuredClone(metricsConfig);
    delete broken.gates.a1.latencyMs;
    broken.gates.a2.legacyActiveShare.status = "active";
    broken.gates.a2.completion.passAtOrAbove = 2;
    const result = validateMetricsConfig(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/latencyMs/);
    expect(result.errors.join(" ")).toMatch(/superseded_inactive/);
    expect(result.errors.join(" ")).toMatch(/between 0 and 1/);
  });

  it("rejects extra and malformed nested metrics fields", () => {
    const extra = structuredClone(metricsConfig);
    extra.gates.a1.firstPass.surprise = 0.6;
    const malformed = structuredClone(metricsConfig);
    malformed.sample.target = "300";
    const missingLatency = structuredClone(metricsConfig);
    delete missingLatency.gates.a1.latencyMs.p95Maximum;
    const nanRate = structuredClone(metricsConfig);
    nanRate.gates.a2.completion.passAtOrAbove = Number.NaN;
    const changedGate = structuredClone(metricsConfig);
    changedGate.gates.a2.referral.passAtOrAbove = 0.51;
    for (const candidate of [extra, malformed, missingLatency, nanRate, changedGate]) {
      const result = validateMetricsConfig(candidate);
      expect(result.ok).toBe(false);
    }
  });

  it("validates every dictionary row, enum, field, and duplicate", () => {
    expect(validateEventDictionary(dictionaryCsv)).toEqual({ ok: true, value: expect.any(Array) });
    const bad = `${dictionaryCsv}\ncard_generated,generation,client,eventId|rawIp,,duplicate,bogus`;
    const result = validateEventDictionary(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/duplicate/i);
    expect(result.errors.join(" ")).toMatch(/rawIp/);
    expect(result.errors.join(" ")).toMatch(/active_metric/);
  });

  it("requires stage-3 lifecycle, comparison, segmentation, and aggregate pollution hooks", () => {
    const result = validateEventDictionary(dictionaryCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byName = new Map(result.value.map((row) => [row.event_name, row]));
    for (const name of ["comparison_requested", "generation_retry", "generation_failed", "generation_refunded", "generation_restored", "ip_pollution_window_flagged", "ip_pollution_after_exhaustion"] as const) {
      expect(byName.has(name), name).toBe(true);
    }
    expect(byName.get("share_asset_generated")?.optional_fields).toEqual(expect.arrayContaining(["assetType", "tier", "configVersion"]));
    expect(byName.get("ip_pollution_window_flagged")?.required_fields).toEqual(expect.arrayContaining(["windowSeconds", "distinctVisitorCount"]));
    expect(byName.get("ip_pollution_window_flagged")?.required_fields.join("|")).not.toMatch(/ip|hash/i);
  });

  it("rejects dictionary rows with unknown fields even when other columns are valid", () => {
    const broken = dictionaryCsv.replace("tier|configVersion|pollution,Generation request", "tier|configVersion|pollution|mysteryField,Generation request");
    const result = validateEventDictionary(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/mysteryField/);
  });

  it("rejects a dictionary that weakens a runtime-required event contract", () => {
    const broken = dictionaryCsv.replace("generationId|reason,tier", "generationId,tier");
    const result = validateEventDictionary(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/generation_requested.*required_fields/);
  });
});

describe("trusted ingestion boundaries", () => {
  it("rejects a client attempt to forge a server-observed referral even with a source field", () => {
    expect(() => acceptClientEvent({ ...base, name: "shared_link_opened", source: "server", referralCreatorAnonId: "creator" } as never)).toThrow(/server adapter/);
  });

  it("accepts a referral only through the validated adapter boundary", () => {
    const event = acceptSharedLinkOpen({ ...base, name: "shared_link_opened", visitorAnonId: "visitor", referralCreatorAnonId: "creator", refId: "signed-ref" });
    expect(event.trust).toBe("server_validated");
  });

  it("rejects unrelated and nested fields at the trusted referral boundary", () => {
    expect(() => acceptSharedLinkOpen({
      ...base,
      name: "shared_link_opened",
      visitorAnonId: "visitor",
      referralCreatorAnonId: "creator",
      refId: "signed-ref",
      windowSeconds: { rawIp: "1.2.3.4", photo: "original" },
    })).toThrow(/windowSeconds/);
    expect(() => acceptSharedLinkOpen({
      ...base,
      name: "shared_link_opened",
      visitorAnonId: "visitor",
      referralCreatorAnonId: "creator",
      refId: "signed-ref",
      assetType: "poster",
    })).toThrow(/assetType/);
  });

  it("rejects forbidden PII and non-whitelisted free-form fields", () => {
    expect(() => acceptClientEvent({ ...base, name: "card_generated", generationId: "g1", rawIp: "1.2.3.4" } as never)).toThrow(/rawIp/);
    expect(() => acceptClientEvent({ ...base, name: "card_generated", generationId: "g1", playerName: "Marcus" } as never)).toThrow(/playerName/);
    expect(() => acceptClientEvent({ ...base, name: "card_generated", generationId: "g1", notes: "anything" } as never)).toThrow(/notes/);
  });

  it("validates asset types and accepts bounded segmentation fields", () => {
    expect(acceptClientEvent({ ...base, name: "share_asset_generated", generationId: "g1", assetType: "poster", tier: "prism", configVersion: "v0" })).toMatchObject({ assetType: "poster", tier: "prism", configVersion: "v0" });
    expect(() => acceptClientEvent({ ...base, name: "share_asset_generated", generationId: "g1", assetType: "original_photo" })).toThrow(/assetType/);
  });

  it("accepts only aggregate referral pollution signals without IP identifiers", () => {
    expect(() => acceptClientEvent({ ...base, name: "ip_pollution_window_flagged", windowSeconds: 60, distinctVisitorCount: 25 })).toThrow(/server adapter/);
    expect(acceptIpPollutionEvent({ ...base, name: "ip_pollution_window_flagged", windowSeconds: 3600, distinctVisitorCount: 5 })).toMatchObject({ trust: "server_validated", windowSeconds: 3600, distinctVisitorCount: 5 });
    expect(acceptIpPollutionEvent({ ...base, name: "ip_pollution_after_exhaustion", windowSeconds: 600, distinctVisitorCount: 3 })).toMatchObject({ trust: "server_validated", windowSeconds: 600, distinctVisitorCount: 3 });
    expect(() => acceptIpPollutionEvent({ ...base, name: "ip_pollution_window_flagged", windowSeconds: 60, distinctVisitorCount: 25, ipHash: "hash" } as never)).toThrow(/ipHash/);
    expect(() => acceptIpPollutionEvent({ ...base, name: "card_generated", generationId: "g1" })).toThrow(/only IP pollution/);
  });

  it("rejects malformed recognized fields and timezone-less timestamps", () => {
    for (const input of [
      { ...base, name: "card_generated", generationId: {} },
      { ...base, name: "generation_qa_completed", generationId: "g", qaOutcome: "maybe" },
      { ...base, name: "share_intent", generationId: "g", channel: "unknown" },
      { ...base, name: "card_generated", generationId: "g", pollution: "true" },
      { ...base, name: "card_generated", generationId: "g", tier: "diamond" },
      { ...base, name: "card_generated", generationId: "g", occurredAt: "2026-09-20T12:00:00" },
    ]) expect(() => acceptClientEvent(input)).toThrow();
  });
});

describe("metric semantics", () => {
  const e = (event: Omit<AnalyticsEvent, "trust">): AnalyticsEvent => ({ ...event, trust: "client" } as AnalyticsEvent);

  it("counts asset shown after canvas completion as an upper bound, but not auto collection or panel opens", () => {
    const events: AnalyticsEvent[] = [
      e({ ...base, eventId: "1", name: "card_generated", generationId: "g1" }),
      e({ ...base, eventId: "2", name: "share_asset_generated", generationId: "g1" }),
      e({ ...base, eventId: "3", name: "auto_collected", generationId: "g1" }),
      e({ ...base, eventId: "4", name: "share_intent", generationId: "g1", channel: "panel" }),
      e({ ...base, eventId: "5", actorAnonId: "person-b", name: "card_generated", generationId: "g2" }),
    ];
    expect(computeMetrics(events)).toMatchObject({ successfulRecipients: 2, saveUpperBoundPeople: 1, saveUpperBoundRate: 0.5 });
  });

  it("does not count retries or quality repairs as repeat generation", () => {
    const events: AnalyticsEvent[] = [
      e({ ...base, eventId: "1", name: "card_generated", generationId: "g1" }),
      e({ ...base, eventId: "2", name: "generation_requested", generationId: "g2", reason: "retry", occurredAt: "2026-09-20T12:01:00.000Z" }),
      e({ ...base, eventId: "3", name: "generation_requested", generationId: "g3", reason: "quality_repair", occurredAt: "2026-09-20T12:02:00.000Z" }),
      e({ ...base, eventId: "4", name: "generation_requested", generationId: "g4", reason: "new", occurredAt: "2026-09-20T12:03:00.000Z" }),
    ];
    expect(computeMetrics(events).repeatGenerationPeople).toBe(1);
    expect(computeMetrics(events).repeatGenerationRate).toBe(1);
  });

  it("deduplicates visitors, excludes creator self-visits, and attributes first touch deterministically", () => {
    const server = (eventId: string, creator: string, at: string): AnalyticsEvent => acceptSharedLinkOpen(
      { ...base, eventId, actorAnonId: "visitor", visitorAnonId: "visitor", name: "shared_link_opened", referralCreatorAnonId: creator, refId: `ref-${creator}`, occurredAt: at },
    );
    const events: AnalyticsEvent[] = [
      e({ ...base, eventId: "c1", actorAnonId: "creator-a", name: "card_generated", generationId: "ga" }),
      e({ ...base, eventId: "c2", actorAnonId: "creator-b", name: "card_generated", generationId: "gb" }),
      server("z", "creator-b", "2026-09-20T12:01:00.000Z"),
      server("a", "creator-a", "2026-09-20T12:01:00.000Z"),
      server("later", "creator-b", "2026-09-20T12:02:00.000Z"),
      acceptSharedLinkOpen({ ...base, eventId: "self", actorAnonId: "creator-a", visitorAnonId: "creator-a", name: "shared_link_opened", referralCreatorAnonId: "creator-a", refId: "self", occurredAt: "2026-09-20T12:03:00.000Z" }),
    ];
    const result = computeMetrics(events);
    expect(result.attributedReferralVisitors).toBe(1);
    expect(result.referralRate).toBe(0.5);
    expect(result.referralAttribution).toEqual({ "creator-a": 1 });
  });

  it("preserves prototype-like creator IDs in referral attribution", () => {
    const card = (creator: string, id: string): AnalyticsEvent => e({ ...base, eventId: id, actorAnonId: creator, name: "card_generated", generationId: `g-${id}` });
    const open = (creator: string, visitor: string, id: string): AnalyticsEvent => acceptSharedLinkOpen({ ...base, eventId: id, actorAnonId: visitor, visitorAnonId: visitor, name: "shared_link_opened", referralCreatorAnonId: creator, refId: `ref-${id}`, occurredAt: "2026-09-20T12:01:00.000Z" });
    const result = computeMetrics([card("__proto__", "c1"), card("constructor", "c2"), open("__proto__", "v1", "o1"), open("constructor", "v2", "o2")]);
    expect(Object.entries(result.referralAttribution).sort()).toEqual([["__proto__", 1], ["constructor", 1]]);
  });

  it("does not drop legitimate actions merely because a person or event was tagged polluted", () => {
    const events: AnalyticsEvent[] = [
      e({ ...base, eventId: "1", name: "card_generated", generationId: "g1", pollution: true }),
      e({ ...base, eventId: "2", name: "share_asset_generated", generationId: "g1", pollution: true }),
    ];
    expect(computeMetrics(events)).toMatchObject({ successfulRecipients: 1, saveUpperBoundPeople: 1 });
  });

  it("computes completion from distinct valid submitters and successful recipients", () => {
    const events: AnalyticsEvent[] = [
      e({ ...base, eventId: "s1", name: "valid_input_submitted" }),
      e({ ...base, eventId: "s2", actorAnonId: "person-b", name: "valid_input_submitted" }),
      e({ ...base, eventId: "c1", name: "card_generated", generationId: "g1" }),
    ];
    expect(computeMetrics(events)).toMatchObject({ validInputSubmitters: 2, successfulRecipients: 1, completionRate: 0.5 });
  });

  it("counts repeat only when a new request follows an issued card in absolute time", () => {
    const events: AnalyticsEvent[] = [
      e({ ...base, eventId: "before", name: "generation_requested", generationId: "g0", reason: "new", occurredAt: "2026-09-20T13:00:00+01:00" }),
      e({ ...base, eventId: "card", name: "card_generated", generationId: "g1", occurredAt: "2026-09-20T12:30:00.000Z" }),
      e({ ...base, eventId: "after", name: "generation_requested", generationId: "g2", reason: "new", occurredAt: "2026-09-20T08:31:00-04:00" }),
    ];
    expect(computeMetrics(events).repeatGenerationPeople).toBe(1);
  });
});
