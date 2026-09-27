# Qwen artwork generation

The MVP sends 1–3 consented JPEG photographs to Alibaba Cloud Model Studio from the server. The first photo sets the person and pose; later photos are identity references. Qwen supplies only the artwork. The browser adds the fixed card frame, typography, logo, footer, and foil.

## Configuration

Set these **server-only** environment variables in `.env.local` for local development and in the deployment environment for preview:

```dotenv
DASHSCOPE_API_KEY=your-regional-model-studio-key
QWEN_IMAGE_ENDPOINT=https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/images/generations
```

Replace `YOUR_WORKSPACE_ID` and choose the documented regional endpoint for the **same region** as the key and model. The service accepts official Model Studio workspace endpoints for Beijing, Singapore, Virginia, Frankfurt, and Tokyo. Do not use a `NEXT_PUBLIC_` prefix or put the key in the mini program. Restart the server after changing the environment. `GET /api/generate` reports `{configured, model}` without exposing credentials. Missing or invalid configuration returns `PROVIDER_NOT_CONFIGURED` on generation.

## Request and response

`POST /api/generate` keeps the existing multipart client contract: `requestId`, `input` (CardInput JSON), `series` (`classic`, `aura`, `animation`), `subject` (normalized box JSON), and 1–3 repeated `photos` JPEG files. It requires the signed `bp_anon` cookie issued by `/api/preview`. The first photo's encoded dimensions and size must match `input.photo`; each file is limited to 10 MB, and the entire multipart body to 30.1 MB.

The server calls Qwen's OpenAI-compatible **`/images/generations`** endpoint with `model=qwen-image-3.0`, `image` as an ordered array of Base64 JPEG data URLs, `size=1024x1536`, `n=1`, `prompt_extend=false`, and `watermark=false`. Qwen's compatible protocol uses JSON rather than OpenAI's multipart `/images/edits` request. It returns a temporary PNG URL. The server accepts only the documented DashScope OSS host pattern, downloads the image immediately without passing the API key, rejects redirects and oversized or unexpected output, and returns a PNG data URL to the browser. The temporary provider URL is never returned to the client.

There are no automatic paid retries. The provider call and download share a four-minute timeout; a timeout after generation may still incur a provider charge. A failed download does not complete a card or issue another provider call. The request ID remains bound to its original input and failure. Concurrent matching requests share one promise, and local render failures can reuse cached artwork. The application does not persist raw photos to disk; artwork and job state remain in process memory. Before public or billable use, move quota, deduplication, and artwork storage to durable shared storage, and verify hosting upload and request duration limits.

## Verification

`npm run check` and `npm run build` verify the code path using mocked provider responses. Those checks do not establish real Qwen image quality or live account access. With your own regional key and workspace endpoint configured, create one card manually and check identity, pose, safe zones, latency, and Model Studio billing. No live paid request is made by automated tests.

Provider reference: https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference
