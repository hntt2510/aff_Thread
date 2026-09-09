import { describe, it, expect } from "vitest";
import { inspectDatabaseSchema, ensureDatabaseSchema } from "@/db/migrate";

describe("Admin Schema Migration and Inspection", () => {
  it("inspects database schema accurately", async () => {
    const result = await inspectDatabaseSchema();
    expect(result).toBeDefined();
    expect(Array.isArray(result.appliedMigrations)).toBe(true);
    expect(result.appliedMigrations.length).toBeGreaterThanOrEqual(1);

    expect(typeof result.schemaObjects.postsMediaType).toBe("boolean");
    expect(typeof result.schemaObjects.postsProcessingStatus).toBe("boolean");
    expect(typeof result.schemaObjects.postMediaTable).toBe("boolean");
    expect(typeof result.schemaObjects.affiliateCampaignsTable).toBe("boolean");
    expect(typeof result.schemaObjects.affiliateLinksTable).toBe("boolean");
    expect(typeof result.schemaObjects.postAffiliateLinksTable).toBe("boolean");
    expect(typeof result.schemaObjects.affiliateClicksTable).toBe("boolean");
    expect(typeof result.schemaObjects.schedulerRunsTable).toBe("boolean");

    expect(result.allObjectsExist).toBe(true);
    expect(result.is0003Applied).toBe(true);
    expect(result.is0004Applied).toBe(true);
    expect(result.is0005Applied).toBe(true);
  });

  it("is idempotent when running ensureDatabaseSchema repeatedly", async () => {
    await expect(ensureDatabaseSchema()).resolves.not.toThrow();

    const after = await inspectDatabaseSchema();
    expect(after.allObjectsExist).toBe(true);
    expect(after.is0003Applied).toBe(true);
    expect(after.is0004Applied).toBe(true);
    expect(after.is0005Applied).toBe(true);
  });
});
