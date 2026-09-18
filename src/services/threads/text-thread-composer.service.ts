import { settingsService } from "@/services/settings/settings.service";
import { GoogleGenAI } from "@google/genai";

export type ThreadArchetype = "REGRET_EXPERIENCE" | "UNPOPULAR_OPINION" | "CURATED_LIST";
export type ThreadNiche = "SKINCARE" | "OFFICE_LIFESTYLE" | "FASHION";

export interface ThreadComposeOptions {
  productName: string;
  category?: string;
  niche?: ThreadNiche;
  archetype?: ThreadArchetype;
  productFeatures?: string[];
  painPoints?: string[];
  personalExperience?: string;
  voucherCode?: string;
  voucherDiscount?: string;
  priceFormatted?: string;
  affiliateUrl: string;
}

export interface ComposedThreadResult {
  mainPost: string;
  firstReply: string;
  archetype: ThreadArchetype;
  niche: ThreadNiche;
  modelUsed: string;
  generatedBy: "GEMINI" | "FALLBACK";
  metadata: {
    wordCount: number;
    hasBannedWords: boolean;
    bannedWordsFound: string[];
    hasDiscussionQuestion: boolean;
    hasVoucher: boolean;
  };
}

export const BANNED_MARKETING_WORDS = [
  "sản phẩm chất lượng vượt trội",
  "mang lại hiệu quả thần kỳ",
  "hãy mua ngay",
  "đừng bỏ lỡ",
  "vô cùng tiện lợi",
  "cam kết chính hãng",
  "nhanh tay kẻo lỡ",
  "hàng đầu hiện nay",
  "giải pháp tối ưu",
  "sản phẩm hoàn hảo",
  "siêu phẩm",
  "cơ hội duy nhất",
] as const;

export class TextThreadComposerService {
  /**
   * Scans text for banned marketing buzzwords and calculates word count.
   */
  validateContent(text: string): {
    hasBannedWords: boolean;
    bannedWordsFound: string[];
    wordCount: number;
  } {
    const lower = (text || "").toLowerCase();
    const bannedWordsFound: string[] = [];

    for (const banned of BANNED_MARKETING_WORDS) {
      if (lower.includes(banned.toLowerCase())) {
        bannedWordsFound.push(banned);
      }
    }

    const words = (text || "").trim().split(/\s+/).filter(Boolean);

    return {
      hasBannedWords: bannedWordsFound.length > 0,
      bannedWordsFound,
      wordCount: words.length,
    };
  }

