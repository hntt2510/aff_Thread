import fs from "node:fs";
import path from "node:path";

// Load environment variables (.env.local or .env)
const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envLocalPath)) {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(envLocalPath);
  } else {
    fs.readFileSync(envLocalPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const [k, ...v] = line.split("=");
        if (k && v.length) process.env[k.trim()] = v.join("=").trim();
      });
  }
} else if (fs.existsSync(envPath)) {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(envPath);
  }
}

import {
  shopeeTopOffersService,
  type RawShopeeProductItem,
} from "../src/services/shopee/shopee-top-offers.service";

const SAMPLE_OFFERS: RawShopeeProductItem[] = [
  {
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
  },
  {
    item_id: "88204910321",
    long_link: "https://shopee.vn/universal-link/product/son-kem-blackrouge-88204910321",
    product_link: "https://shopee.vn/product/456/88204910321",
    default_commission_rate: "25%",
    seller_commission_rate: "20%",
    batch_item_for_item_card_full: {
      itemid: "88204910321",
      name: "Son Kem Lì Black Rouge Air Fit Velvet Tint Ver 9 Chính Hãng",
      price: "18500000000",
      price_before_discount: "23000000000",
      discount: "20%",
      image: "vn-11134207-7r98o-lstb4g78b4z720",
      historical_sold_text: "1.2k",
      shop_name: "Beauty Official Store",
      item_rating: { rating_star: 4.9 },
    },
  },
  {
    item_id: "33109284102",
    long_link: "https://shopee.vn/universal-link/product/tai-nghe-baseus-bowie-m2",
    product_link: "https://shopee.vn/product/789/33109284102",
    default_commission_rate: "18,5%",
    seller_commission_rate: "15%",
    batch_item_for_item_card_full: {
      itemid: "33109284102",
      name: "Tai nghe Bluetooth True Wireless Baseus Bowie M2 Chống Ồn ANC",
      price: "69000000000",
      price_before_discount: "85000000000",
      discount: "19%",
      image: "vn-11134207-7qukw-lj23i8x8k5s876",
      historical_sold_text: "3.4k",
      shop_name: "Baseus Flagship",
      item_rating: { rating_star: 4.7 },
    },
  },
  {
    item_id: "19283746501",
    long_link: "https://shopee.vn/universal-link/product/ban-phim-xinmeng-m71",
    product_link: "https://shopee.vn/product/999/19283746501",
    default_commission_rate: "22%",
    seller_commission_rate: "18%",
    batch_item_for_item_card_full: {
      itemid: "19283746501",
      name: "Bàn Phím Cơ Không Dây Xinmeng M71 Nhôm CNC Gasket Mount RGB",
      price: "145000000000",
      price_before_discount: "165000000000",
      discount: "12%",
      image: "vn-11134207-7r98o-lk923j4k2j4k12",
      historical_sold_text: "840",
      shop_name: "Gear Zone Vietnam",
      item_rating: { rating_star: 5.0 },
    },
  },
  {
    item_id: "66472819034",
    long_link: "https://shopee.vn/universal-link/product/noi-chien-khong-dau-philips",
    product_link: "https://shopee.vn/product/888/66472819034",
    default_commission_rate: "16,8%",
    seller_commission_rate: "14%",
    batch_item_for_item_card_full: {
      itemid: "66472819034",
      name: "Nồi Chiên Không Dầu Điện Tử Philips HD9252/90 Dung Tích 4.1L",
      price: "169000000000",
      price_before_discount: "229000000000",
      discount: "26%",
      image: "vn-11134207-7r98o-ll19283j123j45",
      historical_sold_text: "5.1k",
      shop_name: "Philips Home Appliance",
      item_rating: { rating_star: 4.8 },
    },
  },
];

async function fetchFromShopeeApi(cookie: string, limit = 50): Promise<RawShopeeProductItem[]> {
  const url = `https://affiliate.shopee.vn/api/v3/offer/product/list?page=1&limit=${limit}`;
  console.log(`[Shopee REST] Fetching offers directly from: ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Referer: "https://affiliate.shopee.vn/",
      Cookie: cookie,
    },
  });

  if (!res.ok) {
    throw new Error(`Shopee API responded with HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const list = json?.data?.list || json?.list || [];
  return list;
}

function extractItemsFromJson(content: any): RawShopeeProductItem[] {
  return shopeeTopOffersService.extractProductList(content);
}

async function main() {
  const args = process.argv.slice(2);

  let rawItems: RawShopeeProductItem[] = [];

  const sampleArg = args.includes("--sample");
  const cookieArgIdx = args.indexOf("--cookie");
  const fileArgIdx = args.indexOf("--file");

  if (sampleArg) {
    console.log("👉 Using built-in sample data (5 top rate offers)...");
    rawItems = SAMPLE_OFFERS;
  } else if (cookieArgIdx !== -1 && args[cookieArgIdx + 1]) {
    const cookie = args[cookieArgIdx + 1];
    rawItems = await fetchFromShopeeApi(cookie);
  } else if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
    const filePath = path.resolve(process.cwd(), args[fileArgIdx + 1]);
    console.log(`📂 Reading JSON from file: ${filePath}`);
    const text = fs.readFileSync(filePath, "utf8");
    rawItems = extractItemsFromJson(JSON.parse(text));
  } else if (args.length > 0 && !args[0].startsWith("-")) {
    const filePath = path.resolve(process.cwd(), args[0]);
    console.log(`📂 Reading JSON from file: ${filePath}`);
    const text = fs.readFileSync(filePath, "utf8");
    rawItems = extractItemsFromJson(JSON.parse(text));
  } else {
    // Default fallback: if sample file exists or fallback to sample
    const sampleFilePath = path.resolve(process.cwd(), "offers.json");
    if (fs.existsSync(sampleFilePath)) {
      console.log(`📂 Found local offers.json, importing...`);
      const text = fs.readFileSync(sampleFilePath, "utf8");
      rawItems = extractItemsFromJson(JSON.parse(text));
    } else {
      console.log("ℹ️ No input file provided. Using built-in sample offers. Use --file <path> to import a JSON file.");
      rawItems = SAMPLE_OFFERS;
    }
  }

  console.log(`\n📦 Total raw items received: ${rawItems.length}`);

  // 1. Data Transformation, Filtering (rate > 0), and Sorting (rate desc)
  const sortedOffers = shopeeTopOffersService.filterAndSortOffers(rawItems);
  console.log(`✅ Filtered valid offers with commission (rate > 0%): ${sortedOffers.length}`);

  if (sortedOffers.length === 0) {
    console.log("⚠️ No valid offers with positive commission rate found.");
    return;
  }

  // 2. Display Table in Console
  console.log("\n📊 Top Rate Offers Preview:");
  console.table(
    sortedOffers.slice(0, 10).map((o, idx) => ({
      Rank: idx + 1,
      Title: o.title.length > 38 ? o.title.substring(0, 35) + "..." : o.title,
      Price: `${o.price.toLocaleString("vi-VN")}đ`,
      Discount: o.discount || "—",
      Rate: `${o.rate}%`,
      Shop: o.shopName || "—",
      Sold: o.sold || "0",
    }))
  );

  // 3. Upsert into Database
  console.log("💾 Upserting offers into PostgreSQL database...");
  const result = await shopeeTopOffersService.upsertTopOffers(sortedOffers);

  console.log(`\n🎉 Import Complete!`);
  console.log(`- Upserted Products: ${result.upsertedProducts}`);
  console.log(`- Created/Updated Offers: ${result.createdOffers}`);
  console.log(`- Created Deal Observations: ${result.createdObservations}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
