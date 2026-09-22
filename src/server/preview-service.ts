import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  acceptClientEvent,
  acceptIpPollutionEvent,
  acceptSharedLinkOpen,
  computeMetrics,
  type AnalyticsEvent,
} from '../core/events';
import type { DrawResult } from '../core/draw';
import { validateCardInput, type CardInput } from '../core/input';
import { mockLatencyMs, type MockMode } from '../core/mock-timing';
import { routePose, type PoseId } from '../core/pose';
import { parseRequestId } from '../core/request-id';
import { assertSecret } from './draw-service';
import { createDrawService, loadConfiguration } from './bootstrap';

export type Scenario = 'random' | 'success' | 'retry' | 'fail';
export type JobStatus = 'pending' | 'retrying' | 'ready' | 'failed' | 'complete';
export interface JobView {
  requestId: string;
  status: JobStatus;
  draw: DrawResult;
  poseId: string;
  mirror: boolean;
  attempt: number;
  remaining: number;
  successfulCount: number;
  elapsedMs: number;
  retryAtMs?: number;
  error?: string;
}
interface Job {
  requestId: string;
  actor: string;
  ipHash?: string;
  status: JobStatus;
  draw: JobView['draw'];
  poseId: PoseId;
  mirror: boolean;
  attempt: number;
  startedAt: number;
  stageMs: number;
  secondStageMs: number;
  outcome: Exclude<Scenario, 'random'>;
  reserved: boolean;
  counted: boolean;
  updatedAt: number;
  retryRecorded: boolean;
  terminalRecorded: boolean;
  restored: boolean;
  errorCode?: string;
  liveFingerprint?: string;
  providerReady?: boolean;
}
interface Identity {
  anonId: string;
  createdAt: number;
  lastSeenAt: number;
  ipHash?: string;
  successfulCount: number;
  successTimes: number[];
}
interface Completion {
  actor: string;
  job: Job;
  completedAt: number;
}
interface Contract {
  reservationTimeoutMs: number;
  jobRetentionMs: number;
  eventRetentionMs: number;
  maximumJobs: number;
  maximumEvents: number;
  maximumIdentities: number;
  maximumCompletions: number;
  p50: number;
  p95: number;
  fast: number;
  retryRate: number;
  failureRate: number;
}
interface StoredEvent {
  event: AnalyticsEvent;
  receivedAt: number;
}
export interface PreviewServiceOptions {
  configDirectory: string;
  drawSecret: string;
  ipHashSalt: string;
  now?: () => number;
  random?: () => number;
}

const enc = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const mac = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url');
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const exactKeys = (
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PreviewError('BAD_REQUEST', `${label} must be an object`, 400);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record))
    if (!allowed.includes(key))
      throw new PreviewError('BAD_REQUEST', `${label} contains unexpected field ${key}`, 400);
  return record;
};

export class PreviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function signAnonCookie(anonId: string, secret: string): string {
  assertSecret(secret);
  return `${enc(anonId)}.${mac(anonId, secret)}`;
}
export function verifyAnonCookie(value: string | undefined, secret: string): string | undefined {
  if (!value) return undefined;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return undefined;
  try {
    const anonId = Buffer.from(encoded, 'base64url').toString('utf8');
    return /^[0-9a-f-]{36}$/i.test(anonId) && safeEqual(signature, mac(anonId, secret))
      ? anonId
      : undefined;
  } catch {
    return undefined;
  }
}
export function signReferral(anonId: string, secret: string): string {
  const payload = enc(anonId);
  return `${payload}.${mac(`ref:${anonId}`, secret)}`;
}
export function verifyReferral(value: string | undefined, secret: string): string | undefined {
  if (!value) return undefined;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return undefined;
  try {
    const id = Buffer.from(payload, 'base64url').toString('utf8');
    return /^[0-9a-f-]{36}$/i.test(id) && safeEqual(signature, mac(`ref:${id}`, secret))
      ? id
      : undefined;
  } catch {
    return undefined;
  }
}

