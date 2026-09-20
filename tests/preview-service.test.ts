import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PreviewError,
  PreviewService,
  signAnonCookie,
  signReferral,
  verifyAnonCookie,
  verifyReferral,
} from '../src/server/preview-service.js';

const secret = 'draw-secret-that-is-at-least-32-bytes-long';
const salt = 'ip-salt-that-is-also-at-least-32-bytes';
const configDirectory = fileURLToPath(new URL('../config', import.meta.url));
const input = {
  photo: { mimeType: 'image/jpeg', byteSize: 1000, width: 1200, height: 1200 },
  nickname: 'Ace',
  jerseyNumber: '7',
  position: 'PG',
  handedness: 'RIGHT',
  faceDetection: { faceCount: 1, angle: 'F' },
  faceProcessingConsent: true,
  photoRightsConfirmed: true,
  adultSelfDeclaration: true,
};
let idCounter = 1;
const requestId = (first = false) =>
  `${String(idCounter++).padStart(8, '0')}-0000-4000-8000-000000000000:${first ? '1' : '0'}:v0.1.0`;
function harness(randoms: number[] = [], directory = configDirectory) {
  let now = 1_800_000_000_000;
  let i = 0;
  const service = new PreviewService({
    configDirectory: directory,
    drawSecret: secret,
    ipHashSalt: salt,
    now: () => now,
    random: () => randoms[i++] ?? 0.5,
  });
  const opened = service.createSession(undefined, undefined, '1.2.3.4');
  return {
    service,
    session: opened.value,
    cookie: opened.cookie,
    advance: (ms: number) => (now += ms),
  };
}

