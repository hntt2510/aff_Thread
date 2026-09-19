import { describe, it, expect } from "vitest";
import {
  buildThreadsComposerPrompt,
  parseGeminiResponse,
} from "@/lib/threads/thread-prompt-builder";

describe("Thread Prompt Builder & Response Parser", () => {
  describe("buildThreadsComposerPrompt", () => {
    it("builds a structured prompt with sanitized product title and affiliate link", () => {
      const prompt = buildThreadsComposerPrompt({
        productName: "Chân Váy Kaki Dáng Ngắn Có Lót Trong BigSize Hannako - fashion Cl",
        affiliateUrl: "https://s.shopee.vn/test1234",
        niche: "FASHION",
        archetype: "REGRET_EXPERIENCE",
        voucherCode: "FASHION20K",
        voucherDiscount: "20k",
        priceFormatted: "159.000đ",
        painPoints: ["Mặc váy ngắn hay bị co kéo, sợ gió thổi hớ hênh"],
      });

      // Product title should be sanitized (no Hannako or SEO buzzwords)
      expect(prompt).toContain("chân váy kaki dáng ngắn có lót trong");
      expect(prompt).not.toContain("Hannako");

      // Niche & Archetype instructions
      expect(prompt).toContain("Thời Trang & Phụ Kiện");
      expect(prompt).toContain("Biết thế mua sớm hơn");

      // Pain points & details
      expect(prompt).toContain("Mặc váy ngắn hay bị co kéo, sợ gió thổi hớ hênh");
      expect(prompt).toContain("FASHION20K");
      expect(prompt).toContain("159.000đ");
      expect(prompt).toContain("https://s.shopee.vn/test1234");

      // Strict Core Rules
      expect(prompt).toContain("BÀI ĐĂNG CHÍNH (MAIN POST)");
      expect(prompt).toContain("TUYỆT ĐỐI KHÔNG nhắc tên bất kỳ sản phẩm hay thương hiệu nào");
      expect(prompt).toContain("TUYỆT ĐỐI KHÔNG chèn bất kỳ đường link nào");
      expect(prompt).toContain("KẾT BÀI BẮT BUỘC bằng đúng 1 câu hỏi mở");
      expect(prompt).toContain("450 ký tự");

      // First reply rules
      expect(prompt).toContain("BÌNH LUẬN ĐẦU TIÊN (FIRST REPLY)");
      expect(prompt).toContain("U là trời, biết ngay mng sẽ hỏi mà!");

      // Required delimiters
      expect(prompt).toContain("=== MAIN POST ===");
      expect(prompt).toContain("=== FIRST REPLY ===");
    });

    it("handles optional fields gracefully when voucher or pain points are missing", () => {
      const prompt = buildThreadsComposerPrompt({
        productName: "Kem B5 La Roche-Posay",
        affiliateUrl: "https://s.shopee.vn/b5aff",
      });

      expect(prompt).toContain("b5 la roche-posay");
      expect(prompt).toContain("https://s.shopee.vn/b5aff");
      expect(prompt).not.toContain("undefined");
      expect(prompt).not.toContain("null");
    });
  });

  describe("parseGeminiResponse", () => {
    it("correctly parses standard === MAIN POST === and === FIRST REPLY === delimiters", () => {
      const rawText = `
=== MAIN POST ===
Nói thật là tui ám ảnh vụ mặc chân váy ngắn lắm mng ơi. Cứ ra đường là sợ hớ hênh, đi đứng khum dám tự nhiên luôn á.

Có ai từng bị tình trạng này khum, làm sao cho đỡ lo vậy mng?

=== FIRST REPLY ===
U là trời, biết ngay mng sẽ hỏi mà! Tui hay mặc con chân váy kaki lót trong này nè, quẩy thoải mái luôn á.

🎟️ Mã shop: VAY20K
💵 Giá tham khảo: ~149.000đ
🔗 Link tui mua ở đây nhé mng: https://s.shopee.vn/test123
`;

      const result = parseGeminiResponse(rawText);

      expect(result.mainPost).toContain("Nói thật là tui ám ảnh vụ mặc chân váy ngắn");
      expect(result.mainPost).toContain("Có ai từng bị tình trạng này khum");
      expect(result.mainPost).not.toContain("FIRST REPLY");

      expect(result.firstReply).toContain("U là trời, biết ngay mng sẽ hỏi mà!");
      expect(result.firstReply).toContain("https://s.shopee.vn/test123");
    });

    it("correctly parses markdown heading format", () => {
      const rawText = `
## Main Post
Dân văn phòng ngồi 8 tiếng một ngày đau lưng ê ẩm cả người...
Có bác nào có tips gì đỡ đau lưng khum?

## First Reply
U là trời, biết ngay mng sẽ hỏi mà! Tui hay dùng cái gối tựa công thái học này nè.
Link ở đây: https://s.shopee.vn/goi123
`;

      const result = parseGeminiResponse(rawText);

      expect(result.mainPost).toContain("Dân văn phòng ngồi 8 tiếng");
      expect(result.firstReply).toContain("gối tựa công thái học");
      expect(result.firstReply).toContain("https://s.shopee.vn/goi123");
    });

    it("correctly parses JSON output format", () => {
      const rawText = `\`\`\`json
{
  "mainPost": "Da treatment đỏ rát bôi gì cũng xót... Có ai bị giống tui khum?",
  "firstReply": "U là trời! Tui dùng em serum B5 này nè: https://s.shopee.vn/serum"
}
\`\`\``;

      const result = parseGeminiResponse(rawText);

      expect(result.mainPost).toBe("Da treatment đỏ rát bôi gì cũng xót... Có ai bị giống tui khum?");
      expect(result.firstReply).toBe("U là trời! Tui dùng em serum B5 này nè: https://s.shopee.vn/serum");
    });

    it("handles empty or malformed text gracefully", () => {
      expect(parseGeminiResponse("")).toEqual({ mainPost: "", firstReply: "" });
      expect(parseGeminiResponse("   ")).toEqual({ mainPost: "", firstReply: "" });

      const unstructured = "Đây là một đoạn text bình thường không có cấu trúc";
      const res = parseGeminiResponse(unstructured);
      expect(res.mainPost).toBe(unstructured);
      expect(res.firstReply).toBe("");
    });
  });
});