export class PreviewService {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly config;
  private readonly drawService;
  private readonly contract: Contract;
  private readonly jobs = new Map<string, Job>();
  private readonly completions = new Map<string, Completion>();
  private readonly identities = new Map<string, Identity>();
  private readonly events: StoredEvent[] = [];
  private readonly eventIds = new Set<string>();
  private readonly referralVisitors = new Map<string, number>();
  private readonly ipVisitors = new Map<string, Map<string, number>>();
  private readonly pollutionFlags = new Set<string>();
  constructor(private readonly options: PreviewServiceOptions) {
    assertSecret(options.drawSecret);
    assertSecret(options.ipHashSalt);
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.config = loadConfiguration(options.configDirectory);
    this.drawService = createDrawService(options.configDirectory, {
      DRAW_HMAC_SECRET: options.drawSecret,
    });
    const raw = JSON.parse(
      readFileSync(join(options.configDirectory, 'generation_contract.json'), 'utf8'),
    ) as Record<string, unknown>;
    const quantiles = raw.normalLatencyQuantilesMs as Record<string, unknown>;
    const outcomes = raw.outcomes as Record<string, unknown>;
    this.contract = {
      reservationTimeoutMs: Number(raw.reservationTimeoutMs),
      jobRetentionMs: Number(raw.jobRetentionMs),
      eventRetentionMs: Number(raw.eventRetentionMs),
      maximumJobs: Number(raw.maximumJobs),
      maximumEvents: Number(raw.maximumEvents),
      maximumIdentities: Number(raw.maximumIdentities),
      maximumCompletions: Number(raw.maximumCompletions),
      p50: Number(quantiles?.p50),
      p95: Number(quantiles?.p95),
      fast: Number(raw.fastLatencyMs),
      retryRate: Number(outcomes?.retryThenSuccess),
      failureRate: Number(outcomes?.retryThenFailure),
    };
    if (
      [
        this.contract.reservationTimeoutMs,
        this.contract.jobRetentionMs,
        this.contract.eventRetentionMs,
        this.contract.maximumJobs,
        this.contract.maximumEvents,
        this.contract.maximumIdentities,
        this.contract.maximumCompletions,
        this.contract.p50,
        this.contract.p95,
        this.contract.fast,
      ].some((v) => !Number.isInteger(v) || v < 1) ||
      this.contract.p95 <= this.contract.p50 ||
      !Number.isFinite(this.contract.retryRate) ||
      !Number.isFinite(this.contract.failureRate) ||
      this.contract.retryRate < 0 ||
      this.contract.failureRate < 0 ||
      this.contract.retryRate + this.contract.failureRate >= 1 ||
      Math.abs(
        Number(outcomes?.success) + this.contract.retryRate + this.contract.failureRate - 1,
      ) > 1e-9
    )
      throw new Error('generation contract is invalid');
  }

  createSession(cookie: string | undefined, ref: string | undefined, rawIp?: string) {
    this.prune();
    const verifiedIdentity = verifyAnonCookie(cookie, this.options.drawSecret);
    const anonId = verifiedIdentity ?? randomUUID();
    const ipHash = rawIp
      ? createHmac('sha256', this.options.ipHashSalt).update(rawIp).digest('hex')
      : undefined;
    const existing = this.identities.get(anonId);
    if (
      !existing &&
      this.identities.size >= this.contract.maximumIdentities &&
      !this.evictIdentity()
    )
      throw new PreviewError('QUEUE_BUSY', 'preview identity capacity is temporarily full', 503);
    if (existing) this.identities.delete(anonId);
    this.identities.set(anonId, {
      anonId,
      createdAt: existing?.createdAt ?? this.now(),
      lastSeenAt: this.now(),
      ipHash,
      successfulCount: existing?.successfulCount ?? 0,
      successTimes: existing?.successTimes ?? [],
    });
    if (ipHash) this.observeIp(ipHash, anonId, verifiedIdentity === undefined);
    const creator = verifyReferral(ref, this.options.drawSecret);
    if (creator && creator !== anonId && !this.referralVisitors.has(anonId)) {
      this.referralVisitors.set(anonId, this.now());
      this.push(
        acceptSharedLinkOpen({
          name: 'shared_link_opened',
          eventId: randomUUID(),
          actorAnonId: creator,
          occurredAt: this.iso(),
          visitorAnonId: anonId,
          referralCreatorAnonId: creator,
          refId: ref,
        }),
      );
    }
    return {
      value: {
        anonId,
        configVersion: this.drawService.publicConfig.configVersion,
        ...this.counts(anonId),
        refToken: signReferral(anonId, this.options.drawSecret),
      },
      cookie: signAnonCookie(anonId, this.options.drawSecret),
    };
  }

