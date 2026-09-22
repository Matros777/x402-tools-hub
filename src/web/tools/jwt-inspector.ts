/**
 * JWT Inspector — decode, audit, verify and diff JSON Web Tokens.
 * 100% client-side: token never leaves the browser.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="studio-toolbar">
    <button id="btn-decode" class="btn btn-primary">Decode</button>
    <button id="btn-sample" class="btn">Sample</button>
    <button id="btn-copy" class="btn">Copy token</button>
    <button id="btn-export" class="btn">Export report</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <textarea id="token" class="editor" spellcheck="false"
    placeholder="Paste a JWT here: eyJhbGciOi....eyJzdWIiOi....SflKxwRJ..."></textarea>

  <div id="status" class="status"></div>

  <div id="timeline" class="timeline"></div>

  <div class="jwt-panels">
    <details class="pane" open>
      <summary>Header</summary>
      <pre id="out-header" class="out"></pre>
    </details>
    <details class="pane" open>
      <summary>Payload</summary>
      <pre id="out-payload" class="out"></pre>
    </details>
    <details class="pane">
      <summary>Signature</summary>
      <pre id="out-signature" class="out"></pre>
    </details>
  </div>

  <details class="pane" open>
    <summary>Security audit</summary>
    <div id="audit" class="audit"></div>
  </details>

  <details class="pane">
    <summary>Explain claims</summary>
    <div id="explain" class="explain"></div>
  </details>

  <details class="pane">
    <summary>Verify signature (WebCrypto, local)</summary>
    <div class="verify-grid">
      <select id="alg-pick" class="select">
        <option value="auto">auto from header</option>
        <option value="HS256">HS256</option>
        <option value="HS384">HS384</option>
        <option value="HS512">HS512</option>
        <option value="RS256">RS256</option>
        <option value="RS384">RS384</option>
        <option value="RS512">RS512</option>
        <option value="ES256">ES256</option>
        <option value="ES384">ES384</option>
        <option value="ES512">ES512</option>
        <option value="PS256">PS256</option>
        <option value="PS384">PS384</option>
        <option value="PS512">PS512</option>
      </select>
      <textarea id="key" class="editor editor-sm" spellcheck="false"
        placeholder="HMAC secret, or PEM public key (-----BEGIN PUBLIC KEY-----)"></textarea>
      <div class="query-row">
        <input id="jwks-url" class="input" placeholder="...or JWKS URL, e.g. https://issuer/.well-known/jwks.json">
        <button id="btn-jwks" class="btn">Fetch JWKS</button>
      </div>
      <button id="btn-verify" class="btn btn-primary">Verify</button>
      <div id="verify-out" class="status"></div>
    </div>
  </details>

  <details class="pane">
    <summary>Diff vs. second token</summary>
    <textarea id="token-b" class="editor" spellcheck="false"
      placeholder="Second JWT to compare against"></textarea>
    <button id="btn-diff" class="btn">Compare</button>
    <pre id="diff-out" class="out"></pre>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const token = $("token"), status = $("status");
  let decoded = null;
  let jwksKeys = null;

  function setStatus(el, msg, ok) {
    el.textContent = msg;
    el.className = "status " + (ok ? "ok" : "err");
  }

  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function b64urlToString(s) {
    return new TextDecoder().decode(b64urlToBytes(s));
  }

  function b64urlEncode(bytes) {
    let bin = "";
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeJwt(raw) {
    const t = raw.trim();
    const parts = t.split(".");
    if (parts.length !== 3) {
      return { ok: false, error: "A JWT must have exactly 3 dot-separated parts (got " + parts.length + ")" };
    }
    let header, payload;
    try { header = JSON.parse(b64urlToString(parts[0])); }
    catch (e) { return { ok: false, error: "Header is not valid Base64URL JSON: " + e.message }; }
    try { payload = JSON.parse(b64urlToString(parts[1])); }
    catch (e) { return { ok: false, error: "Payload is not valid Base64URL JSON: " + e.message }; }
    return {
      ok: true,
      raw: t,
      parts,
      header,
      payload,
      signature: parts[2],
      signingInput: parts[0] + "." + parts[1],
    };
  }

  const CLAIM_DOCS = {
    iss: "Issuer — who created and signed this token.",
    sub: "Subject — the principal (usually the user ID) this token is about.",
    aud: "Audience — the intended recipient(s) of the token.",
    exp: "Expiration time — after this instant the token MUST be rejected.",
    nbf: "Not before — the token MUST NOT be accepted before this instant.",
    iat: "Issued at — when the token was created.",
    jti: "JWT ID — unique identifier, used to prevent replay.",
    scope: "OAuth scope — space-separated permissions granted to the token.",
    scp: "OAuth scopes (array form, common in Azure AD).",
    azp: "Authorized party — client ID the token was issued to (OIDC).",
    roles: "Application roles assigned to the subject.",
    groups: "Directory groups the subject belongs to.",
    email: "Email address of the subject.",
    name: "Display name of the subject.",
    alg: "Signing algorithm declared in the header.",
    typ: "Token type — usually \"JWT\".",
    kid: "Key ID — which key in the issuer's JWKS signed this token.",
  };

  function fmtTime(sec) {
    if (typeof sec !== "number" || !isFinite(sec)) return null;
    return new Date(sec * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  }

  function humanDelta(sec) {
    const d = Math.abs(Math.round(sec));
    if (d < 60) return d + "s";
    if (d < 3600) return Math.round(d / 60) + "m";
    if (d < 86400) return Math.round(d / 3600) + "h";
    return Math.round(d / 86400) + "d";
  }

  function renderTimeline(d) {
    const now = Math.floor(Date.now() / 1000);
    const rows = [];
    const p = d.payload;
    if (typeof p.iat === "number") {
      rows.push('<div class="tl-row tl-neutral"><span class="tl-label">iat</span><span class="tl-val">' +
        fmtTime(p.iat) + '</span><span class="tl-note">issued ' + humanDelta(now - p.iat) + ' ago</span></div>');
    }
    if (typeof p.nbf === "number") {
      const future = p.nbf > now;
      rows.push('<div class="tl-row ' + (future ? "tl-warn" : "tl-neutral") + '"><span class="tl-label">nbf</span><span class="tl-val">' +
        fmtTime(p.nbf) + '</span><span class="tl-note">' + (future ? "not valid for another " + humanDelta(p.nbf - now) : "valid now") + '</span></div>');
    }
    if (typeof p.exp === "number") {
      const left = p.exp - now;
      const cls = left <= 0 ? "tl-err" : left < 300 ? "tl-warn" : "tl-ok";
      const note = left <= 0 ? "expired " + humanDelta(left) + " ago" : "expires in " + humanDelta(left);
      rows.push('<div class="tl-row ' + cls + '"><span class="tl-label">exp</span><span class="tl-val">' +
        fmtTime(p.exp) + '</span><span class="tl-note">' + note + '</span></div>');
    }
    $("timeline").innerHTML = rows.length ? rows.join("") : '<div class="tl-empty">No time-based claims (iat / nbf / exp) in this token.</div>';
  }

  function renderAudit(d) {
    const now = Math.floor(Date.now() / 1000);
    const items = [];
    const h = d.header, p = d.payload;
    const add = (level, text) => items.push({ level, text });

    if (h.alg === "none") add("err", "alg=none — the token is UNSIGNED. Never accept this in production.");
    else if (typeof h.alg === "string" && h.alg.startsWith("HS")) add("warn", "HMAC algorithm (" + h.alg + ") — fine for internal use, ensure the secret is strong.");
    else if (typeof h.alg === "string") add("ok", "Asymmetric algorithm " + h.alg + " — signed with a private key.");

    if (typeof p.exp !== "number") add("warn", "No exp claim — the token never expires (bad practice).");
    else if (p.exp <= now) add("err", "Token already expired " + humanDelta(now - p.exp) + " ago.");
    else if (p.exp - now > 86400) add("warn", "Very long lifetime: expires in " + humanDelta(p.exp - now) + " — prefer <= 1h for access tokens.");
    else add("ok", "Reasonable expiration: in " + humanDelta(p.exp - now) + ".");

    if (typeof p.iss !== "string") add("warn", "No iss claim — you cannot verify who issued this token.");
    else add("ok", "Issuer: " + p.iss);

    if (typeof p.aud !== "string" && !Array.isArray(p.aud)) add("warn", "No aud claim — token is not bound to a recipient.");
    else add("ok", "Audience: " + JSON.stringify(p.aud));

    if (typeof p.nbf === "number" && p.nbf > now) add("warn", "nbf is in the future — token not yet valid.");
    if (typeof p.iat === "number" && p.iat > now + 60) add("warn", "iat is in the future — clock skew or forged token.");
    if (!h.kid && typeof h.alg === "string" && !h.alg.startsWith("HS")) add("warn", "No kid in header — key rotation cannot be matched.");

    const crit = items.filter((i) => i.level === "err").length;
    const warn = items.filter((i) => i.level === "warn").length;
    const head = crit
      ? '<div class="audit-head audit-err">' + crit + ' critical issue(s)</div>'
      : warn
      ? '<div class="audit-head audit-warn">' + warn + ' warning(s)</div>'
      : '<div class="audit-head audit-ok">No issues found</div>';

    const icon = { ok: "\u2705", warn: "\u26A0\uFE0F", err: "\u274C" };
    $("audit").innerHTML = head + items.map((i) =>
      '<div class="audit-item audit-' + i.level + '">' + icon[i.level] + ' <span>' + i.text + '</span></div>'
    ).join("");
  }

  function renderExplain(d) {
    const rows = [];
    for (const [k, v] of Object.entries(d.header)) {
      rows.push({ where: "header", k, v, doc: CLAIM_DOCS[k] });
    }
    for (const [k, v] of Object.entries(d.payload)) {
      rows.push({ where: "payload", k, v, doc: CLAIM_DOCS[k] });
    }
    $("explain").innerHTML = rows.map((r) =>
      '<div class="explain-row"><code>' + r.where + '.' + r.k + '</code>' +
      '<span class="explain-val">' + JSON.stringify(r.v) + '</span>' +
      '<span class="explain-doc">' + (r.doc || "(no description)") + '</span></div>'
    ).join("");
  }

  function show(d) {
    decoded = d;
    $("out-header").textContent = JSON.stringify(d.header, null, 2);
    $("out-payload").textContent = JSON.stringify(d.payload, null, 2);
    $("out-signature").textContent =
      d.signature + "\n\n(signature bytes: " + b64urlToBytes(d.signature).length + ")";
    renderTimeline(d);
    renderAudit(d);
    renderExplain(d);
    setStatus(status, "Decoded · " + d.parts[0].length + "." + d.parts[1].length + "." + d.parts[2].length + " (header.payload.sig lengths)", true);
  }

  function doDecode() {
    const d = decodeJwt(token.value);
    if (!d.ok) { decoded = null; setStatus(status, d.error, false); return null; }
    show(d);
    return d;
  }

  $("btn-decode").onclick = doDecode;
  token.addEventListener("input", () => { if (token.value.trim().split(".").length === 3) doDecode(); });

  $("btn-sample").onclick = () => {
    token.value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlbW8ta2V5LTEifQ." +
      "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik1hdHJvcyIsImlzcyI6Imh0dHBzOi8veDQwMi10b29scy1odWIuZGV2Iiw" +
      "iYXVkIjoieDQwMi1hcGkiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMCwic2NvcGUiOiJ0b29sczpyZWFkIHRvb2xzOndyaXRlXCJ9." +
      "7m0h0Y0mQ9p3h2cE1oD4m3S0mP4nJ3nZ1qF4hR7h8kQ";
    doDecode();
  };

  $("btn-copy").onclick = () => {
    navigator.clipboard.writeText(token.value);
    setStatus(status, "Token copied", true);
  };

  $("btn-clear").onclick = () => {
    token.value = ""; $("token-b").value = ""; $("key").value = ""; $("jwks-url").value = "";
    ["out-header","out-payload","out-signature","diff-out"].forEach((id) => $(id).textContent = "");
    $("timeline").innerHTML = ""; $("audit").innerHTML = ""; $("explain").innerHTML = "";
    setStatus(status, "", true); setStatus($("verify-out"), "", true);
    decoded = null;
  };

  $("btn-export").onclick = () => {
    if (!decoded) { setStatus(status, "Decode a token first", false); return; }
    const report = {
      generatedAt: new Date().toISOString(),
      header: decoded.header,
      payload: decoded.payload,
      signatureLength: b64urlToBytes(decoded.signature).length,
      rawLength: decoded.raw.length,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jwt-report.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---- PEM / JWK / verification ---- */

  function pemToBuffer(pem) {
    const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    return b64urlToBytes(body.replace(/\+/g, "-").replace(/\//g, "_"));
  }

  function jwkToKey(jwk) {
    return crypto.subtle.importKey(
      "jwk", jwk,
      { name: jwk.kty === "RSA" ? "RSASSA-PKCS1-v1_5" : jwk.crv && jwk.crv.startsWith("P-") ? "ECDSA" : "RSA-PSS", hash: "SHA-256" },
      false, ["verify"]
    );
  }

  async function verify() {
    const out = $("verify-out");
    const d = decoded || doDecode();
    if (!d) { setStatus(out, "Nothing to verify", false); return; }
    const pick = $("alg-pick").value;
    const alg = pick === "auto" ? d.header.alg : pick;
    if (!alg) { setStatus(out, "No alg in header and none selected", false); return; }

    const sig = b64urlToBytes(d.signature);
    const data = new TextEncoder().encode(d.signingInput);
    let key = null;
    let params;

    try {
      if (alg.startsWith("HS")) {
        const secret = $("key").value;
        if (!secret) { setStatus(out, "Enter the HMAC secret below", false); return; }
        const hash = alg === "HS256" ? "SHA-256" : alg === "HS384" ? "SHA-384" : "SHA-512";
        key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, ["verify"]);
        params = { name: "HMAC" };
      } else if (alg.startsWith("RS") || alg.startsWith("PS")) {
        const pem = $("key").value;
        if (!pem) { setStatus(out, "Paste PEM public key below (or fetch JWKS)", false); return; }
        const isPss = alg.startsWith("PS");
        const hash = alg.endsWith("256") ? "SHA-256" : alg.endsWith("384") ? "SHA-384" : "SHA-512";
        key = await crypto.subtle.importKey("spki", pemToBuffer(pem), { name: isPss ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash }, false, ["verify"]);
        params = isPss ? { name: "RSA-PSS", saltLength: hash === "SHA-256" ? 32 : hash === "SHA-384" ? 48 : 64 } : { name: "RSASSA-PKCS1-v1_5" };
      } else if (alg.startsWith("ES")) {
        if (jwksKeys && d.header.kid) {
          const jwk = jwksKeys.find((k) => k.kid === d.header.kid) || jwksKeys[0];
          key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: jwk.crv }, false, ["verify"]);
        } else {
          const pem = $("key").value;
          if (!pem) { setStatus(out, "Paste PEM public key below (or fetch JWKS)", false); return; }
          const crv = alg === "ES256" ? "P-256" : alg === "ES384" ? "P-384" : "P-521";
          key = await crypto.subtle.importKey("spki", pemToBuffer(pem), { name: "ECDSA", namedCurve: crv }, false, ["verify"]);
        }
        const hash = alg === "ES256" ? "SHA-256" : alg === "ES384" ? "SHA-384" : "SHA-512";
        params = { name: "ECDSA", hash };
      } else {
        setStatus(out, "Unsupported algorithm: " + alg, false); return;
      }

      const ok = await crypto.subtle.verify(params, key, sig, data);
      setStatus(out, ok ? "SIGNATURE VALID (" + alg + ")" : "SIGNATURE INVALID (" + alg + ")", ok);
    } catch (e) {
      setStatus(out, "Verify error: " + e.message, false);
    }
  }

  $("btn-verify").onclick = verify;

  $("btn-jwks").onclick = async () => {
    const out = $("verify-out");
    const url = $("jwks-url").value.trim();
    if (!url) { setStatus(out, "Enter a JWKS URL", false); return; }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      jwksKeys = j.keys || [];
      setStatus(out, "JWKS loaded: " + jwksKeys.length + " key(s)" + (decoded && decoded.header.kid ? ", kid=" + decoded.header.kid : ""), true);
    } catch (e) {
      setStatus(out, "JWKS fetch failed: " + e.message, false);
    }
  };

  /* ---- diff ---- */

  function flat(obj, prefix, out) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) flat(obj[k], prefix ? prefix + "." + k : k, out);
    } else {
      out[prefix] = JSON.stringify(obj);
    }
  }

  $("btn-diff").onclick = () => {
    const a = decodeJwt(token.value), b = decodeJwt($("token-b").value);
    if (!a.ok || !b.ok) { $("diff-out").textContent = "Both tokens must be valid JWTs"; return; }
    const fa = {}, fb = {};
    flat(a.header, "header", fa); flat(a.payload, "payload", fa);
    flat(b.header, "header", fb); flat(b.payload, "payload", fb);
    const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
    const lines = [];
    for (const k of keys) {
      if (!(k in fa)) lines.push("+ " + k + " = " + fb[k]);
      else if (!(k in fb)) lines.push("- " + k + " (was " + fa[k] + ")");
      else if (fa[k] !== fb[k]) lines.push("~ " + k + ": " + fa[k] + " -> " + fb[k]);
    }
    $("diff-out").textContent = lines.length ? lines.join("\n") : "No differences";
  };
})();
`;

export function jwtInspectorPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "jwt-inspector",
    title: "JWT Inspector",
    intro:
      "Decode, audit, verify and diff JSON Web Tokens — entirely in your browser. " +
      "Your token never leaves this page. The paid API endpoint for agents is at " +
      "<code>POST /api/jwt-inspector</code>.",
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
