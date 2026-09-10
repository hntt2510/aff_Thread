import { describe, it, expect } from "vitest";
import {
  shopeeVoucherStackerService,
  ShopeeVoucherStackerService,
} from "@/services/shopee/shopee-voucher-stacker.service";

describe("ShopeeVoucherStackerService", () => {
  it("stacks Shop percentage voucher and Platform voucher baseline (10% capped at 25k)", () => {
    const res = shopeeVoucherStackerService.stackVouchers({
      basePrice: 353800,
      originalPrice: 450000,
      shopVoucher: {
        code: "SHOP20",
        discountType: "PERCENT",
        discountPercent: 20,
      },
    });

    expect(res.basePrice).toBe(353800);
    expect(res.originalPrice).toBe(450000);
    expect(res.hasShopVoucher).toBe(true);
    expect(res.hasPlatformVoucher).toBe(true);
    // 20% of 353800 = 70760
    expect(res.shopDiscountAmount).toBe(70760);
    // 10% of 353800 = 35380, capped at 25000
    expect(res.platformDiscountAmount).toBe(25000);
    expect(res.totalDiscountAmount).toBe(70760 + 25000);
    expect(res.finalPrice).toBe(353800 - (70760 + 25000));
    expect(res.shopVoucherCode).toBe("SHOP20");
    expect(res.explanation).toContain("Shop Voucher");
    expect(res.explanation).toContain("Platform Voucher");
  });

  it("stacks fixed Shop voucher and platform voucher", () => {
    const res = shopeeVoucherStackerService.stackVouchers({
      basePrice: 500000,
      shopVoucher: {
        code: "GIAM50K",
        discountType: "FIXED",
        discountAmount: 50000,
      },
    });

    expect(res.shopDiscountAmount).toBe(50000);
    expect(res.platformDiscountAmount).toBe(25000);
    expect(res.finalPrice).toBe(425000);
  });

  it("applies platform baseline voucher when no shop voucher exists to attract clicks", () => {
    const res = shopeeVoucherStackerService.stackVouchers({
      basePrice: 200000,
    });

    expect(res.hasShopVoucher).toBe(false);
    expect(res.hasPlatformVoucher).toBe(true);
    expect(res.shopDiscountAmount).toBe(0);
    // 10% of 200000 = 20000 (< 25k cap)
    expect(res.platformDiscountAmount).toBe(20000);
    expect(res.finalPrice).toBe(180000);
  });

  it("respects shop voucher minSpend requirement", () => {
    const res = shopeeVoucherStackerService.stackVouchers({
      basePrice: 150000,
      shopVoucher: {
        code: "MIN300K",
        discountPercent: 15,
        minSpend: 300000, // Not met
      },
    });

    expect(res.hasShopVoucher).toBe(false);
    expect(res.shopDiscountAmount).toBe(0);
    // Platform voucher still applies
    expect(res.hasPlatformVoucher).toBe(true);
    expect(res.platformDiscountAmount).toBe(15000);
    expect(res.finalPrice).toBe(135000);
  });

  it("handles disabled platform voucher configuration", () => {
    const res = shopeeVoucherStackerService.stackVouchers({
      basePrice: 100000,
      shopVoucher: {
        code: "SHOP10",
        discountPercent: 10,
      },
      platformVoucherConfig: {
        enabled: false,
      },
    });

    expect(res.hasShopVoucher).toBe(true);
    expect(res.shopDiscountAmount).toBe(10000);
    expect(res.hasPlatformVoucher).toBe(false);
    expect(res.platformDiscountAmount).toBe(0);
    expect(res.finalPrice).toBe(90000);
  });
});
