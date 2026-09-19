import {
  type ThreadArchetype,
  type ThreadNiche,
  type ThreadComposeOptions,
  sanitizeProductTitle,
  inferNiche,
} from "./thread-composer-utils";

export interface ParsedGeminiThread {
  mainPost: string;
  firstReply: string;
}

/**
 * Builds an optimized, high-converting copywriting prompt for Google Gemini Web / Gems.
 * Enforces pure-problem storytelling, strictly no product name or links in Main Post,
 * ending with an engaging question, and payoff chốt deal in First Reply.
 */
export function buildThreadsComposerPrompt(options: ThreadComposeOptions): string {
  const cleanTitle = sanitizeProductTitle(options.productName) || options.productName.trim();
  const detectedNiche = inferNiche(options.category, options.productName);
  const niche: ThreadNiche = options.niche || detectedNiche;
  const archetype: ThreadArchetype = options.archetype || "REGRET_EXPERIENCE";

  let archetypeGuide = "";
  if (archetype === "REGRET_EXPERIENCE") {
    archetypeGuide = `Phong cách "Biết thế mua sớm hơn": Kể về sự vật lộn, bực bội hoặc trớ trêu khi gặp vấn đề trong thời gian dài mà không biết cách giải quyết. Cảm giác hối hận vì không tìm hiểu sớm.`;
  } else if (archetype === "UNPOPULAR_OPINION") {
    archetypeGuide = `Phong cách "Góc nhìn trái chiều / Tranh luận": Đưa ra nhận xét thực tế, thẳng thắn phản bác những định kiến hoặc thói quen phổ biến đang gây phiền toái. Kích thích người đọc vào tranh luận.`;
  } else {
    archetypeGuide = `Phong cách "List đồ cứu rỗi / Top 3 món": Đề cập đến những tình huống nan giải và tiêu chí chọn đồ thực dụng. Kích thích sự tò mò muốn biết cách giải quyết triệt để.`;
  }

  let nicheGuide = "";
  if (niche === "FASHION") {
    nicheGuide = `Ngách Thời Trang & Phụ Kiện: Tập trung vào nỗi đau mặc đồ hớ hênh, phối đồ luộm thuộm, tôn dáng thất bại, chọn sai form hoặc bất tiện khi di chuyển.`;
  } else if (niche === "OFFICE_LIFESTYLE") {
    nicheGuide = `Ngách Dân Văn Phòng / Setup: Tập trung vào nỗi đau ngồi làm việc 8-10 tiếng ê ẩm lưng cổ, setup bàn bừa bộn mất tập trung, mệt mỏi buồn ngủ xế chiều.`;
  } else {
    nicheGuide = `Ngách Skincare / Mỹ Phẩm: Tập trung vào nỗi đau da bùng mụn, treatment đỏ rát, đổ dầu bóng nhẫy, bôi kem chống nắng vón cục hoặc dùng đủ thứ đắt tiền mà da vẫn toang.`;
  }

  const promptParts = [
    `Bạn là một chuyên gia sáng tạo nội dung hàng đầu trên Meta Threads tại Việt Nam, chuyên về storytelling lan tỏa tự nhiên (organic reach) và tiếp thị liên kết (affiliate marketing) theo phong cách Gen Z chân thực, gần gũi, tuyệt đối không mang giọng điệu quảng cáo lộ liễu.`,
    ``,
    `Hãy viết 1 cặp bài đăng gồm:`,
    `1. Bài đăng chính (Main Post - Bait Post): Nhằm thu hút lượng view và thảo luận tự nhiên cực lớn.`,
    `2. Bình luận đầu tiên (First Reply - Payoff): Bình luận của chính tác giả để tiết lộ giải pháp và đính kèm link mua.`,
    ``,
    `=== THÔNG TIN CHIẾN DỊCH ===`,
    `- Sản phẩm chốt đơn: ${cleanTitle}`,
    `- Chủ đề / Ngách: ${nicheGuide}`,
    `- Định hướng phong cách: ${archetypeGuide}`,
    options.painPoints && options.painPoints.length > 0
      ? `- Trải nghiệm / Nỗi đau thực tế: ${options.painPoints.join("; ")}`
      : null,
    options.priceFormatted ? `- Mức giá tham khảo: ~${options.priceFormatted}` : null,
    options.voucherCode
      ? `- Mã giảm giá Shopee: ${options.voucherCode}${options.voucherDiscount ? ` (Giảm ${options.voucherDiscount})` : ""}`
      : null,
    `- Link affiliate Shopee: ${options.affiliateUrl}`,
    ``,
    `=== QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ) ===`,
    `1. BÀI ĐĂNG CHÍNH (MAIN POST):`,
    `   - TẬP TRUNG 100% VÀO NỖI ĐAU, SỰ CỐ, TÌNH HUỐNG TRỚ TRÊU HOẶC SỰ BẤT TIỆN CỦA BẢN THÂN.`,
    `   - TUYỆT ĐỐI KHÔNG nhắc tên bất kỳ sản phẩm hay thương hiệu nào (kể cả "${cleanTitle}").`,
    `   - TUYỆT ĐỐI KHÔNG chèn bất kỳ đường link nào (để tránh Threads bóp tương tác).`,
    `   - TUYỆT ĐỐI KHÔNG khoe khoang "chân ái", "đã tìm được giải pháp", "cứu cánh cuộc đời" (không được nói là đã giải quyết xong).`,
    `   - KẾT BÀI BẮT BUỘC bằng đúng 1 câu hỏi mở xin lời khuyên, đồng cảm hoặc kinh nghiệm của cộng đồng (VD: "Có ai từng bị tình trạng này khum, đi đứng sao cho đỡ lo vậy mng?", "Mng có ai bị giống tui khum, làm sao cho đỡ vậy các bác?").`,
    `   - Giới hạn độ dài: Rất ngắn gọn, súc tích, BẮT BUỘC dưới 450 ký tự (Threads giới hạn 500 ký tự).`,
    ``,
    `2. BÌNH LUẬN ĐẦU TIÊN (FIRST REPLY):`,
    `   - Đóng vai chính tác giả quay trở lại bình luận sau khi độc giả tò mò hỏi thăm.`,
    `   - Mở đầu tự nhiên: "U là trời, biết ngay mng sẽ hỏi mà! Tui hay ${niche === "FASHION" ? "mặc con" : "dùng em"} ${cleanTitle} này nè..." kèm lý do ngắn gọn vì sao nó giải quyết nỗi đau trên.`,
    options.voucherCode
      ? `   - Nhắc mã giảm giá: "🎟️ Mã shop: ${options.voucherCode}${options.voucherDiscount ? ` (giảm ${options.voucherDiscount})` : ""}"`
      : null,
    options.priceFormatted ? `   - Mức giá: "💵 Giá tham khảo: ~${options.priceFormatted}"` : null,
    `   - Đính kèm link affiliate: "🔗 Link tui mua ở đây nhé mng: ${options.affiliateUrl}"`,
    ``,
    `=== ĐỊNH DẠNG ĐẦU RA BẮT BUỘC ===`,
    `Hãy trả về kết quả theo đúng cấu trúc phân tách sau (không giải thích thêm):`,
    ``,
    `=== MAIN POST ===`,
    `[Nội dung bài đăng chính ở đây, thuần text, kết bài bằng câu hỏi]`,
    ``,
    `=== FIRST REPLY ===`,
    `[Nội dung bình luận đầu tiên ở đây, kèm tên sản phẩm và link affiliate]`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return promptParts;
}

/**
 * Robustly parses raw text output from Gemini into Main Post and First Reply.
 * Handles delimited format (=== MAIN POST === / === FIRST REPLY ===),
 * Markdown headers (## Main Post), JSON blocks, and labeled sections.
 */
export function parseGeminiResponse(rawText: string): ParsedGeminiThread {
  if (!rawText || !rawText.trim()) {
    return { mainPost: "", firstReply: "" };
  }

  const text = rawText.trim();

  // 1. Try JSON block if Gemini replied in JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.mainPost || parsed.firstReply) {
        return {
          mainPost: String(parsed.mainPost || "").trim(),
          firstReply: String(parsed.firstReply || "").trim(),
        };
      }
    } catch {
      // Fall through to regex delimiter parsing
    }
  }

  // 2. Try standard delimiter: === MAIN POST === and === FIRST REPLY ===
  const mainDelimRegex = /(?:={2,}\s*MAIN POST\s*={2,}|#{1,3}\s*(?:Bài Đăng Chính|Main Post)|(?:^|\n)(?:BÀI ĐĂNG CHÍNH|MAIN POST)\s*:?)/i;
  const replyDelimRegex = /(?:={2,}\s*FIRST REPLY\s*={2,}|#{1,3}\s*(?:Bình Luận Đầu Tiên|First Reply)|(?:^|\n)(?:BÌNH LUẬN ĐẦU TIÊN|FIRST REPLY)\s*:?)/i;

  const mainMatch = text.search(mainDelimRegex);
  const replyMatch = text.search(replyDelimRegex);

  if (mainMatch !== -1 && replyMatch !== -1 && replyMatch > mainMatch) {
    const afterMain = text.slice(mainMatch);
    const mainHeaderMatch = afterMain.match(mainDelimRegex);
    const mainHeaderLen = mainHeaderMatch ? mainHeaderMatch[0].length : 0;

    const mainContentRaw = text.slice(mainMatch + mainHeaderLen, replyMatch);
    const afterReply = text.slice(replyMatch);
    const replyHeaderMatch = afterReply.match(replyDelimRegex);
    const replyHeaderLen = replyHeaderMatch ? replyHeaderMatch[0].length : 0;
    const replyContentRaw = text.slice(replyMatch + replyHeaderLen);

    return {
      mainPost: cleanExtractedText(mainContentRaw),
      firstReply: cleanExtractedText(replyContentRaw),
    };
  }

  // 3. Fallback: Check if reply delimiter exists anywhere
  if (replyMatch !== -1) {
    const mainPart = text.slice(0, replyMatch);
    const afterReply = text.slice(replyMatch);
    const replyHeaderMatch = afterReply.match(replyDelimRegex);
    const replyHeaderLen = replyHeaderMatch ? replyHeaderMatch[0].length : 0;
    const replyPart = text.slice(replyMatch + replyHeaderLen);

    return {
      mainPost: cleanExtractedText(mainPart),
      firstReply: cleanExtractedText(replyPart),
    };
  }

  // 4. If no delimiters matched, return entire text in main post
  return {
    mainPost: cleanExtractedText(text),
    firstReply: "",
  };
}

function cleanExtractedText(input: string): string {
  let cleaned = input.trim();
  // Strip bounding quotes if present
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("“") && cleaned.endsWith("”")) ||
    (cleaned.startsWith("`") && cleaned.endsWith("`"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Strip leading/trailing markdown fences
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
  return cleaned;
}
