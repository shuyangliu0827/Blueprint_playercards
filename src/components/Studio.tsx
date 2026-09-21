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
  detectPeople,
  releasePhoto,
  type PreparedPhoto,
  type DetectedPerson,
} from '../platform/photo';
import { renderMvpCard, type CardSeries } from '../render/mvp-card';
import CardView from './MvpCardView';
import {
  generationStatus,
  generationPayload,
  requestArtwork,
  type ArtworkResult,
  type GenerationStatus,
} from '../platform/generation';
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
  series: CardSeries;
};
const issueText: Record<string, string> = {
  NICKNAME_REQUIRED: '给自己起一个卡面昵称。',
  NICKNAME_FORMAT_INVALID: '昵称请用 1–6 个汉字，或 1–14 个英文字母（可含空格）。',
  NICKNAME_PLAYER_NAME: '请换一个属于自己的昵称，不使用球员姓名或别名。',
  JERSEY_NUMBER_REQUIRED: '填上你的球衣号码。',
  JERSEY_NUMBER_INVALID: '球衣号码需要 1–2 位数字。',
  POSITION_REQUIRED: '选择你的场上位置。',
  HANDEDNESS_REQUIRED: '选择你的惯用手。',
  FACE_CONSENT_REQUIRED: '需要同意人物识别及照片生成处理后继续。',
  PERSON_NOT_DETECTED: '还没找到人物，请换一张人物更清楚的照片。',
  SUBJECT_RESULT_INVALID: '人物识别结果无效，请重新选择照片。',
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
    [subjects, setSubjects] = useState<DetectedPerson[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [rights, setRights] = useState(false),
    [adult, setAdult] = useState(false),
    [nickname, setNickname] = useState(''),
    [number, setNumber] = useState(''),
    [position, setPosition] = useState<Position | ''>(''),
    [hand, setHand] = useState<Handedness | ''>(''),
    [series, setSeries] = useState<CardSeries>('classic'),
    [references, setReferences] = useState<PreparedPhoto[]>([]),
    [provider, setProvider] = useState<GenerationStatus | null>(null),
    [providerError, setProviderError] = useState(''),
    [job, setJob] = useState<JobView | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [selectedTier, setSelectedTier] = useState<Tier>('prism'),
    [exampleFront, setExampleFront] = useState('/assets/mvp/aura.png'),
    [exampleBack, setExampleBack] = useState(''),
    [asset, setAsset] = useState<{ url: string; blob: Blob; type: AssetType } | null>(null),
    [assetBusy, setAssetBusy] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [debug, setDebug] = useState(false),
    [metrics, setMetrics] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    referenceRef = useRef<HTMLInputElement>(null),
    referencesRef = useRef<PreparedPhoto[]>([]),
    referenceVersion = useRef(0),
    requestForm = useRef<FormData | null>(null),
    generated = useRef<ArtworkResult | null>(null),
    savedSeries = useRef<CardSeries>('classic'),
    requestFingerprint = useRef(''),
    savedInput = useRef<CardInput | null>(null),
    photoRef = useRef<PreparedPhoto | null>(null),
    scanVersion = useRef(0),
    photoVersion = useRef(0),
    consentRef = useRef(false),
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
    void generationStatus()
      .then(setProvider)
      .catch((e) => setProviderError(e.message));
    void initialize().catch(() => setError('预览服务暂时未连接，点「做我的篮球卡」时会重试。'));
    return () => {
      scanVersion.current++;
      photoVersion.current++;
      referenceVersion.current++;
      referencesRef.current.forEach(releasePhoto);
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
      const art = await loadImage('/assets/mvp/demo-photo.jpg');
      const data: CardData = {
        nickname: '球员姓名',
        jerseyNumber: '09',
        position: '控球后卫',
        handedness: '右手',
        cardId: 'EXAMPLE · DESIGN PREVIEW',
        aiLabel: 'AI 合成示例 / 内部预览',
        tierName: effect.materials.find((m) => m.id === selectedTier)!.label,
        story: '林一身披07号，以控球后卫视角阅读球场。每次移动都变成下一次选择的起点。',
        seriesName: 'BLUEPRINT',
        issuedAt: '',
      };
      const front = await renderMvpCard({
          artwork: art,
          data,
          series: 'classic',
          tier: selectedTier,
        }),
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
    const version = ++photoVersion.current;
    scanVersion.current++;
    setBusy(true);
    setError('');
    setSubjects([]);
    setSelected(null);
    try {
      const p = await decodePhoto(file);
      if (version !== photoVersion.current) {
        releasePhoto(p);
        return;
      }
      if (photoRef.current) releasePhoto(photoRef.current);
      photoRef.current = p;
      setPhoto(p);
      if (consentRef.current) await scan(p);
    } catch (e) {
      if (version === photoVersion.current)
        setError(e instanceof Error ? e.message : '照片读取失败');
    } finally {
      if (version === photoVersion.current) setBusy(false);
    }
  }
  async function scan(p: PreparedPhoto) {
    if (!consentRef.current) return;
    const version = ++scanVersion.current;
    setBusy(true);
    setSubjects([]);
    setSelected(null);
    try {
      const f = await detectPeople(p);
      if (version !== scanVersion.current) return;
      setSubjects(f);
      setSelected(f.length === 1 ? 0 : null);
      if (!f.length) setError('还没找到人物，请换一张人物轮廓更清楚的照片。背身、侧身都可以。');
      else setError('');
    } catch {
      if (version !== scanVersion.current) return;
      setError('本地人物识别未能加载，请点击重试识别。');
    } finally {
      if (version === scanVersion.current) setBusy(false);
    }
  }
  async function setSubjectConsent(checked: boolean) {
    consentRef.current = checked;
    setConsent(checked);
    if (checked && photo) await scan(photo);
    if (!checked) {
      scanVersion.current++;
      setBusy(false);
      setSubjects([]);
      setSelected(null);
    }
  }
  async function addReferences(files: FileList | null) {
    if (!files?.length || busy) return;
    const remaining = 2 - referencesRef.current.length;
    if (files.length > remaining) {
      setError('最多上传 3 张照片：1 张主照片和 2 张参考照片。');
      return;
    }
    const version = ++referenceVersion.current;
    setBusy(true);
    const decoded: PreparedPhoto[] = [];
    try {
      for (const file of Array.from(files)) decoded.push(await decodePhoto(file));
      if (version !== referenceVersion.current) {
        decoded.forEach(releasePhoto);
        return;
      }
      referencesRef.current = [...referencesRef.current, ...decoded];
      setReferences(referencesRef.current);
      setError('');
    } catch (e) {
      decoded.forEach(releasePhoto);
      setError(e instanceof Error ? e.message : '参考照片读取失败');
    } finally {
      if (version === referenceVersion.current) setBusy(false);
      if (referenceRef.current) referenceRef.current.value = '';
    }
  }
  function removeReference(index: number) {
    const removed = referencesRef.current[index];
    if (removed) releasePhoto(removed);
    referencesRef.current = referencesRef.current.filter((_, i) => i !== index);
    setReferences(referencesRef.current);
  }
  async function prepareResult(payload: ArtworkResult) {
    const j = payload.job;
    let prepared: Result;
    try {
      if (!savedInput.current) throw new Error('请重新填写卡面信息。');
      const i = savedInput.current;
      const art = await loadImage(payload.artwork);
      const tier = j.draw.tier as Tier;
      const data: CardData = {
        nickname: i.nickname,
        jerseyNumber: i.jerseyNumber,
        position: positions[i.position],
        handedness: i.handedness === 'LEFT' ? '左手' : '右手',
        cardId: j.draw.cardId,
        aiLabel: 'AI 艺术生成 · BLUEPRINT',
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
        seriesName:
          savedSeries.current === 'classic' ? 'BLUEPRINT' : savedSeries.current.toUpperCase(),
        issuedAt: new Date().toISOString(),
      };
      const front = await renderMvpCard({ artwork: art, data, series: savedSeries.current, tier });
      const back = await renderCard(layout, effect, data, art, tier, 'back', false);
      const card = await renderMvpCard({
        artwork: art,
        data,
        series: savedSeries.current,
        tier,
        includeMaterial: true,
      });
      // Serialization can fail independently of drawing. Finish all local work before charging quota.
      prepared = {
        front: front.toDataURL(),
        back: back.toDataURL(),
        card,
        data,
        tier,
        series: savedSeries.current,
        requestId: j.requestId,
      };
    } catch (error) {
      if (j.status !== 'complete') {
        const failed = await api<JobView>({ action: 'render-failed', requestId: j.requestId });
        generated.current = { ...payload, job: failed };
        setJob(failed);
        setSession((s) =>
          s ? { ...s, remaining: failed.remaining, successfulCount: failed.successfulCount } : s,
        );
      }
      throw error;
    }
    // Keep completion outside the local-render catch: a lost response may already have committed.
    const complete =
      j.status === 'complete'
        ? j
        : await api<JobView>({ action: 'complete', requestId: j.requestId });
    generated.current = { ...payload, job: complete };
    setJob(complete);
    setSession((s) =>
      s ? { ...s, remaining: complete.remaining, successfulCount: complete.successfulCount } : s,
    );
    setResult(prepared);
    setStep('result');
  }
  async function runGeneration() {
    if (runLock.current || !requestForm.current) return;
    runLock.current = true;
    requestStart.current = Date.now();
    setElapsed(0);
    setStep('processing');
    setError('');
    try {
      let payload = generated.current;
      if (payload) {
        // Reconcile lost failure/completion responses before touching the cached artwork.
        let latest: JobView;
        try {
          latest = await api<JobView>({ action: 'poll', requestId: payload.job.requestId });
        } catch (error) {
          if (error instanceof ApiError && error.code === 'TASK_EXPIRED')
            throw new Error(
              '本次任务已过期，请返回修改信息并重新制作。缓存画面不会自动触发新的付费生成。',
            );
          throw error;
        }
        payload = { ...payload, job: latest };
        generated.current = payload;
        setJob(latest);
        setSession((s) =>
          s ? { ...s, remaining: latest.remaining, successfulCount: latest.successfulCount } : s,
        );
      } else {
        payload = await requestArtwork(requestForm.current);
      }
      if (payload.job.status === 'failed') {
        if (payload.job.error !== 'RENDER_FAILED')
          throw new Error('本次任务已失效，请返回修改信息并重新制作。不会自动重复付费请求。');
        const restored = await api<JobView>({
          action: 'restore',
          requestId: payload.job.requestId,
        });
        payload = { ...payload, job: restored };
        setSession((s) =>
          s
            ? { ...s, remaining: restored.remaining, successfulCount: restored.successfulCount }
            : s,
        );
      }
      generated.current = payload;
      setJob(payload.job);
      await prepareResult(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成中断，请查询本次结果。');
    } finally {
      runLock.current = false;
    }
  }
  async function submit() {
    if (busy || runLock.current || !session) return;
    setError('');
    if (!photo) {
      setError('先选一张自己的主照片。');
      return;
    }
    const checked = validateCardInput(
      {
        photo: photo.metadata,
        nickname,
        jerseyNumber: number,
        position,
        handedness: hand,
        faceDetection: { faceCount: 0, angle: 'UNCERTAIN' },
        subjectDetection: {
          personCount: subjects.length,
          ...(selected === null ? {} : { selectedPersonIndex: selected }),
        },
        faceProcessingConsent: consent,
        photoRightsConfirmed: rights,
        adultSelfDeclaration: adult,
      },
      inputConfig,
      names,
    );
    if (!checked.ok || !checked.value || selected === null || !subjects[selected]) {
      const code = checked.errors[0]?.code;
      setError(code ? (issueText[code] ?? '请完成照片识别和所有信息。') : '请选择照片中的自己。');
      return;
    }
    setBusy(true);
    try {
      const status = await generationStatus();
      setProvider(status);
      setProviderError('');
      if (!status.configured)
        throw new Error('图像服务尚未配置。请在服务器本地配置 OpenAI API 密钥后再制作。');
      const fingerprint = JSON.stringify([
        checked.value,
        series,
        subjects[selected],
        photo.objectUrl,
        references.map((p) => p.objectUrl),
      ]);
      if (fingerprint !== requestFingerprint.current || !pendingRequest.current) {
        pendingRequest.current = `${crypto.randomUUID()}:${session.successfulCount === 0 ? '1' : '0'}:${session.configVersion}`;
        requestForm.current = await generationPayload(
          pendingRequest.current,
          checked.value,
          series,
          subjects[selected],
          [photo, ...references],
        );
        generated.current = null;
        requestFingerprint.current = fingerprint;
      }
      savedInput.current = checked.value;
      savedSeries.current = series;
      await runGeneration();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'QUOTA_EXHAUSTED'
          ? '本轮 3 张卡已制作完成。'
          : e instanceof Error
            ? e.message
            : '提交失败，请重试。',
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    await runGeneration();
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
        'blueprint-mvp-v2',
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
    requestForm.current = null;
    generated.current = null;
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
          <img
            src="/assets/brand/blueprint-logo.png"
            alt="蓝本 Blueprint"
            style={{ width: 100, height: 50, objectFit: 'contain' }}
          />
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
          BLUEPRINT · MVP
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
                  src="/assets/mvp/silver.png"
                  alt="银折卡设计样张"
                />
                <img
                  className="sample sample-right"
                  src="/assets/mvp/animation.png"
                  alt="ANIMATION 设计样张"
                />
                <img
                  className="sample sample-center"
                  src="/assets/mvp/aura.png"
                  alt="AURA 设计样张"
                />
                <div className="gallery-caption">
                  <span>01 / 03</span>
                  <span>系列设计样张 · 非用户生成结果</span>
                  <span>↙ 看见你的另一面</span>
                </div>
              </div>
            </section>
            <section className="how" id="how">
              <div className="section-kicker">从照片，到你的主场</div>
              <div className="how-grid">
                {[
                  ['01', '上传 1–3 张自己的照片', '主照片确定动作，参考照片补充你的个人特征。'],
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
                  <p className="muted">背身、侧身、腾空动作都可以。照片中能看到你，就能开始。</p>
                  <div className="field">
                    <label>01 / 你的主照片</label>
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
                          <strong>选择主照片</strong>
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
                          ? '正在本机识别人物…'
                          : subjects.length
                            ? `识别到 ${subjects.length} 位人物${subjects.length === 1 ? '，已选为主体。' : '，请选择你自己。'}`
                            : '暂未找到人物'}
                      </small>
                    )}
                    {consent && photo && !busy && (
                      <button type="button" onClick={() => void scan(photo)}>
                        重试识别
                      </button>
                    )}
                    {subjects.length > 0 && (
                      <div className="face-options">
                        {subjects.map((face, i) => (
                          <button
                            key={i}
                            className={selected === i ? 'chosen' : ''}
                            onClick={() => setSelected(i)}
                          >
                            <span
                              className="face-crop"
                              style={{
                                width: 72,
                                height: Math.max(
                                  45,
                                  Math.min(
                                    150,
                                    (72 * face.h * (photo?.metadata.height ?? 1)) /
                                      (face.w * (photo?.metadata.width ?? 1)),
                                  ),
                                ),
                                backgroundImage: `url(${photo?.objectUrl})`,
                                backgroundSize: `${100 / face.w}% ${100 / face.h}%`,
                                backgroundPosition: `${(face.x / Math.max(0.001, 1 - face.w)) * 100}% ${(face.y / Math.max(0.001, 1 - face.h)) * 100}%`,
                              }}
                            />
                            第 {i + 1} 位{selected === i ? ' ✓' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label>参考照片 · 可选，最多再添加 2 张</label>
                    <small>
                      上传同一个人的清晰照片，辅助保留外貌、发型和服装特征。主照片决定动作。
                    </small>
                    <input
                      ref={referenceRef}
                      type="file"
                      accept="image/jpeg,image/png,image/heic,.heic,.heif"
                      multiple
                      hidden
                      onChange={(e) => void addReferences(e.target.files)}
                    />
                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                      {references.map((p, i) => (
                        <div key={p.objectUrl} style={{ width: 100 }}>
                          <img
                            src={p.objectUrl}
                            alt={`参考照片 ${i + 1}`}
                            style={{ width: 100, height: 120, objectFit: 'cover', borderRadius: 8 }}
                          />
                          <button type="button" disabled={busy} onClick={() => removeReference(i)}>
                            移除参考 {i + 1}
                          </button>
                        </div>
                      ))}
                      {references.length < 2 && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => referenceRef.current?.click()}
                        >
                          ＋ 添加参考
                        </button>
                      )}
                    </div>
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
                  <div className="field">
                    <label>选择卡片系列</label>
                    <div className="position-options">
                      {(
                        [
                          ['classic', 'ORIGINAL', '真实运动摄影'],
                          ['aura', 'AURA', '艺术人物 · 虚拟意境'],
                          ['animation', 'ANIMATION', '美漫人物 · 异想球场'],
                        ] as const
                      ).map(([id, name, text]) => (
                        <button
                          key={id}
                          className={series === id ? 'chosen' : ''}
                          onClick={() => setSeries(id)}
                        >
                          <b>{name}</b>
                          <span>{text}</span>
                        </button>
                      ))}
                    </div>
                    <small>版式保持一致，人物和场景根据你的照片及信息重新生成。</small>
                  </div>
                  <div className="consents">
                    <label>
                      <input
                        type="checkbox"
                        checked={rights}
                        onChange={(e) => setRights(e.target.checked)}
                      />
                      我确认全部照片中的主体为本人，且有权使用。
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
                        onChange={(e) => void setSubjectConsent(e.target.checked)}
                      />
                      我同意在本机识别人物，并将所选照片及卡片信息发送至 OpenAI 生成卡面。
                    </label>
                  </div>
                  <p className="privacy-note">
                    人物识别在本机完成；点击制作后，所选照片会通过服务器发送至
                    OpenAI。请及时保存成品，刷新页面会清除当前浏览器中的制作内容。
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
                  <p className="privacy-note" role="status">
                    {providerError ||
                      (provider === null
                        ? '正在检查图像服务…'
                        : provider.configured
                          ? 'OpenAI 图像服务已配置。生成可能需要几分钟。'
                          : '图像服务尚未配置，暂时无法生成。')}
                  </p>
                </div>
                <aside className="editor-preview">
                  <div className="eyebrow">YOUR FIRST EDITION</div>
                  <img
                    src={`/assets/mvp/${series === 'classic' ? 'silver' : series}.png`}
                    alt={`${series.toUpperCase()} 系列设计样张`}
                  />
                  <p>这是系列设计样张，成品将根据你的照片重新生成。</p>
                  <small>
                    固定 Logo、边框和姓名区，
                    <br />
                    每张卡拥有自己的画面。
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
                <h1>{error ? '这一回合，稍作调整。' : '把这一刻，制成你的卡。'}</h1>
                <p>
                  {generated.current
                    ? '画面已完成，正在排版并制作折射材质。'
                    : 'OpenAI 正在根据你的照片绘制人物和场景，可能需要几分钟。'}
                </p>
                <span className="elapsed">
                  {elapsed} 秒 · {savedSeries.current.toUpperCase()}
                </span>
                {(job?.status === 'failed' || error) && (
                  <div className="recovery">
                    <button className="primary" onClick={() => void restore()}>
                      查询本次结果 ↗
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
                  <CardView
                    front={result.front}
                    back={result.back}
                    tier={result.tier}
                    series={result.series}
                  />
                </div>
                <div className="result-copy">
                  <div className="eyebrow">THIS ONE IS YOURS.</div>
                  <h1>
                    {result.data.nickname}，<br />
                    欢迎来到<span>主场。</span>
                  </h1>
                  <div className="result-tag">
                    <i className={`swatch ${result.tier}`} />
                    {result.data.tierName} <span>·</span> {result.data.seriesName}
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
                    <p>记录人物、动作及艺术风格的实际生成质量。</p>
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
            OpenAI 生成卡面，固定模板排版并叠加动态折射。3
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