describe('PreviewService jobs', () => {
  it('reserves three concurrent slots and counts only completed cards', () => {
    const h = harness();
    const jobs = [requestId(true), requestId(), requestId()];
    for (const id of jobs)
      expect(
        h.service.submit(h.session.anonId, {
          requestId: id,
          input,
          mode: 'fast',
          scenario: 'success',
          reason: 'initial',
        }).status,
      ).toBe('pending');
    expect(() =>
      h.service.submit(h.session.anonId, {
        requestId: requestId(),
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'new',
      }),
    ).toThrowError(PreviewError);
    expect(h.service.metrics(h.session.anonId).metrics.successfulRecipients).toBe(0);
    h.advance(500);
    expect(h.service.complete(h.session.anonId, jobs[0]!).successfulCount).toBe(1);
    expect(h.service.complete(h.session.anonId, jobs[0]!).successfulCount).toBe(1);
  });
  it('honors the parsed first-draw flag and replays one request unchanged', () => {
    const h = harness();
    const id = requestId(true);
    const a = h.service.submit(h.session.anonId, {
      requestId: id,
      input,
      mode: 'fast',
      scenario: 'success',
      reason: 'initial',
    });
    const b = h.service.submit(h.session.anonId, {
      requestId: id,
      input: { bad: true },
      mode: 'normal',
      scenario: 'fail',
      reason: 'new',
    });
    expect(a.draw).toEqual(b.draw);
    expect(a.draw.tier).not.toBe('base');
  });
  it('retries once, refunds terminal failure, and restores the same draw without a generation request', () => {
    const h = harness();
    const retry = requestId();
    const failed = requestId();
    h.service.submit(h.session.anonId, {
      requestId: retry,
      input,
      mode: 'fast',
      scenario: 'retry',
      reason: 'initial',
    });
    h.advance(500);
    expect(h.service.poll(h.session.anonId, retry)).toMatchObject({
      status: 'retrying',
      attempt: 2,
    });
    h.advance(500);
    expect(h.service.poll(h.session.anonId, retry).status).toBe('ready');
    const original = h.service.submit(h.session.anonId, {
      requestId: failed,
      input,
      mode: 'fast',
      scenario: 'fail',
      reason: 'initial',
    });
    h.advance(1000);
    expect(h.service.poll(h.session.anonId, failed)).toMatchObject({
      status: 'failed',
      remaining: 2,
    });
    const before = h.service
      .metrics(h.session.anonId)
      .events.filter((e) => e.name === 'generation_requested').length;
    const restored = h.service.restore(h.session.anonId, failed);
    expect(restored.draw).toEqual(original.draw);
    h.advance(500);
    expect(h.service.poll(h.session.anonId, failed).status).toBe('ready');
    expect(
      h.service.metrics(h.session.anonId).events.filter((e) => e.name === 'generation_requested'),
    ).toHaveLength(before);
    expect(
      h.service.metrics(h.session.anonId).events.filter((e) => e.name === 'generation_refunded'),
    ).toHaveLength(1);
  });
  it('uses configured default outcome thresholds independently from latency sampling', () => {
    const retry = harness([0.05, 0.9, 0.9]);
    const retryId = requestId();
    retry.service.submit(retry.session.anonId, {
      requestId: retryId,
      input,
      mode: 'fast',
      scenario: 'random',
      reason: 'initial',
    });
    retry.advance(500);
    expect(retry.service.poll(retry.session.anonId, retryId).status).toBe('retrying');
    const fail = harness([0.12, 0.9, 0.9]);
    const failId = requestId();
    fail.service.submit(fail.session.anonId, {
      requestId: failId,
      input,
      mode: 'fast',
      scenario: 'random',
      reason: 'initial',
    });
    fail.advance(1000);
    expect(fail.service.poll(fail.session.anonId, failId).status).toBe('failed');
    const success = harness([0.2, 0.9, 0.9]);
    const successId = requestId();
    success.service.submit(success.session.anonId, {
      requestId: successId,
      input,
      mode: 'fast',
      scenario: 'random',
      reason: 'initial',
    });
    success.advance(500);
    expect(success.service.poll(success.session.anonId, successId).status).toBe('ready');
  });
  it('strictly rejects extra input and embedded image content', () => {
    const h = harness();
    expect(() =>
      h.service.submit(h.session.anonId, {
        requestId: requestId(),
        input: { ...input, extra: true },
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      }),
    ).toThrow(/unexpected field/);
    expect(() =>
      h.service.submit(h.session.anonId, {
        requestId: requestId(),
        input: { ...input, photo: { ...input.photo, data: 'base64' } },
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      }),
    ).toThrow(/unexpected field/);
  });
  it('preserves completed quota and idempotency after the full job is pruned while identity lives', () => {
    const h = harness();
    const id = requestId();
    h.service.submit(h.session.anonId, {
      requestId: id,
      input,
      mode: 'fast',
      scenario: 'success',
      reason: 'initial',
    });
    h.advance(500);
    h.service.complete(h.session.anonId, id);
    h.advance(43_200_000);
    h.service.createSession(signAnonCookie(h.session.anonId, secret), undefined, '1.2.3.4');
    h.advance(43_200_001);
    expect(h.service.poll(h.session.anonId, id)).toMatchObject({
      status: 'complete',
      successfulCount: 1,
    });
    expect(h.service.complete(h.session.anonId, id)).toMatchObject({
      status: 'complete',
      successfulCount: 1,
    });
    expect(
      h.service.submit(h.session.anonId, {
        requestId: id,
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      }),
    ).toMatchObject({ status: 'complete', successfulCount: 1 });
  });
  it('preserves successful quota across ordinary idle cleanup', () => {
    const h = harness();
    const ids = [requestId(), requestId(), requestId()];
    for (const id of ids) {
      h.service.submit(h.session.anonId, {
        requestId: id,
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      });
      h.advance(500);
      h.service.complete(h.session.anonId, id);
    }
    h.advance(86_400_001);
    expect(h.service.createSession(h.cookie, undefined, '1.2.3.4').value).toMatchObject({
      successfulCount: 3,
      remaining: 0,
    });
  });
  it('evicts completed full-job records at capacity while keeping tombstones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-config-'));
    cpSync(configDirectory, dir, { recursive: true });
    const path = join(dir, 'generation_contract.json');
    const contract = JSON.parse(readFileSync(path, 'utf8'));
    contract.maximumJobs = 2;
    writeFileSync(path, JSON.stringify(contract));
    const h = harness([], dir);
    for (let i = 0; i < 2; i++) {
      const actor = h.service.createSession(undefined, undefined, `${i}.0.0.1`).value;
      const id = requestId();
      h.service.submit(actor.anonId, {
        requestId: id,
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      });
      h.advance(500);
      h.service.complete(actor.anonId, id);
    }
    const fresh = h.service.createSession(undefined, undefined, '3.0.0.1').value;
    expect(
      h.service.submit(fresh.anonId, {
        requestId: requestId(),
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      }).status,
    ).toBe('pending');
  });
  it('expires abandoned reservations, releases quota, and preserves the original draw for restore', () => {
    const h = harness();
    const id = requestId();
    const original = h.service.submit(h.session.anonId, {
      requestId: id,
      input,
      mode: 'normal',
      scenario: 'success',
      reason: 'initial',
    });
    h.advance(1_800_001);
    expect(h.service.poll(h.session.anonId, id)).toMatchObject({
      status: 'failed',
      error: 'TASK_ABANDONED',
      remaining: 3,
    });
    expect(h.service.restore(h.session.anonId, id).draw).toEqual(original.draw);
  });
});

