import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as getTopOffersRoute,
  POST as postTopOffersRoute,
} from "@/app/api/shopee/top-offers/route";

describe("Shopee Top Rate Offers API Integration", () => {
  const sampleApiItem = {
    item_id: "55913200112",
    long_link: "https://shopee.vn/universal-link/product/top-gia-tissue-55913200112",
    product_link: "https://shopee.vn/product/123/55913200112",
    default_commission_rate: "21,5%",
    seller_commission_rate: "19%",
    batch_item_for_item_card_full: {
      itemid: "55913200112",
      name: "Khăn giấy rút Top Gia Thùng 6 bịch 4 lớp siêu dai mềm mịn",
      price: "9520000000",
      price_before_discount: "11200000000",
      discount: "20%",
      image: "vn-11134207-81ztc-mq51jbk4ledq68",
      historical_sold_text: "51",
      shop_name: "Home Plus Store",
      item_rating: { rating_star: 4.8 },
    },
  };

  it("POST /api/shopee/top-offers rejects invalid empty payload", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/top-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await postTopOffersRoute(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("POST /api/shopee/top-offers imports and upserts raw Shopee REST items successfully", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/top-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          list: [sampleApiItem],
        },
      }),
    });

    const res = await postTopOffersRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
    expect(data.topOffers[0].itemId).toBe("55913200112");
    expect(data.topOffers[0].price).toBe(95200);
    expect(data.topOffers[0].rate).toBe(21.5);
  });

  it("GET /api/shopee/top-offers retrieves top offers with filtering and stats", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/shopee/top-offers?search=Kh%C4%83n%20gi%E1%BA%A5y&sortBy=rate_desc"
    );

    const res = await getTopOffersRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThanOrEqual(1);

    const found = data.items.find((i: any) => i.itemId === "55913200112");
    expect(found).toBeDefined();
    expect(found.title).toContain("Khăn giấy");
    expect(found.rate).toBe(21.5);
    expect(found.price).toBe(95200);
  });
});
