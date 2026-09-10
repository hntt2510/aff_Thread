import { describe, it, expect } from "vitest";
import { shopeeCookieService } from "@/services/shopee/shopee-cookie.service";

describe("ShopeeCookieService", () => {
  const sampleCookieEditorJson = JSON.stringify([
    {
      name: "SPC_EC",
      value: "sec_token_12345",
      domain: ".shopee.vn",
      path: "/",
    },
    {
      name: "SPC_ST",
      value: "sess_token_67890",
      domain: ".shopee.vn",
      path: "/",
    },
    {
      name: "SPC_U",
      value: "operator_username",
      domain: ".shopee.vn",
      path: "/",
    },
    {
      name: "_ga",
      value: "GA1.1.123456",
      domain: ".shopee.vn",
      path: "/",
    },
  ]);

  const sampleRawHeader =
    "SPC_EC=sec_token_12345; SPC_ST=sess_token_67890; SPC_U=operator_username; _ga=GA1.1.123456;";

  it("successfully parses Cookie-Editor JSON array format", () => {
    const res = shopeeCookieService.parseCookies(sampleCookieEditorJson);
    expect(res.valid).toBe(true);
    expect(res.cookies["SPC_EC"]).toBe("sec_token_12345");
    expect(res.cookies["SPC_ST"]).toBe("sess_token_67890");
    expect(res.cookies["SPC_U"]).toBe("operator_username");
    expect(res.cookieHeader).toContain("SPC_EC=sec_token_12345");
    expect(res.cookieHeader).toContain("SPC_ST=sess_token_67890");
  });

  it("successfully parses raw HTTP Cookie header string", () => {
    const res = shopeeCookieService.parseCookies(sampleRawHeader);
    expect(res.valid).toBe(true);
    expect(res.cookies["SPC_EC"]).toBe("sec_token_12345");
    expect(res.cookies["SPC_ST"]).toBe("sess_token_67890");
    expect(res.cookies["SPC_U"]).toBe("operator_username");
  });

  it("rejects empty cookie input", () => {
    const res = shopeeCookieService.parseCookies("");
    expect(res.valid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("rejects cookies that lack any Shopee authentication tokens", () => {
    const nonShopeeInput = "foo=bar; baz=qux; tracking_id=99999;";
    const res = shopeeCookieService.parseCookies(nonShopeeInput);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("required Shopee session tokens");
  });

  it("correctly round-trips AES-256-GCM encryption and decryption", () => {
    const originalCookies = {
      SPC_EC: "super_secret_cookie_value_12345",
      SPC_ST: "another_secret_token_67890",
      SPC_U: "shopee_account_id",
    };

    const encrypted = shopeeCookieService.encryptCookies(originalCookies);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toContain("super_secret_cookie_value_12345");

    const decrypted = shopeeCookieService.decryptCookies(encrypted);
    expect(decrypted).toEqual(originalCookies);
  });
});