  submit(
    anonId: string,
    request: {
      requestId: string;
      input: unknown;
      mode: MockMode;
      scenario: Scenario;
      reason: 'initial' | 'new';
    },
  ): JobView {
    this.prune();
    this.touch(anonId);
    const existing = this.jobs.get(request.requestId);
    if (existing) {
      if (existing.actor !== anonId)
        throw new PreviewError('REQUEST_OWNERSHIP', 'request belongs to another session', 403);
      return this.view(existing);
    }
    const completed = this.completions.get(request.requestId);
    if (completed) {
      if (completed.actor !== anonId)
        throw new PreviewError('REQUEST_OWNERSHIP', 'request belongs to another session', 403);
      return this.view(completed.job);
    }
    parseRequestId(request.requestId);
    if (
      !['normal', 'fast'].includes(request.mode) ||
      !['random', 'success', 'retry', 'fail'].includes(request.scenario) ||
      !['initial', 'new'].includes(request.reason)
    )
      throw new PreviewError('BAD_REQUEST', 'invalid generation option');
    this.assertInputShape(request.input);
    const validated = validateCardInput(request.input, this.config.input, this.config.playerNames);
    if (!validated.ok || !validated.value)
      throw new PreviewError('INVALID_INPUT', validated.errors.map((e) => e.code).join(','));
    const counts = this.counts(anonId);
    if (
      counts.successfulCount + this.reserved(anonId) >=
      this.config.previewRules.freeSuccessfulCards
    )
      throw new PreviewError('QUOTA_EXHAUSTED', 'no free successful cards remain', 409);
    const pose = routePose(
      {
        position: validated.value.position,
        angle: validated.value.faceDetection.angle,
        handedness: validated.value.handedness,
      },
      this.config.poses,
    );
    const outcome = request.scenario === 'random' ? this.pickOutcome() : request.scenario;
    const identity = this.identities.get(anonId);
    if (!this.makeJobRoom())
      throw new PreviewError('QUEUE_BUSY', 'preview queue is temporarily full', 503);
    const timing = { p50: this.contract.p50, p95: this.contract.p95, fast: this.contract.fast };
    const job: Job = {
      requestId: request.requestId,
      actor: anonId,
      ipHash: identity?.ipHash,
      status: 'pending',
      draw: this.drawService.draw(request.requestId),
      ...pose,
      attempt: 1,
      startedAt: this.now(),
      stageMs: mockLatencyMs(this.random(), request.mode, timing),
      secondStageMs: mockLatencyMs(this.random(), request.mode, timing),
      outcome,
      reserved: true,
      counted: false,
      updatedAt: this.now(),
      retryRecorded: false,
      terminalRecorded: false,
      restored: false,
    };
    this.jobs.set(job.requestId, job);
    this.serverClientEvent(anonId, 'valid_input_submitted', {});
    this.serverClientEvent(anonId, 'generation_requested', {
      generationId: job.requestId,
      reason: request.reason,
      tier: job.draw.tier,
      configVersion: job.draw.configVersion,
    });
    return this.view(job);
  }

