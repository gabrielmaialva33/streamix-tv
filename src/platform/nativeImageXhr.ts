import { Capacitor, CapacitorHttp } from "@capacitor/core";

type XhrMethod = "GET" | "POST" | "DELETE" | "PUT" | "PATCH";

const LOCAL_WEBVIEW_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/;
const IMAGE_URL =
  /(?:\/catalog\/images\/resize\b|\/t\/p\/|gstaticontent\.com|file\.gstaticontent\.com|\.jpe?g(?:[?#]|$)|\.png(?:[?#]|$)|\.webp(?:[?#]|$)|\.svg(?:[?#]|$))/i;
const RESIZE_ENDPOINT =
  (import.meta.env.VITE_API_URL || "https://streamix.mahina.cloud/api/v1/catalog").replace(/\/$/, "") +
  "/images/resize";
const RESIZE_API_KEY = import.meta.env.VITE_API_KEY || "";

let installed = false;

function shouldIntercept(method: string, url: string): boolean {
  return (
    Capacitor.isNativePlatform() &&
    method.toUpperCase() === "GET" &&
    /^https?:\/\//i.test(url) &&
    !LOCAL_WEBVIEW_URL.test(url) &&
    IMAGE_URL.test(url)
  );
}

function getHeader(headers: Record<string, string> | undefined, name: string): string {
  const target = name.toLowerCase();
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] ?? "";
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function responseForType(
  base64: string,
  responseType: XMLHttpRequestResponseType,
  contentType: string,
): unknown {
  const buffer = decodeBase64(base64);
  if (responseType === "blob") return new Blob([buffer], { type: contentType || "image/jpeg" });
  if (responseType === "arraybuffer") return buffer;
  return base64;
}

function toNativeRequestUrl(url: string): string {
  if (!/^http:\/\//i.test(url)) return url;
  const keyParam = RESIZE_API_KEY ? `&api_key=${encodeURIComponent(RESIZE_API_KEY)}` : "";
  return `${RESIZE_ENDPOINT}?url=${encodeURIComponent(url)}&w=480${keyParam}`;
}

function setReadonly<T extends keyof XMLHttpRequest>(xhr: XMLHttpRequest, key: T, value: XMLHttpRequest[T]) {
  Object.defineProperty(xhr, key, {
    configurable: true,
    get: () => value,
  });
}

function emit(xhr: XMLHttpRequest, type: string) {
  xhr.dispatchEvent(new Event(type));
  const handler = xhr[`on${type}` as keyof XMLHttpRequest];
  if (typeof handler === "function") {
    handler.call(xhr, new Event(type));
  }
}

export function installNativeImageXhrBridge() {
  if (installed || !Capacitor.isNativePlatform()) return;
  installed = true;

  const NativeXMLHttpRequest = window.XMLHttpRequest;

  window.XMLHttpRequest = function XMLHttpRequestProxy() {
    const xhr = new NativeXMLHttpRequest();
    const nativeOpen = xhr.open.bind(xhr);
    const nativeSend = xhr.send.bind(xhr);
    const nativeSetRequestHeader = xhr.setRequestHeader.bind(xhr);
    const nativeGetResponseHeader = xhr.getResponseHeader.bind(xhr);
    const nativeGetAllResponseHeaders = xhr.getAllResponseHeaders.bind(xhr);
    const requestHeaders: Record<string, string> = {};
    let intercepted = false;
    let requestMethod: XhrMethod = "GET";
    let requestUrl = "";
    let responseHeaders: Record<string, string> = {};

    xhr.open = ((
      method: string,
      url: string | URL,
      async = true,
      username?: string | null,
      password?: string | null,
    ) => {
      requestMethod = method.toUpperCase() as XhrMethod;
      requestUrl = String(url);
      intercepted = shouldIntercept(requestMethod, requestUrl);

      if (!intercepted) {
        nativeOpen(method, url, async, username, password);
        return;
      }

      setReadonly(xhr, "readyState", XMLHttpRequest.OPENED);
      emit(xhr, "readystatechange");
    }) as XMLHttpRequest["open"];

    xhr.setRequestHeader = ((name: string, value: string) => {
      if (!intercepted) {
        nativeSetRequestHeader(name, value);
        return;
      }
      requestHeaders[name] = value;
    }) as XMLHttpRequest["setRequestHeader"];

    xhr.getResponseHeader = ((name: string) => {
      if (!intercepted) return nativeGetResponseHeader(name);
      return getHeader(responseHeaders, name) || null;
    }) as XMLHttpRequest["getResponseHeader"];

    xhr.getAllResponseHeaders = (() => {
      if (!intercepted) return nativeGetAllResponseHeaders();
      return Object.entries(responseHeaders)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\r\n");
    }) as XMLHttpRequest["getAllResponseHeaders"];

    xhr.send = ((body?: Document | XMLHttpRequestBodyInit | null) => {
      if (!intercepted) {
        nativeSend(body);
        return;
      }

      void (async () => {
        try {
          const response = await CapacitorHttp.request({
            url: toNativeRequestUrl(requestUrl),
            method: requestMethod,
            headers: requestHeaders,
            responseType: "arraybuffer",
          });
          responseHeaders = response.headers;
          const contentType = getHeader(response.headers, "content-type");
          const data = typeof response.data === "string" ? response.data : "";

          setReadonly(xhr, "status", response.status);
          setReadonly(xhr, "statusText", String(response.status));
          setReadonly(xhr, "responseURL", response.url || requestUrl);
          setReadonly(xhr, "readyState", XMLHttpRequest.DONE);
          setReadonly(xhr, "response", responseForType(data, xhr.responseType, contentType));
          if (!xhr.responseType || xhr.responseType === "text") {
            setReadonly(xhr, "responseText", data);
          }

          emit(xhr, "readystatechange");
          emit(xhr, response.status >= 200 && response.status < 300 ? "load" : "error");
          emit(xhr, "loadend");
        } catch {
          setReadonly(xhr, "status", 0);
          setReadonly(xhr, "readyState", XMLHttpRequest.DONE);
          emit(xhr, "readystatechange");
          emit(xhr, "error");
          emit(xhr, "loadend");
        }
      })();
    }) as XMLHttpRequest["send"];

    return xhr;
  } as unknown as typeof XMLHttpRequest;

  Object.assign(window.XMLHttpRequest, NativeXMLHttpRequest);
  window.XMLHttpRequest.prototype = NativeXMLHttpRequest.prototype;
}
