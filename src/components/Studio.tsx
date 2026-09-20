'use client';
import { useEffect, useRef, useState } from 'react';
import layoutJson from '../../config/layout.json';
import effectJson from '../../config/effect.json';
import inputJson from '../../config/input_schema.json';
import namesJson from '../../config/player_names.json';
import storiesJson from '../../config/story_templates.json';
import {
  validateCardInput,
  validateInputConfig,
  validatePlayerNamesConfig,
  type CardInput,
  type Position,
  type Handedness,
} from '../core/input';
import { buildStory, validateStoryConfig } from '../core/story';
import type { CardData, Layout, Effect, Tier } from '../render/types';
import type { JobView } from '../server/preview-service';
import { renderCard } from '../render/layout';
import { composeShare, type AssetType } from '../render/sharing';
import { loadImage, isWeChat, downloadBlob } from '../platform/web';
import { api, ApiError } from '../platform/api';
import {
  decodePhoto,
  detectFaces,
  releasePhoto,
  type PreparedPhoto,
  type DetectedFace,
} from '../platform/photo';
import { MockGenerator, ManualArtworkEvaluator } from '../generator';
import CardView from './CardView';
const layout = layoutJson as Layout,
  effect = effectJson as Effect,
  inputConfig = validateInputConfig(inputJson),
  names = validatePlayerNamesConfig(namesJson),
  stories = validateStoryConfig(storiesJson);
