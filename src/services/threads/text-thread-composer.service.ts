import { settingsService } from "@/services/settings/settings.service";
import { GoogleGenAI } from "@google/genai";
import {
  type ThreadArchetype,
  type ThreadNiche,
  type ThreadComposeOptions,
  type ComposedThreadResult,
  BANNED_MARKETING_WORDS,
  sanitizeProductTitle,
  inferNiche,
  trimPostLength,
  validateMarketingContent,
} from "@/lib/threads/thread-composer-utils";

export type { ThreadArchetype, ThreadNiche, ThreadComposeOptions, ComposedThreadResult };
export {
  BANNED_MARKETING_WORDS,
  sanitizeProductTitle,
  inferNiche,
  trimPostLength,
  validateMarketingContent,
};

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
   * Programmatically trims a generated post to stay strictly <= maxChars (default 450 chars)
   * while preserving the concluding interaction question.
   */
  trimPostLength(text: string, maxChars = 450): string {
    if (!text || text.length <= maxChars) return text;

    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return text.slice(0, maxChars);

    const lastPara = paragraphs[paragraphs.length - 1];
    const hasQuestion = lastPara.includes("?");

    let question = hasQuestion ? lastPara : "";
    const bodyParas = hasQuestion ? paragraphs.slice(0, -1) : paragraphs;

    if (question.length > 100) {
      question = question.slice(0, 97) + "...?";
    }

    const maxBodyChars = maxChars - (question ? question.length + 2 : 0);

    let currentBody = "";
    for (const para of bodyParas) {
      const candidate = currentBody ? `${currentBody}\n\n${para}` : para;
      if (candidate.length <= maxBodyChars) {
        currentBody = candidate;
      } else {
        const sentences = para.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          const sentCandidate = currentBody ? `${currentBody} ${sentence}` : sentence;
          if (sentCandidate.length <= maxBodyChars) {
            currentBody = sentCandidate;
          } else {
            break;
          }
        }
        break;
      }
    }

    if (!currentBody && bodyParas.length > 0) {
      const words = bodyParas[0].split(/\s+/);
      let sliced = "";
      for (const w of words) {
        if ((sliced + " " + w).length <= maxBodyChars - 3) {
          sliced = sliced ? `${sliced} ${w}` : w;
        } else break;
      }
      currentBody = sliced ? `${sliced}...` : bodyParas[0].slice(0, Math.max(10, maxBodyChars - 3)) + "...";
    }

    const finalPost = question ? `${currentBody}\n\n${question}` : currentBody;
    return finalPost.length <= maxChars ? finalPost : finalPost.slice(0, maxChars);
  }

  /**
   * Generates deterministic high-converting fallback content
   * when AI keys are not configured or external LLM fails.
   */
  generateDeterministicFallback(options: ThreadComposeOptions): {
    mainPost: string;
    firstReply: string;
  } {
    const cleanProductName = sanitizeProductTitle(options.productName) || options.productName;
    const detectedNiche = inferNiche(options.category, options.productName);
    let niche: ThreadNiche = options.niche || detectedNiche;

    if (detectedNiche === "FASHION" && niche === "SKINCARE") {
      niche = "FASHION";
    } else if (detectedNiche === "SKINCARE" && niche === "FASHION") {
      niche = "SKINCARE";
    }

    const archetype: ThreadArchetype = options.archetype || "REGRET_EXPERIENCE";

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

    if (mainPost.length > 450) {
      mainPost = this.trimPostLength(mainPost, 450);
    }

    let productRef = cleanProductName;
    if (niche === "FASHION") {
      productRef = `con ${cleanProductName} này`;
    } else if (niche === "OFFICE_LIFESTYLE") {
      productRef = `em ${cleanProductName} này`;
    } else {
      productRef = `em ${cleanProductName} này`;
    }

    let firstReply = `Nhiều bạn tò mò hỏi thì món tui dùng trong bài là ${productRef} nha. Trộm vía dùng ưng bụng và thấy đáng từng đồng luôn ấy.\n\n`;

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
    const cleanProductName = sanitizeProductTitle(options.productName) || options.productName;
    const detectedNiche = inferNiche(options.category, options.productName);
    let niche: ThreadNiche = options.niche || detectedNiche;

    // Strict safety check: auto-align niche to prevent mismatch hallucinations
    if (detectedNiche === "FASHION" && niche === "SKINCARE") {
      niche = "FASHION";
    } else if (detectedNiche === "SKINCARE" && niche === "FASHION") {
      niche = "SKINCARE";
    }

    const archetype: ThreadArchetype = options.archetype || "REGRET_EXPERIENCE";

    // 1. Retrieve Gemini credentials from secure SettingsService
    const geminiApiKey = await settingsService.getSetting("GEMINI_API_KEY");
    const configuredModel = await settingsService.getSetting("GEMINI_MODEL");
    const modelToUse = configuredModel || "gemini-2.5-flash";

    if (!geminiApiKey) {
      const fallback = this.generateDeterministicFallback({
        ...options,
        productName: cleanProductName,
        niche,
      });
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

    // 2. Build Gemini prompt with strict Vietnamese copywriting guidelines and 450-char constraint
    const prompt = `
Bạn là một chuyên gia sáng tạo nội dung hàng đầu trên Meta Threads tại Việt Nam, chuyên viết bài storytelling chân thực, thu hút hàng chục nghìn lượt tương tác tự nhiên từ tệp người dùng Gen Z và Millennial.

Nhiệm vụ của bạn: Viết một cặp bài đăng Threads gồm 2 phần:
1. MAIN POST (Bài đăng chính):
   - HARD CONSTRAINT VỀ ĐỘ DÀI: BẮT BUỘC trong khoảng 250 đến 420 ký tự (Meta Threads giới hạn 500 ký tự). TUYỆT ĐỐI KHÔNG viết quá 450 ký tự.
   - Bố cục: Tối đa 2 - 3 đoạn văn ngắn gọn, ngắt dòng thoáng, súc tích.
   - Giọng điệu: Tự nhiên, gần gũi, đời thường, như một người bạn đang tâm sự trên Threads ("mng", "tui", "nói thật", "chân ái", "u là trời", "khum").
   - Archetype yêu cầu: ${archetype} (Phong cách: ${
      archetype === "REGRET_EXPERIENCE"
        ? "Biết thế mua sớm hơn / Tiếc vì không biết sớm hơn"
        : archetype === "UNPOPULAR_OPINION"
        ? "Góc nhìn trái chiều / Tranh luận lành mạnh"
        : "List đồ cứu rỗi cuộc đời / Curation 3 món tâm đắc"
    }).
   - Chủ đề / Niche BẮT BUỘC: ${niche}.
   - QUY ĐỊNH NGHIÊM NGẶT THEO NICHE:
     ${
       niche === "FASHION"
         ? "+ Chủ đề THỜI TRANG: Kể về trải nghiệm phối đồ, form dáng hack chân/eo, chất liệu vải, tự tin ra đường. TUYỆT ĐỐI KHÔNG nhắc đến mụn, da liễu hay dưỡng ẩm!"
         : niche === "OFFICE_LIFESTYLE"
         ? "+ Chủ đề VĂN PHÒNG / LIFESTYLE: Kể về nỗi ám ảnh đau lưng mỏi cổ, tư thế ngồi, setup bàn làm việc, góc làm việc truyền cảm hứng. KHÔNG nhắc mụn hay da dẻ!"
         : "+ Chủ đề SKINCARE: Kể về phục hồi màng ẩm, tối giản chu trình dưỡng, cấp nước, chống nắng, dịu da."
     }
   - Vấn đề / Nỗi đau: ${options.painPoints?.join(", ") || "vấn đề nan giải đời thường"}.
   - QUY TẮC BẮT BUỘC CHO MAIN POST:
     + TUYỆT ĐỐI KHÔNG nhắc tên sản phẩm "${cleanProductName}", không nhắc tên shop/thương hiệu, không nhắc giá tiền, không đính kèm bất kỳ đường link nào.
     + KẾT BÀI BẮT BUỘC là đúng 1 câu hỏi mở ngắn gọn (dưới 60 ký tự) để kích thích thảo luận dưới phần bình luận (VD: "Có ai bị tình trạng này khum?", "Mng thấy sao về vụ này?").
     + TUYỆT ĐỐI KHÔNG dùng văn phong bán hàng sáo rỗng. CẤM các cụm từ sau: ${BANNED_MARKETING_WORDS.map((w) => `"${w}"`).join(", ")}.

2. FIRST REPLY (Bình luận đầu tiên - Monetization Payoff):
   - Giải đáp thắc mắc tự nhiên (như thể trả lời câu hỏi của độc giả).
   - Tiết lộ tên sản phẩm một cách thân mật: "${cleanProductName}".
   - Nêu ngắn gọn lý do vì sao nó hiệu quả hoặc mẹo sử dụng thực tế.
   ${options.voucherCode ? `- Đính kèm mã voucher: "🎟️ Mã shop: ${options.voucherCode} ${options.voucherDiscount ? `(giảm ${options.voucherDiscount})` : ""}"` : ""}
   ${options.priceFormatted ? `- Đính kèm mức giá: "💵 Giá tham khảo: ~${options.priceFormatted}"` : ""}
   - Đính kèm link affiliate: "🔗 Link tui mua ở đây nhé mng: ${options.affiliateUrl}".

Trả về định dạng JSON thuần túy (không thêm markdown backticks thừa nếu có thể, hoặc dùng JSON block chuẩn):
{
  "mainPost": "Nội dung main post thuần text (250 - 420 ký tự)...",
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
          if (
            cleanedMainPost.toLowerCase().includes(cleanProductName.toLowerCase()) ||
            cleanedMainPost.toLowerCase().includes(options.productName.toLowerCase())
          ) {
            cleanedMainPost = cleanedMainPost
              .replace(new RegExp(cleanProductName, "gi"), "món đồ này")
              .replace(new RegExp(options.productName, "gi"), "món đồ này");
          }

          // Enforce hard character limit <= 450 chars
          if (cleanedMainPost.length > 450) {
            cleanedMainPost = this.trimPostLength(cleanedMainPost, 450);
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
    const fallback = this.generateDeterministicFallback({
      ...options,
      productName: cleanProductName,
      niche,
    });
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