  reserveLive(anonId: string, requestId: string, input: unknown, fingerprint: string): { job: JobView; created: boolean } {
    const existing = this.jobs.get(requestId) ?? this.completions.get(requestId)?.job;
    if (existing) {
      if (existing.actor !== anonId) throw new PreviewError('REQUEST_OWNERSHIP', 'request belongs to another session', 403);
      if (existing.liveFingerprint !== fingerprint) throw new PreviewError('REQUEST_MISMATCH', 'requestId is already bound to different input', 409);
      return { job: this.view(existing), created: false };
    }
    if(parseRequestId(requestId).configVersion!==this.config.activeVersion)throw new PreviewError('CONFIG_EXPIRED','抽卡配置已更新，请刷新页面后重新制作。',409);
    this.submit(anonId, { requestId, input, mode: 'normal', scenario: 'success', reason: 'new' });
    const job = this.owned(anonId, requestId);
    job.liveFingerprint = fingerprint;
    job.status = 'pending';
    return { job: this.view(job), created: true };
  }
  providerSucceeded(anonId: string, requestId: string): JobView {
    const job = this.owned(anonId, requestId);
    if (!job.liveFingerprint || job.status !== 'pending') throw new PreviewError('NOT_PENDING', 'generation is no longer pending', 409);
    job.providerReady = true; job.status = 'ready'; job.updatedAt = this.now();
    return this.view(job);
  }
  providerFailed(anonId: string, requestId: string): void {
    const job = this.owned(anonId, requestId);
    job.status = 'failed'; job.errorCode = 'GENERATION_FAILED'; job.reserved = false; job.updatedAt = this.now();
    this.recordTerminal(job);
  }

  poll(anonId: string, requestId: string): JobView {
    this.prune();
    const completed = this.completed(anonId, requestId);
    return completed ? this.view(completed.job) : this.view(this.owned(anonId, requestId));
  }
  complete(anonId: string, requestId: string): JobView {
    this.prune();
    const completed = this.completed(anonId, requestId);
    if (completed) return this.view(completed.job);
    const job = this.owned(anonId, requestId);
    this.advance(job);
    if (job.status === 'complete') return this.view(job);
    if (job.status !== 'ready') throw new PreviewError('NOT_READY', 'artwork is not ready', 409);
    job.status = 'complete';
    job.reserved = false;
    job.updatedAt = this.now();
    if (!job.counted) {
      const identity = this.identity(anonId);
      if (identity.successfulCount >= this.config.previewRules.freeSuccessfulCards)
        throw new PreviewError('QUOTA_EXHAUSTED', 'no free successful cards remain', 409);
      job.counted = true;
      identity.successfulCount += 1;
      identity.successTimes.push(this.now());
      identity.successTimes = identity.successTimes.slice(-3);
      this.completions.set(job.requestId, {
        actor: anonId,
        job: { ...job },
        completedAt: this.now(),
      });
      this.serverClientEvent(anonId, 'card_generated', {
        generationId: job.requestId,
        latencyMs: this.now() - job.startedAt,
        tier: job.draw.tier,
        configVersion: job.draw.configVersion,
      });
      this.serverClientEvent(anonId, 'auto_collected', { generationId: job.requestId });
    }
    return this.view(job);
  }
  renderFailed(anonId: string, requestId: string): JobView {
    this.prune();
    if (this.completed(anonId, requestId))
      throw new PreviewError('ALREADY_COMPLETE', 'completed task cannot fail', 409);
    const job = this.owned(anonId, requestId);
    this.advance(job);
    if (job.status === 'complete')
      throw new PreviewError('ALREADY_COMPLETE', 'completed task cannot fail', 409);
    job.status = 'failed';
    job.errorCode = 'RENDER_FAILED';
    job.reserved = false;
    job.updatedAt = this.now();
    this.recordTerminal(job);
    return this.view(job);
  }
  restore(anonId: string, requestId: string): JobView {
    this.prune();
    const completed = this.completed(anonId, requestId);
    if (completed) return this.view(completed.job);
    const job = this.owned(anonId, requestId);
    this.advance(job);
    if (job.status !== 'failed') return this.view(job);
    if (job.liveFingerprint && (!job.providerReady || job.errorCode !== 'RENDER_FAILED'))
      throw new PreviewError('GENERATION_RETRY_REQUIRES_NEW_REQUEST', 'start a new generation explicitly', 409);
    const counts = this.counts(anonId);
    if (counts.successfulCount + this.reserved(anonId) >= 3)
      throw new PreviewError('QUOTA_EXHAUSTED', 'no free successful cards remain', 409);
    job.status = job.liveFingerprint ? 'ready' : 'pending';
    job.reserved = true;
    job.startedAt = this.now();
    job.stageMs = this.contract.fast;
    job.secondStageMs = this.contract.fast;
    job.outcome = 'success';
    job.attempt += 1;
    job.updatedAt = this.now();
    job.restored = true;
    job.terminalRecorded = false;
    job.errorCode = undefined;
    this.serverClientEvent(anonId, 'generation_restored', {
      generationId: job.requestId,
      tier: job.draw.tier,
      configVersion: job.draw.configVersion,
    });
    return this.view(job);
  }

