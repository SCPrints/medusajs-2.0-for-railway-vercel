// src/lib/client/client.ts
import Medusa from "@medusajs/js-sdk";
var backendUrl = __BACKEND_URL__ ?? "/";
var authType = __AUTH_TYPE__ ?? "session";
var jwtTokenStorageKey = __JWT_TOKEN_STORAGE_KEY__ || void 0;
var sdk = new Medusa({
  baseUrl: backendUrl,
  auth: {
    type: authType,
    jwtTokenStorageKey
  }
});
if (typeof window !== "undefined") {
  ;
  window.__sdk = sdk;
}

export {
  sdk
};
