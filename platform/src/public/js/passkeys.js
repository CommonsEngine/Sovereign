/* eslint-disable n/no-unsupported-features/node-builtins */
const base64urlToBuffer = (value) => {
  const normalized = (value || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (normalized.length % 4)) % 4);
  const input = normalized + pad;
  const str = atob(input);
  const buffer = new ArrayBuffer(str.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < str.length; i += 1) {
    view[i] = str.charCodeAt(i);
  }
  return buffer;
};

const bufferToBase64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const credentialToJSON = (cred) => {
  if (!cred) return null;
  const obj = {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment,
    clientExtensionResults: cred.getClientExtensionResults(),
  };
  if (cred.response?.attestationObject) {
    obj.response = {
      attestationObject: bufferToBase64url(cred.response.attestationObject),
      clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
      transports: cred.response.getTransports ? cred.response.getTransports() : undefined,
    };
  } else if (cred.response?.authenticatorData) {
    obj.response = {
      authenticatorData: bufferToBase64url(cred.response.authenticatorData),
      clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
      signature: bufferToBase64url(cred.response.signature),
      userHandle: cred.response.userHandle
        ? bufferToBase64url(cred.response.userHandle)
        : undefined,
    };
  }
  return obj;
};

const prepDescriptorArray = (arr = []) =>
  arr.map((entry) => ({
    ...entry,
    id: base64urlToBuffer(entry.id),
  }));

const cloneOptions = (obj) => JSON.parse(JSON.stringify(obj));

const prepareCreateOptions = (options) => {
  if (!options || typeof options !== "object") return options;
  const copy = cloneOptions(options);
  if (copy.challenge) copy.challenge = base64urlToBuffer(copy.challenge);
  if (copy.user?.id) {
    const enc = new TextEncoder();
    copy.user.id = enc.encode(copy.user.id);
  }
  if (Array.isArray(copy.excludeCredentials)) {
    copy.excludeCredentials = prepDescriptorArray(copy.excludeCredentials);
  }
  return copy;
};

const prepareRequestOptions = (options) => {
  if (!options || typeof options !== "object") return options;
  const copy = cloneOptions(options);
  if (copy.challenge) copy.challenge = base64urlToBuffer(copy.challenge);
  if (Array.isArray(copy.allowCredentials)) {
    copy.allowCredentials = prepDescriptorArray(copy.allowCredentials);
  }
  return copy;
};

async function startLogin({ email, returnTo } = {}) {
  const res = await fetch("/api/passkeys/login/options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email || null }),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.message || "Unable to start passkey login.");
  }
  const publicKey = prepareRequestOptions(payload.options);
  const assertion = await navigator.credentials.get({ publicKey });
  const verify = await fetch("/api/passkeys/login/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      credential: credentialToJSON(assertion),
      challengeId: payload.challengeId,
      return_to: returnTo,
    }),
  });
  const verifyPayload = await verify.json();
  if (!verify.ok) {
    throw new Error(verifyPayload.message || "Passkey login failed.");
  }
  return verifyPayload;
}

async function startRegistration() {
  const res = await fetch("/api/passkeys/register/options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.message || "Unable to start passkey registration.");
  }
  const publicKey = prepareCreateOptions(payload.options);
  const credential = await navigator.credentials.create({ publicKey });
  const verify = await fetch("/api/passkeys/register/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      credential: credentialToJSON(credential),
      challengeId: payload.challengeId,
    }),
  });
  const verifyPayload = await verify.json();
  if (!verify.ok) {
    throw new Error(verifyPayload.message || "Passkey registration failed.");
  }
  return verifyPayload;
}

// eslint-disable-next-line no-undef
const isSupported = () => typeof window !== "undefined" && "PublicKeyCredential" in window;

// eslint-disable-next-line no-undef
window.SVPasskeys = {
  startLogin,
  startRegistration,
  isSupported,
};
