/**
 * x402 Tools Hub — image generation core
 * Text-to-image via ASI:One (asi1 image model).
 *
 * Endpoint: POST https://api.asi1.ai/v1/image/generate
 * Docs:     https://docs.asi1.ai
 *
 * Verified live (2026-09-27): HTTP 200, image comes back as base64 JPEG in
 * `data[0].b64_json`. The docs describe `images[0].url` (data URL) as an
 * alternative — both variants are handled here.
 */

export const IMAGE_SIZES = [
  "1024x1024",
  "1792x1024",
  "1024x1792",
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export const IMAGE_SIZE_LABELS: Record<ImageSize, string> = {
  "1024x1024": "1:1 — Square (1024×1024)",
  "1792x1024": "16:9 — Landscape (1792×1024)",
  "1024x1792": "9:16 — Portrait (1024×1792)",
};

/** Style presets — appended to the prompt as stylistic suffixes. */
export const IMAGE_STYLES = [
  "none",
  "photorealistic",
  "cinematic",
  "anime",
  "3d",
  "watercolor",
  "oil",
  "cyberpunk",
  "minimal",
] as const;

export type ImageStyle = (typeof IMAGE_STYLES)[number];

export const IMAGE_STYLE_LABELS: Record<ImageStyle, string> = {
  none: "No style — raw prompt",
  photorealistic: "Photorealistic",
  cinematic: "Cinematic",
  anime: "Anime",
  "3d": "3D Render",
  watercolor: "Watercolor",
  oil: "Oil Painting",
  cyberpunk: "Cyberpunk",
  minimal: "Minimalist",
};

const STYLE_SUFFIX: Record<ImageStyle, string> = {
  none: "",
  photorealistic:
    ", photorealistic, ultra-detailed, 8k, natural lighting, sharp focus",
  cinematic:
    ", cinematic shot, dramatic lighting, film grain, anamorphic lens, moody atmosphere",
  anime:
    ", anime style, cel shading, vibrant colors, studio quality, detailed eyes",
  "3d":
    ", 3D render, octane render, subsurface scattering, high detail, depth of field",
  watercolor:
    ", watercolor painting, soft washes, paper texture, delicate brush strokes",
  oil:
    ", oil painting, thick impasto brush strokes, classical art, canvas texture",
  cyberpunk:
    ", cyberpunk, neon lights, rain-soaked streets, futuristic city, blade runner aesthetic",
  minimal:
    ", minimalist, clean lines, flat design, negative space, muted palette",
};

export interface ImageGenResult {
  ok: boolean;
  /** base64 payload without data: prefix, or an https URL when returned directly */
  image?: string;
  /** mime type of the payload: image/jpeg, image/png, or image/* for URLs */
  mime?: string;
  revised_prompt?: string;
  id?: string;
  size?: string;
  style?: string;
  error?: string;
}

const ASI_IMAGE_URL = "https://api.asi1.ai/v1/image/generate";

export async function generateImage(
  apiKey: string,
  prompt: string,
  size: ImageSize = "1024x1024",
  style: ImageStyle = "none"
): Promise<ImageGenResult> {
  const fullPrompt = prompt.trim() + (STYLE_SUFFIX[style] ?? "");

  let res: Response;
  try {
    res = await fetch(ASI_IMAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: fullPrompt, size, model: "asi1" }),
    });
  } catch (e) {
    return { ok: false, error: `network_error: ${String(e)}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `asi_http_${res.status}: ${body.slice(0, 200)}`,
    };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "bad_json_response" };
  }

  // Variant A: OpenAI-style data[0].b64_json (verified live).
  const data = Array.isArray(json?.data) ? json.data[0] : null;
  if (data && typeof data.b64_json === "string" && data.b64_json.length > 0) {
    return {
      ok: true,
      image: data.b64_json,
      mime: "image/jpeg",
      revised_prompt: typeof data.revised_prompt === "string" ? data.revised_prompt : undefined,
      id: typeof json.id === "string" ? json.id : undefined,
      size,
      style,
    };
  }

  // Variant B: images[0].url as data URL or https URL (docs variant).
  const url: unknown = json?.images?.[0]?.url;
  if (typeof url === "string" && url.startsWith("data:image/")) {
    const semi = url.indexOf(";");
    const mime = semi > 0 ? url.slice(5, semi) : "image/png";
    const comma = url.indexOf(",");
    const payload = comma >= 0 ? url.slice(comma + 1) : url;
    return {
      ok: true,
      image: payload,
      mime,
      id: typeof json.id === "string" ? json.id : undefined,
      size,
      style,
    };
  }
  if (typeof url === "string" && url.startsWith("http")) {
    return {
      ok: true,
      image: url,
      mime: "image/*",
      id: typeof json.id === "string" ? json.id : undefined,
      size,
      style,
    };
  }

  return { ok: false, error: "no_image_in_response" };
}


/** Base64 (no prefix) -> Uint8Array bytes. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Upload raw image bytes to litterbox.catbox.moe (public, no key) — direct image URL. */
async function uploadToLitterbox(bytes: Uint8Array, mime: string): Promise<string | null> {
  const ext = mime === "image/png" ? "png" : "jpg";
  const filename = "asi1_image." + ext;
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("time", "72h");
  form.append("fileToUpload", new Blob([bytes.buffer as ArrayBuffer], { type: mime }), filename);
  try {
    const r = await fetch(
      "https://litterbox.catbox.moe/resources/internals/api.php",
      { method: "POST", body: form }
    );
    if (r.status !== 200) return null;
    const txt = (await r.text()).trim();
    if (txt.startsWith("https://") || txt.startsWith("http://")) return txt;
  } catch {
    return null;
  }
  return null;
}

/**
 * Hosted variant (Variant B — for the paid terminal/agent API):
 * generate -> upload to litterbox -> return image_url/download_url + metadata + human message.
 */
export async function generateImageHosted(
  apiKey: string,
  prompt: string,
  size: ImageSize = "1024x1024",
  style: ImageStyle = "none"
): Promise<any> {
  const res = await generateImage(apiKey, prompt, size, style);
  if (!res.ok || !res.image) {
    return { ok: false, error: res.error ?? "generation_failed" };
  }

  // Direct https URL already returned by ASI -> use as-is.
  if (res.image.startsWith("http")) {
    const url = res.image;
    return buildHostedResult({ ok: true, url, mime: res.mime ?? "image/*", size, style, prompt, id: res.id });
  }

  // base64 payload -> decode and host.
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(res.image);
  } catch {
    return { ok: false, error: "decode_failed" };
  }
  const url = await uploadToLitterbox(bytes, res.mime ?? "image/jpeg");
  if (!url) {
    return { ok: false, error: "hosting_failed" };
  }
  return buildHostedResult({ ok: true, url, mime: res.mime ?? "image/jpeg", size, style, prompt, id: res.id });
}

function buildHostedResult(p: {
  ok: boolean;
  url: string;
  mime: string;
  size: string;
  style: string;
  prompt: string;
  id?: string;
}): any {
  const [w, h] = p.size.split("x").map((v) => Number(v) || 0);
  const mimeLabel = p.mime === "image/png" ? "PNG" : "JPEG";
  const dl = `curl -L "${p.url}" -o generated-image.${p.mime === "image/png" ? "png" : "jpg"}`;
  return {
    ok: true,
    type: "image",
    mime_type: p.mime,
    width: w,
    height: h,
    style: p.style,
    prompt: p.prompt,
    image_url: p.url,
    download_url: p.url,
    download: dl,
    message:
      "✓ Payment successful — $0.01 USDC\n" +
      "✓ Image generated (" + w + "x" + h + ", " + mimeLabel + ")\n\n" +
      "🖼️ IMAGE\n" +
      p.url +
      "\n\n" +
      "⬇ Download:\n" +
      dl +
      "\n\n" +
      "📐 " + w + " × " + h + "\n" +
      "🎨 " + mimeLabel,
  };
}
