/**
 * P5 — Health Endpoint Security Tests
 *
 * Verifies that /api/health never exposes DB errors, connection strings,
 * hostnames, credentials, or stack traces to anonymous public callers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ─── mock drizzle db before importing the route ─────────────────────────────

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { GET } from "@/app/api/health/route";
import { db } from "@/db";

const mockExecute = db.execute as ReturnType<typeof vi.fn>;

// ─── helpers ─────────────────────────────────────────────────────────────────

async function callHealthRoute(): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const response = await GET();
  const body = await response.json();
  return { status: response.status, body };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("GET /api/health — healthy path", () => {
  beforeEach(() => {
    mockExecute.mockResolvedValue([{ "?column?": 1 }]);
  });

  it("returns 200 with status:healthy when DB is reachable", async () => {
    const { status, body } = await callHealthRoute();
    expect(status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.app).toBe("alive");
    expect(body.database).toBe("connected");
  });

  it("does not expose internal fields on success", async () => {
    const { body } = await callHealthRoute();
    // Should only have these safe keys
    const keys = Object.keys(body).sort();
    expect(keys).not.toContain("error");
    expect(keys).not.toContain("stack");
    expect(keys).not.toContain("message");
  });
});

describe("GET /api/health — degraded path (DB failure)", () => {
  const sensitiveValues = [
    "postgresql://",
    "postgres://",
    "localhost",
    "password",
    "ECONNREFUSED",
    "connect ETIMEDOUT",
    "FATAL",
    "stack",
  ];

  beforeEach(() => {
    mockExecute.mockRejectedValue(
      new Error(
        "connect ECONNREFUSED postgresql://secret_user:secret_pass@db.internal.corp:5432/prod_db"
      )
    );
  });

  it("returns 503 when DB is unreachable", async () => {
    const { status } = await callHealthRoute();
    expect(status).toBe(503);
  });

  it("returns status:degraded on DB failure", async () => {
    const { body } = await callHealthRoute();
    expect(body.status).toBe("degraded");
    expect(body.app).toBe("alive");
    expect(body.database).toBe("unreachable");
  });

  it("never exposes DB error details, credentials, or connection strings in response body", async () => {
    const { body } = await callHealthRoute();
    const bodyStr = JSON.stringify(body).toLowerCase();

    for (const sensitive of sensitiveValues) {
      expect(bodyStr).not.toContain(sensitive.toLowerCase());
    }
  });

  it("does not include an 'error' field in the public response body", async () => {
    const { body } = await callHealthRoute();
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("message");
    expect(body).not.toHaveProperty("stack");
  });

  it("response body has exactly the safe keys: status, app, database", async () => {
    const { body } = await callHealthRoute();
    const keys = Object.keys(body).sort();
    expect(keys).toEqual(["app", "database", "status"]);
  });

  it("does not expose connection string even when error contains full URL", async () => {
    mockExecute.mockRejectedValue(
      new Error("failed to connect: postgresql://admin:hunter2@db.example.com/mydb")
    );
    const { body } = await callHealthRoute();
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("admin");
    expect(JSON.stringify(body)).not.toContain("db.example.com");
  });
});
