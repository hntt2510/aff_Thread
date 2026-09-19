import { settingsService } from "@/services/settings/settings.service";
import { GoogleGenAI } from "@google/genai";
import {
  type ThreadArchetype,
  type ThreadNiche,
  type ThreadComposeOptions,
  type ComposedThreadResult,
  BANNED_MARKETING_WORDS,
  BANNED_BAIT_SOLUTION_WORDS,
  sanitizeProductTitle,
  inferNiche,
  trimPostLength,
  validateMarketingContent,
} from "@/lib/threads/thread-composer-utils";

export type { ThreadArchetype, ThreadNiche, ThreadComposeOptions, ComposedThreadResult };
export {
  BANNED_MARKETING_WORDS,
  BANNED_BAIT_SOLUTION_WORDS,
  sanitizeProductTitle,
  inferNiche,
  trimPostLength,
  validateMarketingContent,
};

export class TextThreadComposerService {
  /**
   * Scans text for banned marketing buzzwords and calculates word count.
   * When isMainPost is true, also checks for premature solution reveals ("chân ái").
   */
  validateContent(text: string, isMainPost = false): {
    hasBannedWords: boolean;
    bannedWordsFound: string[];
    wordCount: number;
  } {
    return validateMarketingContent(text, isMainPost);
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
        mainPost = `Nói thật là tui ám ảnh cái đợt da bùng mụn mất kiểm soát kinh khủng...\n\nCứ đến mùa ẩm ương là mụn ẩn với mụn viêm thi nhau nổi, càng rửa mặt kỹ với thoa đủ thứ kem đặc trị thì da càng đỏ rát, bong tróc biểu tình. Ra đường lúc nào cũng phải đeo khẩu trang kín mít vì tự ti, gặp ai cũng bị hỏi sao đợt này da tệ thế.\n\nCó ai từng rơi vào cảnh càng cố skincare da lại càng toang giống tui khum? Vượt qua kiểu gì vậy mng?`;
      } else if (niche === "OFFICE_LIFESTYLE") {
        mainPost = `Ám ảnh kinh hoàng của dân văn phòng ngồi máy tính 8 tiếng một ngày...\n\nSáng đi làm hừng hực khí thế mà đến tầm 3h chiều là thắt lưng với cổ vai gáy ê ẩm như có tạ đè, ngồi không yên mà đứng cũng không xong. Chiều tối về nhà chỉ muốn nằm bẹp một chỗ không làm nổi việc gì khác, cảm giác người già trước tuổi thực sự.\n\nMng làm công sở có ai bị tình trạng đau lưng mỏi cổ liên tục này khum, chữa kiểu gì cho đỡ vậy các bác?`;
      } else {
        // FASHION
        mainPost = `Nói thật là tui ám ảnh cái vụ mặc đồ ngắn ra đường lắm mng ơi...\n\nCứ mặc váy ngắn hay quần short là đi đứng mất tự nhiên hẳn, vừa bước đi vừa lo ngay ngáy sợ hớ hênh. Nhất là mấy bữa gió thổi qua cứ phải lấy tay giữ miết, rồi lúc lên xuống xe máy cũng lúng ta lúng túng dã man.\n\nCó ai từng bị cái cảm giác đi đâu cũng nơm nớp lo giữ đồ như tui khum, đi đứng sao cho đỡ lo vậy mng?`;
      }
    } else if (archetype === "UNPOPULAR_OPINION") {
      if (niche === "SKINCARE") {
        mainPost = `Không biết có ai bị giống tui không, chứ tui thấy skincare nhiều bước quá chỉ tổ làm da thêm bí bách...\n\nNgày trước tui đu trend layer 7749 bước, từ toner, essence, 3 loại serum đến kem dưỡng dày cộp. Kết quả là bít tắc lỗ chân lông, da nổi sần sùi tùm lum mà tốn cả đống tiền. Càng cố chấp bôi trét thì da càng yếu đi thấy rõ.\n\nCó ai từng thử đủ cách dưỡng mà da vẫn cứ dở chứng giống tui khum? Mng chia sẻ trải nghiệm với?`;
      } else if (niche === "OFFICE_LIFESTYLE") {
        mainPost = `Tui nhận ra nhiều khi công việc áp lực 1 thì cái ghế với góc bàn làm việc hành hạ mình tới 10...\n\nNgồi làm việc cả ngày trong văn phòng mà tư thế cứ phải cúi gập người nhìn màn hình, chuột với bàn phím đặt lệch tầm tay làm cổ tay mỏi nhừ. Chiều nào tan làm cũng cảm giác cạn kiệt năng lượng chỉ vì ngồi sai tư thế.\n\nMng ngồi văn phòng cả ngày làm sao để không bị gù lưng với mỏi nhừ người vậy mng?`;
      } else {
        // FASHION
        mainPost = `Tui thấy nỗi khổ lớn nhất khi chọn quần áo không phải là thiếu tiền, mà là mặc gì lên người cũng thấy dìm dáng...\n\nMua đồ theo mẫu mặc trên mạng nhìn mê mẩn, đến lúc ship về mặc thử thì lộ hết khuyết điểm bụng dưới với đùi to. Sáng nào chuẩn bị đi làm cũng thay ra thay vào 4-5 bộ mà vẫn thấy tự ti, mất cả tiếng đồng hồ.\n\nCó ai gặp tình trạng nhìn đồ thì đẹp mà mặc lên người cứ thấy sai sai giống tui khum?`;
      }
    } else {
      // CURATED_LIST
      if (niche === "SKINCARE") {
        mainPost = `Combo 3 nỗi sợ lớn nhất của tui mỗi lần da bước vào mùa nhạy cảm ẩm ương:\n\n1. Vừa rửa mặt xong da đã căng rát, đỏ ửng hai bên má.\n2. Mụn ẩn li ti nổi dưới cằm không chịu lặn dù bôi đủ thứ.\n3. Đánh kem chống nắng hay cushion là bị mốc meo, tróc vảy từng mảng.\n\nNhiều lúc nhìn vào gương mà phát khóc vì bất lực luôn ấy.\n\nDa các bác đợt này có ổn khum, ai có kinh nghiệm chăm da nhạy cảm cứu tui với?`
      } else if (niche === "OFFICE_LIFESTYLE") {
        mainPost = `3 combo hủy diệt sức khỏe của dân công sở mà ngày nào tui cũng phải chịu trận:\n\n1. Màn hình máy tính ngang tầm ngực làm cổ phải cúi gập liên tục.\n2. Ghế ngồi quá cứng làm đau thắt lưng dưới cả ngày.\n3. Máy lạnh phả thẳng vào đầu gây khô họng và đau mỏi vai gáy.\n\nĐi làm kiếm đồng lương mà người ngợm rệu rã hết cả.\n\nCác bác dân văn phòng vượt qua chuỗi ngày ngồi 8 tiếng này bằng cách nào vậy?`;
      } else {
        // FASHION
        mainPost = `Top 3 combo mặc đồ khiến tui muốn quay xe đi về ngay lập tức mỗi khi ra đường:\n\n1. Quần cạp thấp ngồi xuống là hở lưng, đứng lên lại phải kéo.\n2. Váy ngắn cũn cỡn gió thổi nhẹ một cái là tim đập chân run.\n3. Vải thô cứng cọ vào người ngứa ngáy khó chịu cả ngày.\n\nNhiều khi chỉ ước có đồ gì mặc vừa xinh vừa an toàn tuyệt đối thôi.\n\nMng có nỗi ám ảnh nào khi chọn đồ mặc ra ngoài khum?`;
      }
    }

    if (mainPost.length > 450) {
      mainPost = this.trimPostLength(mainPost, 450);
    }

    let productPrefix = "em";
    if (niche === "FASHION") {
      productPrefix = "con";
    }

    let firstReply = `U là trời, biết ngay mng sẽ hỏi mà! Tui hay mặc/xài ${productPrefix} ${cleanProductName} này nè, cứu cánh đời tui luôn á. Form dáng vừa vặn mà mặc êm ru không lo gì nữa.\n\n`;

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
      const validation = this.validateContent(fallback.mainPost, true);

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
1. MAIN POST (Bài đăng chính - Bait Post Thuần Vấn Đề):
   - HARD CONSTRAINT VỀ ĐỘ DÀI: BẮT BUỘC trong khoảng 250 đến 420 ký tự (Meta Threads giới hạn 500 ký tự). TUYỆT ĐỐI KHÔNG viết quá 450 ký tự.
   - Bố cục: Tối đa 2 - 3 đoạn văn ngắn gọn, ngắt dòng thoáng, súc tích.
   - Giọng điệu: Tự nhiên, gần gũi, đời thường, như một người bạn đang tâm sự trên Threads ("mng", "tui", "nói thật", "u là trời", "khum").
   - Archetype yêu cầu: ${archetype}.
   - Chủ đề / Niche BẮT BUỘC: ${niche}.
   - QUY ĐỊNH NGHIÊM NGẶT THEO NICHE:
     ${
       niche === "FASHION"
         ? "+ Chủ đề THỜI TRANG: Kể về nỗi ám ảnh/bất tiện khi mặc đồ, sợ hớ hênh, đi đứng lúng túng, form dìm dáng, bí bách. TUYỆT ĐỐI KHÔNG nhắc đến mụn, da liễu hay dưỡng ẩm!"
         : niche === "OFFICE_LIFESTYLE"
         ? "+ Chủ đề VĂN PHÒNG / LIFESTYLE: Kể về nỗi ám ảnh đau lưng mỏi cổ, ngồi sai tư thế, mệt mỏi sau 8 tiếng công sở. KHÔNG nhắc mụn hay da dẻ!"
         : "+ Chủ đề SKINCARE: Kể về khủng hoảng bùng mụn, da đỏ rát bong tróc, tự ti khi ra đường."
     }
   - Vấn đề / Nỗi đau: ${options.painPoints?.join(", ") || "nỗi ám ảnh hoặc sự bất tiện đời thường"}.
   - QUY TẮC CỐT LÕI CHO MAIN POST (BẮT BUỘC TUÂN THỦ):
     + TẬP TRUNG 100% VÀO NỖI ĐAU, SỰ KHÓ CHỊU, TÌNH HUỐNG TRỚ TRÊU HOẶC ÁM ẢNH CỦA BẢN THÂN.
     + TUYỆT ĐỐI KHÔNG khoe khoang 'chân ái', TUYỆT ĐỐI KHÔNG nói 'vậy mà giờ tui mới tìm ra...', TUYỆT ĐỐI KHÔNG NÓI LÀ ĐÃ GIẢI QUYẾT ĐƯỢC VẤN ĐỀ!
     + TUYỆT ĐỐI KHÔNG gợi ý giải pháp, KHÔNG nhắc tên bất kỳ sản phẩm hay thương hiệu nào ("${cleanProductName}"), không nhắc giá, không đính kèm link.
     + KẾT BÀI BẮT BUỘC bằng đúng 1 câu hỏi mở xin lời khuyên, đồng cảm hoặc hỏi kinh nghiệm của cộng đồng (VD: 'Có ai từng bị tình trạng này khum, đi đứng sao cho đỡ lo vậy mng?', 'Mng có ai bị giống tui khum, làm sao cho đỡ vậy các bác?').
     + TUYỆT ĐỐI CẤM các cụm từ sau: ${[...BANNED_MARKETING_WORDS, ...BANNED_BAIT_SOLUTION_WORDS].map((w) => `"${w}"`).join(", ")}.

2. FIRST REPLY (Bình luận đầu tiên - Monetization Payoff):
   - Đóng vai chính tác giả quay trở lại bình luận chia sẻ món đồ/cách giải quyết sau khi độc giả tò mò hỏi thăm.
   - Hook mở đầu BẮT BUỘC theo mẫu: "U là trời, biết ngay mng sẽ hỏi mà! Tui hay ${niche === "FASHION" ? "mặc con" : "dùng em"} ${cleanProductName} này nè..." kèm lý do ngắn gọn vì sao nó cứu cánh nỗi đau trên.
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

          const validation = this.validateContent(cleanedMainPost, true);

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
    const validation = this.validateContent(fallback.mainPost, true);

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
