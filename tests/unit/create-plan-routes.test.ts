import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createShopeePlanRoute } from "@/app/api/shopee/matcher/create-plan/route";
import { POST as createMonetizationPlanRoute } from "@/app/api/monetization/plans/route";
import { monetizationService } from "@/services/monetization.service";

describe("Create Plan API Routes - Sanitization of Empty Strings", () => {
  it("POST /api/shopee/matcher/create-plan cleanses empty strings before calling monetizationService.createPlan", async () => {
    const createPlanSpy = vi
      .spyOn(monetizationService, "createPlan")
      .mockResolvedValueOnce({
        plan: {
          id: "plan-mock-123",
          postId: "post-123",
          status: "READY",
          source: "SHOPEE_DEAL_ENGINE",
          scoreAtCreation: null,
          scheduledAt: null,
          triggerMode: "DELAY",
          targetViews: 300,
          targetReplies: 2,
          maxWaitHours: 12,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        replies: [],
      });

    const req = new NextRequest("http://localhost:3000/api/shopee/matcher/create-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: "post-123",
        replyText: "Con đầm xịn xò nè mng ơi",
        directAffiliateUrl: "https://s.shopee.vn/mock123",
        targetPublishAt: "",
        scheduledAt: "",
        score: "",
        scoreAtCreation: "",
        targetViews: "",
        targetReplies: "",
        maxWaitHours: "",
      }),
    });

    const res = await createShopeePlanRoute(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(createPlanSpy).toHaveBeenCalledTimes(1);
    const calledWith = createPlanSpy.mock.calls[0][0];

    // Verify empty strings were forwarded as empty string or null, and that createPlan handles them
    expect(calledWith.postId).toBe("post-123");
    expect(calledWith.source).toBe("SHOPEE_DEAL_ENGINE");
    expect(calledWith.replies[0].replyText).toBe("Con đầm xịn xò nè mng ơi");
  });

  it("POST /api/monetization/plans cleanses empty strings before calling monetizationService.createPlan", async () => {
    const createPlanSpy = vi
      .spyOn(monetizationService, "createPlan")
      .mockResolvedValueOnce({
        plan: {
          id: "plan-mock-456",
          postId: "post-456",
          status: "READY",
          source: "MANUAL",
          scoreAtCreation: null,
          scheduledAt: null,
          triggerMode: "DELAY",
          targetViews: 300,
          targetReplies: 2,
          maxWaitHours: 12,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        replies: [],
      });

    const req = new NextRequest("http://localhost:3000/api/monetization/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: "post-456",
        source: "MANUAL",
        scheduledAt: "",
        scoreAtCreation: "",
        replies: [
          {
            replyText: "Reply manual",
            scheduledAt: "",
          },
        ],
      }),
    });

    const res = await createMonetizationPlanRoute(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(createPlanSpy).toHaveBeenCalledTimes(1);
  });
});
