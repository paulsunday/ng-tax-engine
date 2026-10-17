import { apiFetch, apiUpload, ApiError, setToken } from "../api";

describe("apiFetch", () => {
  beforeEach(() => {
    setToken(null);
    global.fetch = jest.fn();
  });

  test("attaches the Authorization header when a token is stored", async () => {
    setToken("fake-token");
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await apiFetch("/companies");

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer fake-token");
  });

  test("omits the Authorization header when no token is stored", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await apiFetch("/auth/login");

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  test("throws ApiError with the server's message on a non-ok response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "No organization context." }),
    });

    await expect(apiFetch("/companies")).rejects.toThrow(ApiError);
    await expect(apiFetch("/companies")).rejects.toThrow("No organization context.");
  });

  test("falls back to a generic message when the error body isn't JSON", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(apiFetch("/companies")).rejects.toThrow(/status 500/);
  });

  test("returns undefined for a 204 No Content response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

    const result = await apiFetch("/companies/x");
    expect(result).toBeUndefined();
  });

  test("a 401 while a token is set clears the stored token (forced logout — revoked/expired session)", async () => {
    setToken("fake-token");
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Account is no longer active." }) });

    await expect(apiFetch("/companies")).rejects.toThrow(ApiError);
    expect(window.localStorage.getItem("accessToken")).toBeNull();
  });

  test("a 401 with NO token set (e.g. a failed login attempt) does not try to clear anything that wasn't there", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Invalid credentials." }) });

    await expect(apiFetch("/auth/login")).rejects.toThrow("Invalid credentials.");
    expect(window.localStorage.getItem("accessToken")).toBeNull();
  });
});

describe("apiUpload", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("never sets a Content-Type header — the browser must set its own multipart boundary", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: "doc-1" }) });

    await apiUpload("/companies/x/documents/upload", new FormData());

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["Content-Type"]).toBeUndefined();
  });
});
