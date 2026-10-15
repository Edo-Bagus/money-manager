import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const TOKEN = "test-ingest-token-0123456789abcdef";

function ingestRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ingest/email", {
    method: "POST",
    headers: { "content-type": "message/rfc822", ...headers },
    body: "From: bank@example.com\r\nSubject: Test\r\n\r\nbody",
  });
}

describe("POST /api/ingest/email", () => {
  beforeEach(() => {
    vi.stubEnv("INGEST_TOKEN", TOKEN);
  });

  it("returns 202 without processing when X-Ingest-Token matches", async () => {
    const request = ingestRequest({ "X-Ingest-Token": TOKEN });

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect(request.bodyUsed).toBe(false);
  });

  it("returns 401 when X-Ingest-Token does not match", async () => {
    const request = ingestRequest({ "X-Ingest-Token": `${TOKEN.slice(0, -1)}X` });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });

  it("returns 401 when X-Ingest-Token is missing", async () => {
    const response = await POST(ingestRequest());

    expect(response.status).toBe(401);
  });

  it("returns 401 for a token of a different length", async () => {
    const response = await POST(ingestRequest({ "X-Ingest-Token": "short" }));

    expect(response.status).toBe(401);
  });

  it.each([
    ["unset", ""],
    ["too short", "short-token"],
  ])("rejects every request when INGEST_TOKEN is %s", async (_label, configured) => {
    vi.stubEnv("INGEST_TOKEN", configured);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(ingestRequest({ "X-Ingest-Token": configured }));

    expect(response.status).toBe(401);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
