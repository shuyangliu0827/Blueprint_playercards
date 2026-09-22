import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { ImageGenerationService, artworkPrompt, jpegDimensions, parseGenerationForm, type GenerationRequest } from '../src/server/image-generation';
import { PreviewService } from '../src/server/preview-service';
import { GET, POST } from '../src/app/api/generate/route';
const jpeg = new Uint8Array([255,216,255,192,0,17,8,4,0,4,0,3,1,17,0,2,17,0,3,17,0,255,217]);
const photo = () => new File([jpeg], 'photo.jpg', { type:'image/jpeg' });
const input = { photo: {mimeType:'image/jpeg',byteSize:jpeg.length,width:1024,height:1024},nickname:'Ace',jerseyNumber:'7',position:'PG' as const,handedness:'RIGHT' as const,faceDetection:{faceCount:0,angle:'UNCERTAIN' as const},subjectDetection:{personCount:1},faceProcessingConsent:true,photoRightsConfirmed:true,adultSelfDeclaration:true };
let counter = 1;
function request(): GenerationRequest { return { requestId:`${String(counter++).padStart(8,'0')}-0000-4000-8000-000000000000:0:v0.2.0`,input,series:'classic',subject:{x:0,y:0,w:1,h:1,confidence:.9},photos:[photo()] }; }
function output() { const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1024,16);png.writeUInt32BE(1536,20);return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]})); }
function harness(fetcher: typeof fetch = vi.fn(async () => output())) {
  let now = Date.now();
  const preview = new PreviewService({configDirectory:join(process.cwd(),'config'),drawSecret:'test-secret-that-is-at-least-32-bytes',ipHashSalt:'test-ip-salt-that-is-at-least-32-bytes',now:()=>now});
  const actor = preview.createSession(undefined,undefined).value.anonId;
  return {preview,actor,fetcher,service:new ImageGenerationService(preview,{apiKey:'test-only',fetch:fetcher}),advance:()=>now+=100_000};
}
describe('real image generation',()=>{
  it('personalizes artwork prompts while protecting pose and deterministic typography',()=>{
    const r=request();const first=artworkPrompt(r);const second=artworkPrompt({...r,input:{...input,jerseyNumber:'23',position:'C',handedness:'LEFT',nickname:'Ray'},series:'aura'});
    expect(first).not.toBe(second);expect(first).toContain('"jerseyNumber":"7"');expect(second).toContain('"jerseyNumber":"23"');expect(second).toContain('commanding paint presence');expect(second).toContain('without mirroring');expect(second).toContain('must never become visible text');expect(second).toContain('quoted data only');
  });
  it('times out without automatic retry and returns the reservation',async()=>{
    const fetcher=vi.fn((_url: Parameters<typeof fetch>[0],init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('aborted')))));
    const h=harness(fetcher);const r=request();const service=new ImageGenerationService(h.preview,{apiKey:'test-only',fetch:fetcher,timeoutMs:5});
    await expect(service.generate(h.actor,r)).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'});expect(h.preview.poll(h.actor,r.requestId).remaining).toBe(3);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('never makes another paid request when a known id loses its artwork cache',async()=>{
    const h=harness();const r=request();await h.service.generate(h.actor,r);const freshCache=new ImageGenerationService(h.preview,{apiKey:'test-only',fetch:h.fetcher});await expect(freshCache.generate(h.actor,r)).rejects.toMatchObject({code:'ARTWORK_EXPIRED'});expect(h.fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds concurrent upstream calls across sessions',async()=>{
    let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);const fetcher=vi.fn(async()=>{await gate;return output();});const h=harness(fetcher);
    const actors=Array.from({length:5},()=>h.preview.createSession(undefined,undefined).value.anonId);
    const pending=actors.slice(0,4).map(actor=>h.service.generate(actor,request()));await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(4));
    await expect(h.service.generate(actors[4]!,request())).rejects.toMatchObject({code:'QUEUE_BUSY'});release();await Promise.all(pending);expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('requires configuration and never synthesizes fallback artwork',async()=>{const h=harness();await expect(new ImageGenerationService(h.preview).generate(h.actor,request())).rejects.toMatchObject({code:'PROVIDER_NOT_CONFIGURED'});expect(h.fetcher).not.toHaveBeenCalled();});
  it('deduplicates concurrent requests and waits for actual provider success before completion',async()=>{
    let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
    const fetcher=vi.fn(async()=>{await gate;return output();});const h=harness(fetcher);const r=request();
    const a=h.service.generate(h.actor,r);const b=h.service.generate(h.actor,r);
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));h.advance();
    expect(h.preview.poll(h.actor,r.requestId).status).toBe('pending');expect(()=>h.preview.complete(h.actor,r.requestId)).toThrow('not ready');
    release();const [one,two]=await Promise.all([a,b]);expect(one.artwork).toBe(two.artwork);expect(one.job.status).toBe('ready');
    expect(h.preview.complete(h.actor,r.requestId).successfulCount).toBe(1);expect(h.preview.complete(h.actor,r.requestId).successfulCount).toBe(1);
    const init=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(init[0]).toBe('https://api.openai.com/v1/images/edits');
    const body=init[1].body as FormData;expect(body.get('model')).toBe('gpt-image-2');expect(body.getAll('image[]')).toHaveLength(1);expect(body.get('quality')).toBe('high');
  });
  it('rejects changed request payload and different ownership without more paid requests',async()=>{const h=harness();const r=request();await h.service.generate(h.actor,r);await expect(h.service.generate(h.actor,{...r,series:'aura'})).rejects.toMatchObject({code:'REQUEST_MISMATCH'});const other=h.preview.createSession(undefined,undefined).value.anonId;await expect(h.service.generate(other,r)).rejects.toMatchObject({code:'REQUEST_OWNERSHIP'});expect(h.fetcher).toHaveBeenCalledTimes(1);});
  it('releases failed reservations and does not retry provider requests or permit legacy restore bypass',async()=>{const h=harness(vi.fn(async()=>new Response('secret upstream details',{status:500})));const r=request();await expect(h.service.generate(h.actor,r)).rejects.toMatchObject({code:'PROVIDER_FAILED'});expect(h.preview.poll(h.actor,r.requestId)).toMatchObject({status:'failed',remaining:3});expect(()=>h.preview.restore(h.actor,r.requestId)).toThrow('explicitly');await expect(h.service.generate(h.actor,r)).rejects.toMatchObject({code:'PROVIDER_FAILED'});expect(h.fetcher).toHaveBeenCalledTimes(1);});
  it('restores local rendering without provider regeneration',async()=>{const h=harness();const r=request();await h.service.generate(h.actor,r);h.preview.renderFailed(h.actor,r.requestId);expect(h.preview.restore(h.actor,r.requestId).status).toBe('ready');expect(h.preview.complete(h.actor,r.requestId).successfulCount).toBe(1);expect(h.fetcher).toHaveBeenCalledTimes(1);});
  it('validates consent and actual file metadata before calling provider',async()=>{const h=harness();await expect(h.service.generate(h.actor,{...request(),input:{...input,faceProcessingConsent:false}})).rejects.toMatchObject({code:'INVALID_INPUT'});await expect(h.service.generate(h.actor,{...request(),input:{...input,photo:{...input.photo,width:900}}})).rejects.toMatchObject({code:'PHOTO_METADATA_MISMATCH'});expect(h.fetcher).not.toHaveBeenCalled();});
  it('rejects corrupt input/output, invalid selection, and missing photos',async()=>{expect(()=>jpegDimensions(new Uint8Array([1,2,3]))).toThrow('JPEG');expect(()=>parseGenerationForm(new FormData())).toThrow();const h=harness(vi.fn(async()=>new Response(JSON.stringify({data:[{b64_json:'not-an-image'}]}))));await expect(h.service.generate(h.actor,request())).rejects.toMatchObject({code:'PROVIDER_INVALID_OUTPUT'});await expect(h.service.generate(h.actor,{...request(),subject:{x:0,y:0,w:2,h:1,confidence:.8}})).rejects.toMatchObject({code:'BAD_REQUEST'});});
  it('enforces signed sessions at the HTTP boundary and exposes safe status',async()=>{const get=await GET();expect(await get.json()).toEqual({configured:Boolean(process.env.OPENAI_API_KEY?.trim()),model:'gpt-image-2'});const result=await POST(new NextRequest('http://localhost/api/generate',{method:'POST',body:new FormData()}));expect(result.status).toBe(401);expect(await result.json()).toMatchObject({error:'SESSION_REQUIRED'});});
});

it('uses the server-drawn series even when the client asks for a special edition',async()=>{const h=harness();const r={...request(),series:'animation' as const};const result=await h.service.generate(h.actor,r);const call=(h.fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string,RequestInit];expect((call[1].body as FormData).get('prompt')).toBe(artworkPrompt({...r,series:result.job.draw.series!}));expect(result.job.draw.material).toBeTruthy();});
it('rejects archived probability versions for fresh paid generation',async()=>{const h=harness();const r=request();r.requestId=r.requestId.replace('v0.2.0','v0.1.0');await expect(h.service.generate(h.actor,r)).rejects.toMatchObject({code:'CONFIG_EXPIRED'});expect(h.fetcher).not.toHaveBeenCalled();});