const positions: Record<Position, string> = {
  PG: '控球后卫',
  SG: '得分后卫',
  SF: '小前锋',
  PF: '大前锋',
  C: '中锋',
};
type Session = {
  anonId: string;
  configVersion: string;
  remaining: number;
  successfulCount: number;
  refToken: string;
};
type Result = {
  front: string;
  back: string;
  card: HTMLCanvasElement;
  data: CardData;
  tier: Tier;
  requestId: string;
};
const issueText: Record<string, string> = {
  NICKNAME_REQUIRED: '给自己起一个卡面昵称。',
  NICKNAME_FORMAT_INVALID: '昵称请用 1–6 个汉字，或 1–14 个英文字母（可含空格）。',
  NICKNAME_PLAYER_NAME: '请换一个属于自己的昵称，不使用球员姓名或别名。',
  JERSEY_NUMBER_REQUIRED: '填上你的球衣号码。',
  JERSEY_NUMBER_INVALID: '球衣号码需要 1–2 位数字。',
  POSITION_REQUIRED: '选择你的场上位置。',
  HANDEDNESS_REQUIRED: '选择你的惯用手。',
  FACE_CONSENT_REQUIRED: '需要单独同意本地人脸处理后继续。',
  PHOTO_RIGHTS_REQUIRED: '请确认这张照片可供你使用。',
  ADULT_DECLARATION_REQUIRED: '当前内部预览仅面向年满 18 岁的本人。',
  SUBJECT_SELECTION_REQUIRED: '请先在照片中选择你自己。',
};
export default function Studio() {
  const [qaNote, setQaNote] = useState('');
  const [step, setStep] = useState<'home' | 'input' | 'processing' | 'result'>('home'),
    [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(''),
    [photo, setPhoto] = useState<PreparedPhoto | null>(null),
    [faces, setFaces] = useState<DetectedFace[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [rights, setRights] = useState(false),
    [adult, setAdult] = useState(false),
    [nickname, setNickname] = useState(''),
    [number, setNumber] = useState(''),
    [position, setPosition] = useState<Position | ''>(''),
    [hand, setHand] = useState<Handedness | ''>(''),
    [mode, setMode] = useState<'normal' | 'fast'>('normal'),
    [scenario, setScenario] = useState<'random' | 'success' | 'retry' | 'fail'>('random'),
    [job, setJob] = useState<JobView | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [selectedTier, setSelectedTier] = useState<Tier>('prism'),
    [exampleFront, setExampleFront] = useState('/assets/examples/card-2.png'),
    [exampleBack, setExampleBack] = useState(''),
    [asset, setAsset] = useState<{ url: string; blob: Blob; type: AssetType } | null>(null),
    [assetBusy, setAssetBusy] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [debug, setDebug] = useState(false),
    [metrics, setMetrics] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    savedInput = useRef<CardInput | null>(null),
    photoRef = useRef<PreparedPhoto | null>(null),
    runLock = useRef(false),
    sessionPromise = useRef<Promise<Session> | null>(null),
    pendingRequest = useRef<string | null>(null),
    requestStart = useRef(0);
  function initialize() {
    if (sessionPromise.current) return sessionPromise.current;
    const ref = new URLSearchParams(location.search).get('ref');
    const promise = api<Session>({ action: 'session', ...(ref ? { ref } : {}) })
      .then((s) => {
        setSession(s);
        try {
          localStorage.setItem('blueprint.anonId', s.anonId);
        } catch {}
        return s;
      })
      .catch((e) => {
        sessionPromise.current = null;
        throw e;
      });
    sessionPromise.current = promise;
    return promise;
  }
  useEffect(() => {
    void initialize().catch(() => setError('预览服务暂时未连接，点「做我的篮球卡」时会重试。'));
    return () => {
      if (photoRef.current) releasePhoto(photoRef.current);
    };
  }, []);
  useEffect(() => {
    if (step !== 'processing') return;
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - requestStart.current) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [step]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const art = await loadImage('/assets/examples/art-2.jpg');
      const data: CardData = {
        nickname: '林一',
        jerseyNumber: '07',
        position: '控球后卫',
        handedness: '右手',
        cardId: 'EXAMPLE · DESIGN PREVIEW',
        aiLabel: 'AI 合成示例 / 内部预览',
        tierName: effect.materials.find((m) => m.id === selectedTier)!.label,
        story: '林一身披07号，以控球后卫视角阅读球场。每次移动都变成下一次选择的起点。',
        seriesName: 'BLUEPRINT',
        issuedAt: '',
      };
      const front = await renderCard(layout, effect, data, art, selectedTier, 'front', false),
        back = await renderCard(layout, effect, data, art, selectedTier, 'back', false);
      if (active) {
        setExampleFront(front.toDataURL());
        setExampleBack(back.toDataURL());
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedTier]);
  async function track(name: string, fields: Record<string, unknown> = {}) {
    if (!session) return;
    try {
      await api({
        action: 'events',
        events: [
          {
            name,
            eventId: crypto.randomUUID(),
            actorAnonId: session.anonId,
            occurredAt: new Date().toISOString(),
            ...(result ? { generationId: result.requestId } : {}),
            ...fields,
          },
        ],
      });
    } catch {
      /* previews stay usable if analytics unavailable */
    }
  }
  async function start() {
    setError('');
    try {
      if (!session) await initialize();
      pendingRequest.current = null;
      setJob(null);
      setResult(null);
      setStep('input');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('服务暂时连接不上，请稍后重试。');
    }
  }
  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    setFaces([]);
    setSelected(null);
    try {
      const p = await decodePhoto(file);
      if (photoRef.current) releasePhoto(photoRef.current);
      photoRef.current = p;
      setPhoto(p);
      if (consent) await scan(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : '照片读取失败');
    } finally {
      setBusy(false);
    }
  }
  async function scan(p: PreparedPhoto) {
    setBusy(true);
    try {
      const f = await detectFaces(p);
      setFaces(f);
      setSelected(f.length === 1 ? 0 : null);
      if (!f.length) setError('还没找到人脸。换一张能看到脸部的照片再试试。');
      else setError('');
    } catch {
      setError('本地人脸识别未能加载，请重试或换一个浏览器。');
    } finally {
      setBusy(false);
    }
  }
  async function setFaceConsent(checked: boolean) {
    setConsent(checked);
    if (checked && photo) await scan(photo);
    if (!checked) {
      setFaces([]);
      setSelected(null);
    }
  }
  async function prepareResult(j: JobView) {
    if (!photo || selected === null || !faces[selected] || !savedInput.current)
      throw new Error('照片只保留在当前页面，请重新选择照片。');
    const i = savedInput.current;
    const art = await new MockGenerator().generate(
      { photo, face: faces[selected]! },
      layout.templateVersion,
      j.poseId,
      j.mirror,
      j.draw,
    );
    await new ManualArtworkEvaluator().evaluate(art);
    const tier = j.draw.tier as Tier;
    const data: CardData = {
      nickname: i.nickname,
      jerseyNumber: i.jerseyNumber,
      position: positions[i.position],
      handedness: i.handedness === 'LEFT' ? '左手' : '右手',
      cardId: j.draw.cardId,
      aiLabel: 'AI 辅助合成 / 开发预览',
      tierName: effect.materials.find((m) => m.id === tier)!.label,
      story: buildStory(
        {
          nickname: i.nickname,
          jerseyNumber: i.jerseyNumber,
          position: i.position,
          templateIndex: 0,
        },
        stories,
      ),
      seriesName: 'BLUEPRINT',
      issuedAt: new Date().toISOString(),
    };
    const front = await renderCard(layout, effect, data, art.canvas, tier, 'front', false),
      back = await renderCard(layout, effect, data, art.canvas, tier, 'back', false),
      card = await renderCard(layout, effect, data, art.canvas, tier, 'front', true);
    const complete =
      j.status === 'complete'
        ? j
        : await api<JobView>({ action: 'complete', requestId: j.requestId });
    setJob(complete);
    setSession((s) =>
      s ? { ...s, remaining: complete.remaining, successfulCount: complete.successfulCount } : s,
    );
    setResult({
      front: front.toDataURL(),
      back: back.toDataURL(),
      card,
      data,
      tier,
      requestId: j.requestId,
    });
    setStep('result');
  }
  async function run(j: JobView) {
    if (runLock.current) return;
    runLock.current = true;
    requestStart.current = Date.now();
    setElapsed(0);
    setStep('processing');
    setError('');
    setJob(j);
    try {
      let current = j,
        expiredRestarts = 0;
      while (current.status === 'pending' || current.status === 'retrying') {
        await new Promise((r) => setTimeout(r, mode === 'fast' ? 250 : 1000));
        try {
          current = await api<JobView>({ action: 'poll', requestId: j.requestId });
        } catch (e) {
          if (
            e instanceof ApiError &&
            e.code === 'TASK_EXPIRED' &&
            savedInput.current &&
            expiredRestarts++ < 3
          )
            current = await api<JobView>({
              action: 'submit',
              requestId: j.requestId,
              input: savedInput.current,
              mode,
              scenario,
              reason: 'initial',
            });
          else throw e;
        }
        setJob(current);
      }
      if (current.status === 'failed') {
        setSession((s) =>
          s ? { ...s, remaining: current.remaining, successfulCount: current.successfulCount } : s,
        );
        setError('这次画面没有完成，次数已返还。恢复会保留本次材质。');
        return;
      }
      await prepareResult(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成暂时中断，请恢复本次任务。');
      try {
        const failed = await api<JobView>({ action: 'render-failed', requestId: j.requestId });
        setJob(failed);
        setSession((s) => (s ? { ...s, remaining: failed.remaining } : s));
      } catch {}
    } finally {
      runLock.current = false;
    }
  }
  async function submit() {
    if (busy || !session) return;
    setError('');
    if (!photo) {
      setError('先选一张自己的照片。');
      return;
    }
    const i: unknown = {
      photo: photo.metadata,
      nickname,
      jerseyNumber: number,
      position,
      handedness: hand,
      faceDetection: {
        faceCount: faces.length,
        ...(selected === null ? {} : { selectedFaceIndex: selected }),
        angle: selected === null ? 'UNCERTAIN' : (faces[selected]?.angle ?? 'UNCERTAIN'),
      },
      faceProcessingConsent: consent,
      photoRightsConfirmed: rights,
      adultSelfDeclaration: adult,
    };
    const checked = validateCardInput(i, inputConfig, names);
    if (!checked.ok || !checked.value) {
      const first = checked.errors[0]!;
      setError(issueText[first.code] ?? '请完成照片识别和所有信息。');
      void track('input_rejected', { rejectionCode: first.code });
      return;
    }
    if (
      pendingRequest.current &&
      savedInput.current &&
      JSON.stringify(savedInput.current) !== JSON.stringify(checked.value)
    )
      pendingRequest.current = null;
    savedInput.current = checked.value;
    setBusy(true);
    try {
      const requestId =
        pendingRequest.current ??
        `${crypto.randomUUID()}:${session.successfulCount === 0 ? '1' : '0'}:${session.configVersion}`;
      pendingRequest.current = requestId;
      const j = await api<JobView>({
        action: 'submit',
        requestId,
        input: checked.value,
        mode,
        scenario,
        reason: session.successfulCount === 0 ? 'initial' : 'new',
      });
      await run(j);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'QUOTA_EXHAUSTED'
          ? '本轮 3 张免费卡已制作完成。'
          : e instanceof Error
            ? e.message
            : '提交失败，请再试一次。',
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!job || runLock.current) return;
    try {
      let j: JobView;
      try {
        j = await api<JobView>({ action: 'restore', requestId: job.requestId });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'TASK_EXPIRED' && savedInput.current)
          j = await api<JobView>({
            action: 'submit',
            requestId: job.requestId,
            input: savedInput.current,
            mode,
            scenario: 'success',
            reason: 'initial',
          });
        else throw e;
      }
      await run(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复失败');
    }
  }
  async function share(type: AssetType) {
    if (!result || !session || assetBusy) return;
    setAssetBusy(true);
    setError('');
    if (type === 'comparison') void track('comparison_requested', { assetType: type });
    else void track('share_intent', { assetType: type, channel: 'panel' });
    try {
      const url = new URL('/', location.origin);
      url.searchParams.set('ref', session.refToken);
      const composed = await composeShare(
        type,
        result.card,
        photo?.image ?? null,
        result.data.nickname,
        url.href,
        layout.canvas.dpi,
        layout.templateVersion,
      );
      if (asset) URL.revokeObjectURL(asset.url);
      setAsset({ url: URL.createObjectURL(composed.blob), blob: composed.blob, type });
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片合成失败');
    } finally {
      setAssetBusy(false);
    }
  }
  function assetShown() {
    if (!asset) return;
    void track('share_asset_generated', { assetType: asset.type });
    if (isWeChat()) void track('share_longpress_hint_shown', { assetType: asset.type });
  }
  function download() {
    if (!asset || !result) return;
    downloadBlob(asset.blob, `蓝本-${result.data.nickname}-${asset.type}.png`);
    void track('share_asset_download_triggered', { assetType: asset.type });
  }
  function newCard() {
    pendingRequest.current = null;
    setJob(null);
    setError('');
    setStep('input');
    setResult(null);
    setQaNote('');
    if (asset) URL.revokeObjectURL(asset.url);
    setAsset(null);
  }
  async function showMetrics() {
    setDebug(!debug);
    if (!debug)
      try {
        setMetrics(await api({ action: 'metrics' }));
      } catch {
        setMetrics({ message: '暂时没有可用数据' });
      }
  }
  return (
    <>
      <header className="site-header">
        <a href="/" className="wordmark">
          <b>B.</b>
          <span>
            蓝本<small>BLUEPRINT</small>
          </span>
        </a>
        <nav>
          <a href="#how">制作方式</a>
          <a href="#materials">材质图鉴</a>
          <a href="/debug/thumbnails">缩略图评审 ↗</a>
        </nav>
        <span className="preview-badge">
          <i />
          内部设计预览
        </span>
      </header>
      <main>
        {step === 'home' ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">YOUR GAME. YOUR CARD.</div>
                <h1>
                  不必是球星。
                  <br />
                  你，就是<span>主角。</span>
                </h1>
                <p className="lead">
                  把你的球场时刻，做成一张值得珍藏的篮球卡。
                  <br className="desktop" />
                  留住自己，也分享给一起上场的人。
                </p>
                <button className="primary hero-cta" onClick={start}>
                  做我的篮球卡 <span>↗</span>
                </button>
                <p className="cta-note">免费制作 3 张 · 无需登录 · 首张必得闪卡</p>
                <div className="hero-foot">
                  <span className="little-ball">◉</span>
                  <span>每一个上场的你，都值得一张。</span>
                </div>
              </div>
              <div className="hero-gallery" aria-label="三张示例成品卡">
                <div className="gallery-label">
                  BLUEPRINT ORIGINALS <span>VOL. 01</span>
                </div>
                <img
                  className="sample sample-left"
                  src="/assets/examples/card-1.png"
                  alt="林一的银折示例篮球卡"
                />
                <img
                  className="sample sample-right"
                  src="/assets/examples/card-3.png"
                  alt="小野的金箔示例篮球卡"
                />
                <img
                  className="sample sample-center"
                  src="/assets/examples/card-2.png"
                  alt="阿澈的棱镜示例篮球卡"
                />
                <div className="gallery-caption">
                  <span>01 / 03</span>
                  <span>初版示例 · AI 合成画面</span>
                  <span>↙ 看见你的另一面</span>
                </div>
              </div>
            </section>
            <section className="how" id="how">
              <div className="section-kicker">从照片，到你的主场</div>
              <div className="how-grid">
                {[
                  ['01', '一张你自己的照片', '清晰看到脸部就好，球场内外都可以。'],
                  ['02', '一点属于你的信息', '昵称、号码、位置和惯用手。'],
                  ['03', '揭晓你的第一张卡', '看看反光、翻到背面，再把它分享出去。'],
                ].map(([n, t, d]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="materials" id="materials">
              <div className="material-copy">
                <div className="eyebrow">FIVE FINISHES. ONE YOU.</div>
                <h2>
                  同一个你，
                  <br />
                  不同的<span>光。</span>
                </h2>
                <p>
                  基础的克制、银折的清亮、棱镜的变幻。
                  <br />
                  选一种看看，轻轻拖动卡面。
                </p>
                <div className="material-list">
                  {effect.materials.map((m) => (
                    <button
                      key={m.id}
                      className={selectedTier === m.id ? 'selected' : ''}
                      onClick={() => setSelectedTier(m.id)}
                    >
                      <i className={`swatch ${m.id}`} />
                      {m.label}
                      <span>{selectedTier === m.id ? '↗' : '＋'}</span>
                    </button>
                  ))}
                </div>
                <small>这里只是材质预览；制作时由系统揭晓你的卡。</small>
              </div>
              <div className="material-demo">
                <CardView front={exampleFront} back={exampleBack} tier={selectedTier} />
              </div>
            </section>
          </>
        ) : (
          <section className="studio-section">
            <div className="studio-heading">
              <button
                className="text-button"
                onClick={() => {
                  if (step !== 'processing') setStep('home');
                }}
              >
                ← 返回首页
              </button>
              <div className="steps">
                <span className={step === 'input' ? 'active' : ''}>01 你的信息</span>
                <i />
                <span className={step === 'processing' ? 'active' : ''}>02 制作中</span>
                <i />
                <span className={step === 'result' ? 'active' : ''}>03 你的篮球卡</span>
              </div>
              <span className="remaining">{session?.remaining ?? 3} 次可用</span>
            </div>
            {step === 'input' && (
              <div className="editor">
                <div className="editor-form">
                  <div className="eyebrow">THE NEXT CARD IS YOURS.</div>
                  <h1>
                    先认识一下，
                    <br />
                    今天的<span>主角。</span>
                  </h1>
                  <p className="muted">不用准备标准照。能看见你的脸，就能开始。</p>
                  <div className="field">
                    <label>01 / 你的照片</label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/heic,.heic,.heif"
                      hidden
                      onChange={(e) => void chooseFile(e.target.files?.[0])}
                    />
                    <button
                      className={`upload-box ${photo ? 'has-photo' : ''}`}
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                    >
                      {photo ? (
                        <>
                          <img src={photo.objectUrl} alt="本地照片预览" />
                          <span>重新选择照片 ↗</span>
                        </>
                      ) : (
                        <>
                          <b>＋</b>
                          <strong>选择一张自己的照片</strong>
                          <span>JPG / PNG / HEIC · 不超过 10 MB</span>
                        </>
                      )}
                    </button>
                    {photo && Math.min(photo.metadata.width, photo.metadata.height) < 1024 && (
                      <small className="warning">清晰度可能不足，仍可继续。</small>
                    )}
                    {consent && photo && (
                      <small>
                        {busy
                          ? '正在本机识别人脸…'
                          : faces.length
                            ? `识别到 ${faces.length} 张脸${faces.length === 1 ? '，已选为主体。' : '，请选择你自己。'}`
                            : '等待识别人脸'}
                      </small>
                    )}
                    {faces.length > 1 && (
                      <div className="face-options">
                        {faces.map((face, i) => (
                          <button
                            key={i}
                            className={selected === i ? 'chosen' : ''}
                            onClick={() => setSelected(i)}
                          >
                            <span
                              className="face-crop"
                              style={{
                                backgroundImage: `url(${photo?.objectUrl})`,
                                backgroundSize: `${100 / face.w}% ${100 / face.h}%`,
                                backgroundPosition: `${(face.x / (1 - face.w)) * 100}% ${(face.y / (1 - face.h)) * 100}%`,
                              }}
                            />
                            第 {i + 1} 位{selected === i ? ' ✓' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="fields-grid">
                    <div className="field">
                      <label htmlFor="nickname">02 / 卡面昵称</label>
                      <input
                        id="nickname"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="你希望大家怎么叫你"
                        maxLength={20}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="number">03 / 球衣号码</label>
                      <input
                        id="number"
                        inputMode="numeric"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="00–99"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>04 / 场上位置</label>
                    <div className="position-options">
                      {(Object.entries(positions) as [Position, string][]).map(([p, label]) => (
                        <button
                          className={position === p ? 'chosen' : ''}
                          onClick={() => setPosition(p)}
                          key={p}
                        >
                          <b>{p}</b>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>05 / 惯用手</label>
                    <div className="hand-options">
                      <button
                        className={hand === 'LEFT' ? 'chosen' : ''}
                        onClick={() => setHand('LEFT')}
                      >
                        左手
                      </button>
                      <button
                        className={hand === 'RIGHT' ? 'chosen' : ''}
                        onClick={() => setHand('RIGHT')}
                      >
                        右手
                      </button>
                    </div>
                  </div>
                  <div className="consents">
                    <label>
                      <input
                        type="checkbox"
                        checked={rights}
                        onChange={(e) => setRights(e.target.checked)}
                      />
                      我确认照片为本人，且有权使用。
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={adult}
                        onChange={(e) => setAdult(e.target.checked)}
                      />
                      我已年满 18 岁，参与本次内部预览。
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => void setFaceConsent(e.target.checked)}
                      />
                      我单独同意在本机检测、裁剪我的人脸，用于这张篮球卡。
                    </label>
                  </div>
                  <p className="privacy-note">
                    照片和成品仅在当前浏览器处理。关闭或刷新页面后，请重新选择照片。
                  </p>
                  <button
                    className="primary full"
                    disabled={busy || !session || session.remaining === 0}
                    onClick={() => void submit()}
                  >
                    {busy
                      ? '正在处理…'
                      : session?.remaining === 0
                        ? '本轮免费次数已用完'
                        : '制作我的篮球卡'}
                    <span>↗</span>
                  </button>
                  <details className="review-settings">
                    <summary>内部评审设置</summary>
                    <label>
                      生成速度
                      <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                        <option value="normal">正常模拟（中位约 12 秒）</option>
                        <option value="fast">快速预览（0.5 秒）</option>
                      </select>
                    </label>
                    <label>
                      生成结果
                      <select
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value as typeof scenario)}
                      >
                        <option value="random">随机模拟（15% 失败路径）</option>
                        <option value="success">直接完成</option>
                        <option value="retry">失败一次后自动恢复</option>
                        <option value="fail">失败并返还次数</option>
                      </select>
                    </label>
                  </details>
                </div>
                <aside className="editor-preview">
                  <div className="eyebrow">YOUR FIRST EDITION</div>
                  <img src="/assets/examples/card-2.png" alt="设计示例卡" />
                  <p>这张示例，下一张是你。</p>
                  <small>
                    当前用本地合成画面验证流程，
                    <br />
                    尚未接入真实图像生成。
                  </small>
                </aside>
              </div>
            )}
            {step === 'processing' && (
              <div className="processing">
                <div className="progress-art">
                  <span>B.</span>
                  <div className="orbit" />
                </div>
                <div className="eyebrow">YOUR MOMENT IS TAKING SHAPE.</div>
                <h1>
                  {job?.status === 'failed'
                    ? '这一回合，稍作调整。'
                    : job?.status === 'retrying'
                      ? '再打磨一次。'
                      : '把这一刻，制成你的卡。'}
                </h1>
                <p>
                  {job?.status === 'failed'
                    ? '本次抽到的材质已保留，恢复时不会重新抽取。'
                    : job?.status === 'retrying'
                      ? '正在用同一张卡的材质自动重试，不额外扣次数。'
                      : '画面在你的浏览器内合成。稍等，马上揭晓。'}
                </p>
                <span className="elapsed">
                  {elapsed} 秒 · {job?.attempt && job.attempt > 1 ? '已自动重试 1 次' : '正在制作'}
                </span>
                {(job?.status === 'failed' || error) && (
                  <div className="recovery">
                    <button className="primary" onClick={() => void restore()}>
                      恢复这张卡 ↗
                    </button>
                    <button className="secondary" onClick={newCard}>
                      换一张重新制作
                    </button>
                  </div>
                )}
              </div>
            )}
            {step === 'result' && result && (
              <div className="result-layout">
                <div className="result-card">
                  <CardView front={result.front} back={result.back} tier={result.tier} />
                </div>
                <div className="result-copy">
                  <div className="eyebrow">THIS ONE IS YOURS.</div>
                  <h1>
                    {result.data.nickname}，<br />
                    欢迎来到<span>主场。</span>
                  </h1>
                  <div className="result-tag">
                    <i className={`swatch ${result.tier}`} />
                    {result.data.tierName} <span>·</span> BLUEPRINT ORIGINALS
                  </div>
                  <p>
                    翻到背面，看看属于你的那段话。
                    <br />
                    把这一刻保存下来，发给一起上场的人。
                  </p>
                  <div className="save-actions">
                    <button
                      className="primary full"
                      disabled={assetBusy}
                      onClick={() => void share('card')}
                    >
                      保存我的篮球卡 <span>↓</span>
                    </button>
                    <button
                      className="secondary full"
                      disabled={assetBusy}
                      onClick={() => void share('poster')}
                    >
                      制作分享海报 <span>↗</span>
                    </button>
                    <div>
                      <button
                        className="text-button"
                        disabled={assetBusy}
                        onClick={() => void share('comparison')}
                      >
                        原图 + 成品对比
                      </button>
                      <button
                        className="text-button"
                        disabled={assetBusy}
                        onClick={() => void share('thumbnail')}
                      >
                        链接缩略图
                      </button>
                    </div>
                  </div>
                  <small className="privacy-note">
                    卡片与海报保留在当前浏览器。请及时保存。
                    <br />
                    分享海报上的二维码只会打开示例介绍页。
                  </small>
                  <button className="another" disabled={!session?.remaining} onClick={newCard}>
                    {session?.remaining
                      ? `再做一张 · 还可制作 ${session.remaining} 张 →`
                      : '本轮 3 张卡已完成。谢谢你上场。'}
                  </button>
                  <details className="review-settings">
                    <summary>人工抽检记录（评审用）</summary>
                    <p>记录人工观察，不把合成桩当作真实模型质量。</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        void track('generation_qa_completed', { qaOutcome: 'pass' });
                        setQaNote('已记录：人工抽检通过');
                      }}
                    >
                      记录通过
                    </button>
                    <button
                      className="text-button"
                      style={{ marginLeft: 20 }}
                      onClick={() => {
                        void track('generation_qa_completed', { qaOutcome: 'fail' });
                        setQaNote('已记录：需要改进');
                      }}
                    >
                      记录需改进
                    </button>
                    {qaNote && <p role="status">{qaNote}</p>}
                  </details>
                </div>
              </div>
            )}
          </section>
        )}
        {error && (
          <div className="error-toast" role="alert">
            {error}
            <button aria-label="关闭提示" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}
      </main>
      <footer>
        <a className="footer-brand" href="/">
          B. 蓝本
        </a>
        <span>把你的名字，留在自己的主场。</span>
        <button onClick={() => void showMetrics()}>预览说明与本次数据 ↗</button>
      </footer>
      {debug && (
        <section className="debug-panel">
          <h3>开发期预览</h3>
          <p>
            本地合成桩、设计参数初版；不代表真实生成质量或可商用成品。3
            次免费额度与事件仅存进程内存，服务重启后可能重置。保存指标是「图片已呈现」的上界，实际保存不可确认；传播以服务端观察到的去重回流为主。
          </p>
          <pre>{JSON.stringify(metrics, null, 2)}</pre>
        </section>
      )}
      {asset && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
          <div className="modal-sheet">
            <button
              className="close-modal"
              aria-label="关闭导出"
              onClick={() => {
                URL.revokeObjectURL(asset.url);
                setAsset(null);
              }}
            >
              ×
            </button>
            <h2 id="export-title">留住你的这一刻。</h2>
            <p>
              {isWeChat() ? '长按下方图片，选择「保存图片」。' : '图片已生成，可以下载到你的设备。'}
            </p>
            <img
              className="export-image"
              src={asset.url}
              alt="可保存的篮球卡分享图片"
              onLoad={assetShown}
            />
            {!isWeChat() && (
              <button className="primary full" onClick={download}>
                下载图片 ↓
              </button>
            )}
            <small>海报保存后，可手动发到群或朋友圈。</small>
          </div>
        </div>
      )}
    </>
  );
}