describe('signed identity, referrals, events, and IP aggregates', () => {
  it('signs and verifies cookies and references and rejects tampering', () => {
    const anon = '10000000-0000-4000-8000-000000000000';
    const cookie = signAnonCookie(anon, secret);
    const ref = signReferral(anon, secret);
    expect(verifyAnonCookie(cookie, secret)).toBe(anon);
    expect(verifyReferral(ref, secret)).toBe(anon);
    expect(verifyAnonCookie(cookie + 'x', secret)).toBeUndefined();
    expect(verifyReferral(ref + 'x', secret)).toBeUndefined();
  });
  it('records a valid referral once, excludes self, ignores forged refs, and accepts a signed creator absent locally', () => {
    const h = harness();
    const creator = h.session.anonId;
    const ref = signReferral(creator, secret);
    const visitor = h.service.createSession(undefined, ref, '2.2.2.2');
    h.service.createSession(visitor.cookie, ref, '2.2.2.2');
    h.service.createSession(signAnonCookie(creator, secret), ref, '1.2.3.4');
    h.service.createSession(undefined, ref + 'x', '3.3.3.3');
    expect(
      h.service.metrics(creator).events.filter((e) => e.name === 'shared_link_opened'),
    ).toHaveLength(1);
    const remoteCreator = '20000000-0000-4000-8000-000000000000';
    h.service.createSession(undefined, signReferral(remoteCreator, secret), '4.4.4.4');
    h.service.createSession(signAnonCookie(remoteCreator, secret), undefined, '5.5.5.5');
    expect(
      h.service.metrics(remoteCreator).events.filter((e) => e.name === 'shared_link_opened'),
    ).toHaveLength(1);
  });
  it('sanitizes actor identity, rejects trusted spoofing, deduplicates, and exposes no raw IP', () => {
    const h = harness();
    const event = {
      name: 'share_intent',
      eventId: 'evt',
      actorAnonId: 'spoof',
      occurredAt: new Date(1_800_000_000_000).toISOString(),
      generationId: 'g',
      channel: 'copy_link',
    };
    expect(
      h.service.acceptEvents(h.session.anonId, [
        event,
        event,
        { ...event, eventId: 'trusted', name: 'shared_link_opened' },
      ]),
    ).toBe(1);
    const visible = h.service.metrics(h.session.anonId);
    expect(visible.events.find((e) => e.eventId === 'evt')?.actorAnonId).toBe(h.session.anonId);
    expect(JSON.stringify(visible)).not.toMatch(/1\.2\.3\.4|ipHash|rawIp/);
  });
  it('rejects client collection lifecycle spoofing', () => {
    const h = harness();
    const occurredAt = new Date(1_800_000_000_000).toISOString();
    expect(
      h.service.acceptEvents(h.session.anonId, [
        {
          name: 'auto_collected',
          eventId: 'fake-collection',
          actorAnonId: 'spoof',
          occurredAt,
          generationId: 'fake',
        },
      ]),
    ).toBe(0);
  });
  it('expires events by server receipt time even when client timestamps are future dated', () => {
    const h = harness();
    const event = (eventId: string, occurredAt: string) => ({
      name: 'share_intent',
      eventId,
      actorAnonId: 'x',
      occurredAt,
      generationId: 'g',
      channel: 'copy_link',
    });
    expect(
      h.service.acceptEvents(h.session.anonId, [
        event('future', '2099-01-01T00:00:00.000Z'),
        event('normal', '2027-01-01T00:00:00.000Z'),
      ]),
    ).toBe(2);
    h.advance(86_400_001);
    expect(
      h.service
        .metrics(h.session.anonId)
        .events.some((e) => e.eventId === 'future' || e.eventId === 'normal'),
    ).toBe(false);
  });
  it('emits the main IP signal exactly at five distinct anonymous IDs', () => {
    const h = harness();
    for (let i = 0; i < 4; i++) h.service.createSession(undefined, undefined, '9.9.9.9');
    expect(
      h.service
        .metrics(h.session.anonId)
        .events.filter((e) => e.name === 'ip_pollution_window_flagged'),
    ).toHaveLength(0);
    const fifth = h.service.createSession(undefined, undefined, '9.9.9.9').value;
    expect(
      h.service
        .metrics(fifth.anonId)
        .events.filter((e) => e.name === 'ip_pollution_window_flagged'),
    ).toHaveLength(1);
    h.service.createSession(undefined, undefined, '9.9.9.9');
    expect(
      h.service
        .metrics(fifth.anonId)
        .events.filter((e) => e.name === 'ip_pollution_window_flagged'),
    ).toHaveLength(1);
  });
  it('emits the auxiliary signal only when a new identity follows one identity with three recent successes', () => {
    const h = harness();
    const exhausted = h.service.createSession(undefined, undefined, '8.8.8.8');
    for (let i = 0; i < 3; i++) {
      const id = requestId();
      h.service.submit(exhausted.value.anonId, {
        requestId: id,
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      });
      h.advance(500);
      h.service.complete(exhausted.value.anonId, id);
    }
    h.service.createSession(exhausted.cookie, undefined, '8.8.8.8');
    expect(
      h.service
        .metrics(exhausted.value.anonId)
        .events.filter((e) => e.name === 'ip_pollution_after_exhaustion'),
    ).toHaveLength(0);
    const newcomer = h.service.createSession(undefined, undefined, '8.8.8.8').value;
    expect(
      h.service
        .metrics(newcomer.anonId)
        .events.filter((e) => e.name === 'ip_pollution_after_exhaustion'),
    ).toHaveLength(1);
  });
  it('does not treat an existing identity moving to the exhausted IP as newly issued', () => {
    const h = harness();
    const existing = h.service.createSession(undefined, undefined, '7.7.7.7');
    const exhausted = h.service.createSession(undefined, undefined, '8.8.4.4');
    for (let i = 0; i < 3; i++) {
      const id = requestId();
      h.service.submit(exhausted.value.anonId, {
        requestId: id,
        input,
        mode: 'fast',
        scenario: 'success',
        reason: 'initial',
      });
      h.advance(500);
      h.service.complete(exhausted.value.anonId, id);
    }
    h.service.createSession(existing.cookie, undefined, '8.8.4.4');
    expect(
      h.service
        .metrics(existing.value.anonId)
        .events.filter((e) => e.name === 'ip_pollution_after_exhaustion'),
    ).toHaveLength(0);
  });
});

it('accepts actual client validation and manual QA observations while rejecting collection spoofing', () => {
  const h = harness();
  const base = {
    actorAnonId: h.session.anonId,
    occurredAt: new Date(1_800_000_000_000).toISOString(),
  };
  expect(
    h.service.acceptEvents(h.session.anonId, [
      {
        ...base,
        name: 'input_rejected',
        eventId: 'input-observed',
        rejectionCode: 'NICKNAME_REQUIRED',
      },
      {
        ...base,
        name: 'generation_qa_completed',
        eventId: 'qa-observed',
        generationId: requestId(),
        qaOutcome: 'pass',
      },
    ]),
  ).toBe(2);
  expect(h.service.metrics(h.session.anonId).events.map((e) => e.name)).toContain(
    'generation_qa_completed',
  );
  expect(
    h.service.acceptEvents(h.session.anonId, [
      { ...base, name: 'auto_collected', eventId: 'collection-spoof', generationId: requestId() },
    ]),
  ).toBe(0);
});
