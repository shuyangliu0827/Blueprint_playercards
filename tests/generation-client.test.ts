import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestArtwork } from '../src/platform/generation';
afterEach(() => vi.unstubAllGlobals());
describe('artwork client', () => {
  it('does not automatically retry a failed paid generation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'PROVIDER_FAILED', message: '服务暂时不可用' }), {
          status: 502,
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(requestArtwork(new FormData())).rejects.toThrow('服务暂时不可用');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed success instead of displaying placeholder art', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: { status: 'ready' } }))),
    );
    await expect(requestArtwork(new FormData())).rejects.toThrow('有效的卡面');
  });
});