  /**
   * Generates deterministic high-converting fallback content
   * when AI keys are not configured or external LLM fails.
   */
  generateDeterministicFallback(options: ThreadComposeOptions): {
    mainPost: string;
    firstReply: string;
  } {
    const archetype: ThreadArchetype = options.archetype || "REGRET_EXPERIENCE";
    const niche: ThreadNiche = options.niche || "SKINCARE";

    let mainPost = "";

    if (archetype === "REGRET_EXPERIENCE") {
      if (niche === "SKINCARE") {
        mainPost = `Nói thật là tui hối hận vì không tìm hiểu vụ này sớm hơn...\n\nHồi trước da tui cứ lên mụn ẩn liên tục mà không rõ lý do, đắp thêm bao nhiêu serum đắt tiền da càng biểu tình. Sau mới biết là do bước làm sạch và phục hồi màng ẩm bị sai. Đổi sang routine tối giản, tập trung đúng món chân ái phục hồi thì da êm ru trở lại, trộm vía đỡ stress hẳn.\n\nTrong này có ai từng bị cảnh càng skincare kỹ da càng toang giống tui khum? Mng chia sẻ routine với?`;
      } else if (niche === "OFFICE_LIFESTYLE") {
        mainPost = `Nghĩ lại vẫn thấy tiếc, biết thế tui sắm cái này từ đợt mới đi làm văn phòng cho đỡ khổ...\n\nCứ ngồi làm việc 8 tiếng là cổ vai gáy với thắt lưng ê ẩm không chịu nổi, chiều nào về cũng mệt rã rời. Cứ tưởng do mình lười vận động, đến khi setup lại góc ngồi với món phụ kiện công thái học này mới thấy cuộc đời sang trang. Ngồi cả ngày mà lưng thẳng tự nhiên, không bị gù hay mỏi nữa.\n\nỞ đây có ai ngày nào cũng chiến đấu với chứng đau lưng mỏi cổ giống tui khum?`;
      } else {
        // FASHION
        mainPost = `Biết thế tui đổi gu sớm hơn chứ không phí cả đống tiền mua quần áo linh tinh rồi vứt xó...\n\nHồi trước cứ thấy trend gì là đâm đầu vào mua, kết quả tủ đồ chật ních mà sáng nào mở ra cũng thấy 'không có gì để mặc'. Mấy đồ cầu kỳ mặc 1-2 lần là chán. Sau tui quyết định thanh lý hết, chỉ giữ lại mấy món basic form chuẩn, phối gì cũng hợp. Ra đường tút tát 5 phút là xong mà trông vừa thanh lịch vừa có gu hơn hẳn.\n\nMng có hay mua đồ theo trend xong bỏ xó giống tui khum?`;
      }
    } else if (archetype === "UNPOPULAR_OPINION") {
      if (niche === "SKINCARE") {
        mainPost = `Góc nhìn hơi trái chiều một tí nhưng mng cứ thần thánh hóa treatment đắt đỏ chứ tui thấy đồ bình dân mới là chân ái...\n\nNhiều người nghĩ bỏ cả triệu bạc mua đặc trị nồng độ cao mới hết mụn. Nhưng da chưa khỏe mà cứ tống acid với retinol vào là toang ngay. Bản thân tui từng tốn đống tiền cho đồ high-end, cuối cùng lại được cứu bởi một em cấp ẩm làm dịu cực lành tính giá học sinh.\n\nMng nghĩ sao về vụ này? Có ai chuộng đồ dưỡng bình dân mà hiệu quả giống tui khum?`;
      } else if (niche === "OFFICE_LIFESTYLE") {
        mainPost = `Có thể nhiều người không đồng tình, nhưng tui thấy mấy món tiện ích bàn làm việc nhỏ xíu này còn tăng năng suất hơn cả đống app to-do list...\n\nThực tế là không gian ngồi bừa bộn hay tư thế ngồi khó chịu thì vừa làm 15 phút là tụt mood. Đầu tư cho một góc ngồi làm việc thoải mái đem lại tinh thần tích cực tức thì, công việc tự khắc trôi chảy mà không cần gượng ép.\n\nMng thấy sắm đồ cho góc làm việc có thực sự đáng tiền khum?`;
      } else {
        // FASHION
        mainPost = `Chắc nhiều bạn sẽ phản bác, nhưng tui thấy mặc đồ đắt tiền chưa chắc đã đẹp bằng chọn đúng form dáng và chất liệu...\n\nNhiều người bị ám ảnh bởi logo thương hiệu, nhưng đồ có đắt mà form không ôm vừa vặn thì trông vẫn luộm thuộm. Ngược lại, một set đồ basic, giá rất vừa túi nhưng form chuẩn, tôn dáng người mặc thì nhìn sang hơn gấp bội.\n\nTeam mình nghĩ sao về vụ này? Đồ đắt tiền hay form dáng vừa vặn quan trọng hơn trong mắt mng?`;
      }
    } else {
      // CURATED_LIST
      if (niche === "SKINCARE") {
        mainPost = `Top những món cứu rỗi làn da mùa này mà tui ước có người chỉ cho tui từ 3 năm trước...\n\nSau chuỗi ngày thử sai không biết bao nhiêu loại mỹ phẩm, tui rút ra 3 món vàng để da luôn căng mướt:\n1. Sữa rửa mặt dịu nhẹ, không căng rát da.\n2. Một em kem dưỡng phục hồi chân ái, khóa ẩm tốt.\n3. Kem chống nắng mỏng nhẹ, nâng tone tự nhiên.\n\nĐặc biệt món số 2 tui dùng tới tuýp thứ 4 rồi vì quá đỉnh.\n\nCác bác đã tìm được chân ái dưỡng da đời mình chưa?`;
      } else if (niche === "OFFICE_LIFESTYLE") {
        mainPost = `List 3 món cứu sinh cho dân văn phòng ngồi máy lạnh 8 tiếng, thiếu 1 món là thấy ngày dài lê thê...\n\nMuốn làm việc bền bỉ thì góc bàn nhất định phải có:\n1. Bình giữ nhiệt đựng trà hoặc nước ấm cả ngày.\n2. Đệm kê công thái học hỗ trợ thắt lưng để không bị gù khi gõ phím.\n3. Xịt khoáng mini cấp ẩm da mùa điều hòa.\n\nMón số 2 thực sự là vị cứu tinh của đời tui, từ ngày có nó đi làm về không còn ê ẩm người.\n\nBàn làm việc của các bác đang có những bảo bối gì rồi?`;
      } else {
        // FASHION
        mainPost = `3 món đồ basic mà bất kỳ ai theo style tối giản thanh lịch cũng nên có trong tủ đồ...\n\nMuốn sáng ra khỏi nhà mất đúng 5 phút phối đồ mà ai cũng khen có gu, đây là checklist không thể thiếu:\n1. Áo phông form relaxed chất cotton dày dặn.\n2. Quần ống suông tôn dáng, cạp cao hack chân cực đỉnh.\n3. Một đôi giày basic êm chân, phối gì cũng hợp.\n\nMón số 2 mặc lên nhìn chân dài miên man mà giá lại cực kỳ êm ví.\n\nMng thích style phối đồ nào nhất khi đi làm/đi chơi?`;
      }
    }

    let firstReply = `Nhiều bạn tò mò hỏi món tui dùng thì là em này nha: ${options.productName}. Trộm vía dùng ưng bụng và thấy đáng từng đồng luôn ấy.\n\n`;

    if (options.voucherCode) {
      firstReply += `🎟️ Mã shop: ${options.voucherCode}${options.voucherDiscount ? ` (giảm ${options.voucherDiscount})` : ""}\n`;
    }

    if (options.priceFormatted) {
      firstReply += `💵 Giá tham khảo: ~${options.priceFormatted}\n`;
    }

    firstReply += `🔗 Link tui mua ở đây nhé mng: ${options.affiliateUrl}`;

    return { mainPost, firstReply };
  }