  acceptEvents(anonId: string, raw: unknown[]): number {
    this.prune();
    this.touch(anonId);
    const allowed = new Set([
      'input_rejected',
      'generation_qa_completed',
      'comparison_requested',
      'share_asset_generated',
      'share_asset_download_triggered',
      'share_longpress_hint_shown',
      'share_intent',
    ]);
    let accepted = 0;
    for (const candidate of raw) {
      try {
        const record = exactKeys(
          candidate,
          [
            'schemaVersion',
            'eventId',
            'actorAnonId',
            'occurredAt',
            'pollution',
            'name',
            'generationId',
            'reason',
            'channel',
            'rejectionCode',
            'latencyMs',
            'qaOutcome',
            'hardVetoCategory',
            'assetType',
            'tier',
            'configVersion',
          ],
          'event',
        );
        const event = acceptClientEvent({ ...record, actorAnonId: anonId });
        if (!allowed.has(event.name)) continue;
        if (this.push(event)) accepted++;
      } catch {
        /* malformed batches are partially accepted */
      }
    }
    return accepted;
  }
  metrics(anonId: string) {
    this.prune();
    this.touch(anonId);
    const visible = this.events
      .map((stored) => stored.event)
      .filter(
        (e) =>
          e.actorAnonId === anonId ||
          (e.name === 'shared_link_opened' && e.referralCreatorAnonId === anonId),
      );
    return {
      metrics: computeMetrics(visible),
      events: visible.map((e) => ({ ...e })),
      volatile: true as const,
    };
  }

