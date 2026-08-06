import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeXMLHttpRequest extends EventTarget {
  static readonly OPENED = 1;
  static readonly DONE = 4;

  readonly headers = new Map<string, string>();
  openedUrl = "";
  responseType: XMLHttpRequestResponseType = "";

  open(_method: string, url: string | URL) {
    this.openedUrl = String(url);
  }

  send() {}

  setRequestHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  getResponseHeader() {
    return null;
  }

  getAllResponseHeaders() {
    return "";
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_API_URL", "https://api.test/api/v1/catalog");
  vi.stubEnv("VITE_API_KEY", "header-only-key");
  Object.defineProperty(window, "XMLHttpRequest", {
    configurable: true,
    writable: true,
    value: FakeXMLHttpRequest,
  });
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
});

describe("image XHR bridge", () => {
  it("routes external images through the authenticated resize endpoint", async () => {
    const { installImageXhrBridge } = await import("./nativeImageXhr");
    installImageXhrBridge();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "https://images.example.test/poster.jpg");
    xhr.send();

    expect(xhr.openedUrl).toBe(
      "https://api.test/api/v1/catalog/images/resize?url=https%3A%2F%2Fimages.example.test%2Fposter.jpg&w=480",
    );
    expect(xhr.headers.get("x-api-key")).toBe("header-only-key");
  });

  it("normalizes absolute API variants through the local development proxy", async () => {
    vi.stubEnv("VITE_API_URL", "/sx-api/api/v1/catalog");
    const { installImageXhrBridge } = await import("./nativeImageXhr");
    installImageXhrBridge();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "https://streamix.example.test/api/v1/catalog/images/resize?url=poster&w=240");
    xhr.send();

    expect(xhr.openedUrl).toBe("/sx-api/api/v1/catalog/images/resize?url=poster&w=240");
    expect(xhr.headers.get("x-api-key")).toBe("header-only-key");
  });
});