  /**
   * Main composition engine.
   * Leverages Google Gemini (GenAI SDK) with authentic Vietnamese copywriting guidelines,
   * falling back smoothly to deterministic high-converting templates.
   */
  async composeThread(options: ThreadComposeOptions): Promise<ComposedThreadResult> {
    const archetype: ThreadArchetype = options.archetype || "REGRET_EXPERIENCE";
    const niche: ThreadNiche = options.niche || "SKINCARE";

    // 1. Retrieve Gemini credentials from secure SettingsService
    const geminiApiKey = await settingsService.getSetting("GEMINI_API_KEY");
    const configuredModel = await settingsService.getSetting("GEMINI_MODEL");
    const modelToUse = configuredModel || "gemini-2.5-flash";

    if (!geminiApiKey) {
      const fallback = this.generateDeterministicFallback(options);
      const validation = this.validateContent(fallback.mainPost);

      return {
        mainPost: fallback.mainPost,
        firstReply: fallback.firstReply,
        archetype,
        niche,
        modelUsed: "deterministic-fallback",
        generatedBy: "FALLBACK",
        metadata: {
          wordCount: validation.wordCount,
          hasBannedWords: validation.hasBannedWords,
          bannedWordsFound: validation.bannedWordsFound,
          hasDiscussionQuestion: fallback.mainPost.includes("?"),
          hasVoucher: !!options.voucherCode,
        },
      };
    }

    // 2. Build Gemini prompt with strict Vietnamese copywriting guidelines
    const prompt = `
Bạn là một chuyên gia sáng tạo nội dung hàng đầu trên Meta Threads tại Việt Nam, chuyên viết bài storytelling chân thực, thu hút hàng chục nghìn lượt tương tác tự nhiên từ tệp người dùng Gen Z và Millennial.

Nhiệm vụ của bạn: Viết một cặp bài đăng Threads gồm 2 phần:
1. MAIN POST (Bài đăng chính):
   - Định dạng: Thuần văn bản (pure text), độ dài khoảng 140 - 230 từ.
   - Giọng điệu: Tự nhiên, gần gũi, đời thường, như một người bạn đang tâm sự trên Threads ("mng", "tui", "nói thật", "chân ái", "u là trời", "khum").
   - Archetype yêu cầu: ${archetype} (Phong cách: ${
      archetype === "REGRET_EXPERIENCE"
        ? "Biết thế mua sớm hơn / Tiếc vì không biết sớm hơn"
        : archetype === "UNPOPULAR_OPINION"
        ? "Góc nhìn trái chiều / Tranh luận lành mạnh"
        : "List đồ cứu rỗi cuộc đời / Curation 3 món tâm đắc"
    }).
   - Chủ đề / Niche: ${niche}.
   - Vấn đề / Nỗi đau: ${options.painPoints?.join(", ") || "vấn đề nan giải đời thường"}.
   - QUY TẮC BẮT BUỘC CHO MAIN POST:
     + TUYỆT ĐỐI KHÔNG nhắc tên sản phẩm "${options.productName}", không nhắc thương hiệu, không nhắc giá tiền, không đính kèm bất kỳ đường link nào.
     + KẾT BÀI BẮT BUỘC là một câu hỏi mở tự nhiên để kích thích thảo luận và tranh luận dưới phần bình luận (VD: "Có ai bị tình trạng này khum?", "Mng thấy sao về vụ này?").
     + TUYỆT ĐỐI KHÔNG dùng văn phong bán hàng thô thiển, sáo rỗng. CẤM các cụm từ sau: ${BANNED_MARKETING_WORDS.map((w) => `"${w}"`).join(", ")}.

2. FIRST REPLY (Bình luận đầu tiên - Monetization Payoff):
   - Giải đáp thắc mắc tự nhiên (như thể trả lời câu hỏi của độc giả).
   - Tiết lộ tên sản phẩm: "${options.productName}".
   - Nêu ngắn gọn lý do vì sao nó hiệu quả hoặc mẹo sử dụng thực tế.
   ${options.voucherCode ? `- Đính kèm mã voucher: "🎟️ Mã shop: ${options.voucherCode} ${options.voucherDiscount ? `(giảm ${options.voucherDiscount})` : ""}"` : ""}
   ${options.priceFormatted ? `- Đính kèm mức giá: "💵 Giá tham khảo: ~${options.priceFormatted}"` : ""}
   - Đính kèm link affiliate: "🔗 Link tui mua ở đây nhé mng: ${options.affiliateUrl}".

Trả về định dạng JSON thuần túy (không thêm markdown backticks thừa nếu có thể, hoặc dùng JSON block chuẩn):
{
  "mainPost": "Nội dung main post thuần text...",
  "firstReply": "Nội dung first reply kèm sản phẩm, voucher, link..."
}
`;

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
      });

      const responseText = response.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.mainPost && parsed.firstReply) {
          let cleanedMainPost = String(parsed.mainPost).trim();
          let cleanedFirstReply = String(parsed.firstReply).trim();

          // Ensure product name was not accidentally leaked into main post
          if (cleanedMainPost.toLowerCase().includes(options.productName.toLowerCase())) {
            // Replace product name in main post with generic pronoun
            cleanedMainPost = cleanedMainPost.replace(
              new RegExp(options.productName, "gi"),
              "món đồ này"
            );
          }

          // Ensure affiliate link is present in first reply
          if (!cleanedFirstReply.includes(options.affiliateUrl)) {
            cleanedFirstReply += `\n\n🔗 Link tui mua ở đây nhé: ${options.affiliateUrl}`;
          }

          const validation = this.validateContent(cleanedMainPost);

          return {
            mainPost: cleanedMainPost,
            firstReply: cleanedFirstReply,
            archetype,
            niche,
            modelUsed: modelToUse,
            generatedBy: "GEMINI",
            metadata: {
              wordCount: validation.wordCount,
              hasBannedWords: validation.hasBannedWords,
              bannedWordsFound: validation.bannedWordsFound,
              hasDiscussionQuestion: cleanedMainPost.includes("?"),
              hasVoucher: !!options.voucherCode,
            },
          };
        }
      }
    } catch (aiErr) {
      console.warn("Gemini generation encountered error, falling back to deterministic template:", aiErr);
    }

    // Fallback if Gemini fails or returns invalid format
    const fallback = this.generateDeterministicFallback(options);
    const validation = this.validateContent(fallback.mainPost);

    return {
      mainPost: fallback.mainPost,
      firstReply: fallback.firstReply,
      archetype,
      niche,
      modelUsed: "deterministic-fallback",
      generatedBy: "FALLBACK",
      metadata: {
        wordCount: validation.wordCount,
        hasBannedWords: validation.hasBannedWords,
        bannedWordsFound: validation.bannedWordsFound,
        hasDiscussionQuestion: fallback.mainPost.includes("?"),
        hasVoucher: !!options.voucherCode,
      },
    };
  }
}

export const textThreadComposerService = new TextThreadComposerService();