  private assertInputShape(input: unknown) {
    const top = exactKeys(
      input,
      [
        'photo',
        'nickname',
        'jerseyNumber',
        'position',
        'handedness',
        'faceDetection',
        'subjectDetection',
        'faceProcessingConsent',
        'photoRightsConfirmed',
        'adultSelfDeclaration',
      ],
      'input',
    );
    const photo = exactKeys(top.photo, ['mimeType', 'byteSize', 'width', 'height'], 'photo');
    for (const forbidden of ['data', 'base64', 'url', 'bytes', 'blob', 'name', 'fileName'])
      if (Object.hasOwn(photo, forbidden))
        throw new PreviewError('IMAGE_UPLOAD_FORBIDDEN', 'image uploads are forbidden');
    exactKeys(top.faceDetection, ['faceCount', 'selectedFaceIndex', 'angle'], 'faceDetection');
    if (top.subjectDetection !== undefined) exactKeys(top.subjectDetection, ['personCount', 'selectedPersonIndex'], 'subjectDetection');
  }
  private pickOutcome(): Exclude<Scenario, 'random'> {
    const value = this.random();
    return value < this.contract.retryRate
      ? 'retry'
      : value < this.contract.retryRate + this.contract.failureRate
        ? 'fail'
        : 'success';
  }
  private identity(actor: string): Identity {
    const identity = this.identities.get(actor);
    if (!identity) throw new PreviewError('SESSION_EXPIRED', 'start a session again', 401);
    identity.lastSeenAt = this.now();
    this.identities.delete(actor);
    this.identities.set(actor, identity);
    return identity;
  }
  private touch(actor: string) {
    this.identity(actor);
  }
  private completed(actor: string, id: string): Completion | undefined {
    const completed = this.completions.get(id);
    if (completed && completed.actor !== actor)
      throw new PreviewError('REQUEST_OWNERSHIP', 'request belongs to another session', 403);
    return completed;
  }
  private owned(actor: string, id: string): Job {
    this.touch(actor);
    const job = this.jobs.get(id);
    if (!job)
      throw new PreviewError(
        'TASK_EXPIRED',
        'task expired; resubmit the same requestId to restore its deterministic draw',
        404,
      );
    if (job.actor !== actor)
      throw new PreviewError('REQUEST_OWNERSHIP', 'request belongs to another session', 403);
    return job;
  }
  private advance(job: Job) {
    if (job.liveFingerprint) return;
    if (job.status === 'complete' || job.status === 'failed' || job.status === 'ready') return;
    const elapsed = this.now() - job.startedAt;
    if (job.outcome === 'success' && elapsed >= job.stageMs) job.status = 'ready';
    else if ((job.outcome === 'retry' || job.outcome === 'fail') && elapsed >= job.stageMs) {
      job.status = 'retrying';
      job.attempt = Math.max(job.attempt, 2);
      if (!job.retryRecorded) {
        job.retryRecorded = true;
        this.serverClientEvent(job.actor, 'generation_retry', {
          generationId: job.requestId,
          tier: job.draw.tier,
          configVersion: job.draw.configVersion,
        });
      }
      if (elapsed >= job.stageMs + job.secondStageMs) {
        if (job.outcome === 'retry') job.status = 'ready';
        else {
          job.status = 'failed';
          job.reserved = false;
          this.recordTerminal(job);
        }
      }
    }
    job.updatedAt = this.now();
  }
  private view(job: Job): JobView {
    this.advance(job);
    const counts = this.counts(job.actor);
    const view: JobView = {
      requestId: job.requestId,
      status: job.status,
      draw: job.draw,
      poseId: job.poseId,
      mirror: job.mirror,
      attempt: job.attempt,
      remaining: counts.remaining,
      successfulCount: counts.successfulCount,
      elapsedMs: Math.max(
        0,
        (job.status === 'complete' ? job.updatedAt : this.now()) - job.startedAt,
      ),
    };
    if (job.status === 'retrying') view.retryAtMs = job.stageMs + job.secondStageMs;
    if (job.status === 'failed')
      view.error =
        job.errorCode ?? (job.outcome === 'fail' ? 'GENERATION_FAILED' : 'RENDER_FAILED');
    return view;
  }
  private counts(actor: string) {
    const successfulCount = this.identities.get(actor)?.successfulCount ?? 0;
    return { successfulCount, remaining: Math.max(0, 3 - successfulCount - this.reserved(actor)) };
  }
  private reserved(actor: string) {
    return [...this.jobs.values()].filter((j) => j.actor === actor && j.reserved).length;
  }
  private serverClientEvent(actor: string, name: string, fields: Record<string, unknown>) {
    this.push(
      acceptClientEvent({
        name,
        eventId: randomUUID(),
        actorAnonId: actor,
        occurredAt: this.iso(),
        ...fields,
      }),
    );
  }
  private recordTerminal(job: Job) {
    if (job.terminalRecorded) return;
    job.terminalRecorded = true;
    this.serverClientEvent(job.actor, 'generation_failed', {
      generationId: job.requestId,
      tier: job.draw.tier,
      configVersion: job.draw.configVersion,
    });
    this.serverClientEvent(job.actor, 'generation_refunded', {
      generationId: job.requestId,
      tier: job.draw.tier,
      configVersion: job.draw.configVersion,
    });
  }
  private push(event: AnalyticsEvent) {
    if (this.eventIds.has(event.eventId)) return false;
    this.eventIds.add(event.eventId);
    this.events.push({ event, receivedAt: this.now() });
    while (this.events.length > this.contract.maximumEvents) {
      const removed = this.events.shift()!;
      this.eventIds.delete(removed.event.eventId);
    }
    return true;
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private observeIp(hash: string, anon: string, newlyIssued: boolean) {
    let visitors = this.ipVisitors.get(hash);
    if (!visitors) {
      while (this.ipVisitors.size >= this.contract.maximumIdentities) {
        const oldest = this.ipVisitors.keys().next().value!;
        this.ipVisitors.delete(oldest);
        for (const flag of this.pollutionFlags)
          if (flag.includes(`:${oldest}`)) this.pollutionFlags.delete(flag);
      }
      visitors = new Map();
    }
    visitors.set(anon, this.now());
    this.ipVisitors.set(hash, visitors);
    const cutoff = this.now() - 3_600_000;
    for (const [id, at] of visitors)
      if (at < cutoff) {
        visitors.delete(id);
        this.pollutionFlags.delete(`aux:${hash}:${id}`);
      }
    if (visitors.size >= 5 && !this.pollutionFlags.has(`main:${hash}`)) {
      this.pollutionFlags.add(`main:${hash}`);
      this.push(
        acceptIpPollutionEvent({
          name: 'ip_pollution_window_flagged',
          eventId: randomUUID(),
          actorAnonId: anon,
          occurredAt: this.iso(),
          windowSeconds: 3600,
          distinctVisitorCount: visitors.size,
          pollution: true,
        }),
      );
    }
    const exhausted = [...this.identities.values()].filter(
      (identity) =>
        identity.anonId !== anon &&
        identity.ipHash === hash &&
        identity.successfulCount >= 3 &&
        identity.successTimes.length >= 3 &&
        identity.successTimes[2]! >= this.now() - 600_000,
    );
    if (newlyIssued && exhausted.length > 0 && !this.pollutionFlags.has(`aux:${hash}:${anon}`)) {
      this.pollutionFlags.add(`aux:${hash}:${anon}`);
      this.push(
        acceptIpPollutionEvent({
          name: 'ip_pollution_after_exhaustion',
          eventId: randomUUID(),
          actorAnonId: anon,
          occurredAt: this.iso(),
          windowSeconds: 600,
          distinctVisitorCount: exhausted.length,
          pollution: true,
        }),
      );
    }
  }
  private makeJobRoom() {
    while (this.jobs.size >= this.contract.maximumJobs) {
      const candidate = [...this.jobs].find(([, job]) => !job.reserved);
      if (!candidate) return false;
      this.jobs.delete(candidate[0]);
    }
    return true;
  }
  private evictIdentity() {
    const candidate = [...this.identities.values()]
      .sort((a, b) => a.lastSeenAt - b.lastSeenAt)
      .find(
        (identity) =>
          ![...this.jobs.values()].some((job) => job.actor === identity.anonId && job.reserved),
      )?.anonId;
    if (!candidate) return false;
    this.identities.delete(candidate);
    for (const [requestId, job] of this.jobs)
      if (job.actor === candidate) this.jobs.delete(requestId);
    for (const [requestId, completion] of this.completions)
      if (completion.actor === candidate) this.completions.delete(requestId);
    this.referralVisitors.delete(candidate);
    return true;
  }
  private prune() {
    const now = this.now();
    for (const job of this.jobs.values())
      if (job.reserved && now - job.updatedAt > this.contract.reservationTimeoutMs) {
        job.reserved = false;
        job.status = 'failed';
        job.errorCode = 'TASK_ABANDONED';
        job.updatedAt = now;
      }
    for (const [id, job] of this.jobs)
      if (!job.reserved && now - job.updatedAt > this.contract.jobRetentionMs) this.jobs.delete(id);
    while (this.jobs.size > this.contract.maximumJobs) {
      const candidate = [...this.jobs].find(([, j]) => !j.reserved);
      if (!candidate) break;
      this.jobs.delete(candidate[0]);
    }
    for (let index = this.events.length - 1; index >= 0; index--) {
      const stored = this.events[index]!;
      if (now - stored.receivedAt > this.contract.eventRetentionMs) {
        this.events.splice(index, 1);
        this.eventIds.delete(stored.event.eventId);
      }
    }
    while (this.events.length > this.contract.maximumEvents) {
      const stored = this.events.shift()!;
      this.eventIds.delete(stored.event.eventId);
    }
    while (this.identities.size > this.contract.maximumIdentities && !this.evictIdentity()) break;
    while (this.completions.size > this.contract.maximumCompletions) {
      const oldest = this.completions.keys().next().value!;
      this.completions.delete(oldest);
    }
    for (const [id, at] of this.referralVisitors)
      if (now - at > this.contract.eventRetentionMs) this.referralVisitors.delete(id);
    for (const [hash, visitors] of this.ipVisitors) {
      for (const [id, at] of visitors)
        if (now - at > 3_600_000) {
          visitors.delete(id);
          this.pollutionFlags.delete(`aux:${hash}:${id}`);
        }
      if (!visitors.size) {
        this.ipVisitors.delete(hash);
        this.pollutionFlags.delete(`main:${hash}`);
      }
    }
  }
}
