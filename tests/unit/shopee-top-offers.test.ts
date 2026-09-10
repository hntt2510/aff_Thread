import { describe, it, expect } from "vitest";
import { shopeeTopOffersService, type RawShopeeProductItem } from "@/services/shopee/shopee-top-offers.service";

describe("ShopeeTopOffersService Data Transformation", () => {
  const sampleUserItem: RawShopeeProductItem = {
    item_id: "55913200112",
    long_link: "https://shopee.vn/universal-link/product/top-gia-tissue",
    product_link: "https://shopee.vn/product/123/55913200112",
    default_commission_rate: "21,5%",
    seller_commission_rate: "19%",
    batch_item_for_item_card_full: {
      itemid: "55913200112",
      name: "Khăn giấy rút Top Gia Thùng 6 bịch...",
      price: "9520000000",
      price_before_discount: "11200000000",
      discount: "20%",
      image: "vn-11134207-81ztc-mq51jbk4ledq68",
      historical_sold_text: "51",
      shop_name: "Home Plus Store",
      item_rating: { rating_star: 4.8 },
    },
  };

  it("transforms a raw Shopee REST API item accurately according to specification", () => {
    const offer = shopeeTopOffersService.transformShopeeOffer(sampleUserItem);

    expect(offer.itemId).toBe("55913200112");
    expect(offer.title).toBe("Khăn giấy rút Top Gia Thùng 6 bịch...");
    expect(offer.price).toBe(95200); // 9520000000 / 100000
    expect(offer.originalPrice).toBe(112000); // 11200000000 / 100000
    expect(offer.discount).toBe("20%");
    expect(offer.rate).toBe(21.5); // "21,5%" parsed to number
    expect(offer.sellerRate).toBe(19); // "19%" parsed to number
    expect(offer.imageUrl).toBe(
      "https://down-vn.img.susercontent.com/file/vn-11134207-81ztc-mq51jbk4ledq68"
    );
    expect(offer.affUrl).toBe("https://shopee.vn/universal-link/product/top-gia-tissue");
    expect(offer.sold).toBe("51");
    expect(offer.soldCount).toBe(51);
    expect(offer.rating).toBe(4.8);
    expect(offer.shopName).toBe("Home Plus Store");
  });

  it("handles fallback to product_link if long_link is missing", () => {
    const itemWithoutLongLink: RawShopeeProductItem = {
      ...sampleUserItem,
      long_link: "",
      product_link: "https://shopee.vn/product/fallback-url",
    };

    const offer = shopeeTopOffersService.transformShopeeOffer(itemWithoutLongLink);
    expect(offer.affUrl).toBe("https://shopee.vn/product/fallback-url");
  });

  it("parses dot-decimal and comma-decimal commission rates correctly", () => {
    const itemWithDot: RawShopeeProductItem = {
      ...sampleUserItem,
      default_commission_rate: "18.75%",
    };
    expect(shopeeTopOffersService.transformShopeeOffer(itemWithDot).rate).toBe(18.75);

    const itemWithComma: RawShopeeProductItem = {
      ...sampleUserItem,
      default_commission_rate: "25,4%",
    };
    expect(shopeeTopOffersService.transformShopeeOffer(itemWithComma).rate).toBe(25.4);
  });

  it("filters out items with rate <= 0 and sorts by rate descending", () => {
    const rawList: RawShopeeProductItem[] = [
      {
        item_id: "item1",
        default_commission_rate: "10%",
        batch_item_for_item_card_full: { name: "Product A", price: "5000000000" },
      },
      {
        item_id: "item2",
        default_commission_rate: "0%", // Should be filtered out
        batch_item_for_item_card_full: { name: "Product Zero", price: "3000000000" },
      },
      {
        item_id: "item3",
        default_commission_rate: "25%",
        batch_item_for_item_card_full: { name: "Product C", price: "8000000000" },
      },
      {
        item_id: "item4",
        default_commission_rate: "15,5%",
        batch_item_for_item_card_full: { name: "Product B", price: "6000000000" },
      },
    ];

    const result = shopeeTopOffersService.filterAndSortOffers(rawList);

    expect(result.length).toBe(3);
    expect(result[0].itemId).toBe("item3");
    expect(result[0].rate).toBe(25);
    expect(result[1].itemId).toBe("item4");
    expect(result[1].rate).toBe(15.5);
    expect(result[2].itemId).toBe("item1");
    expect(result[2].rate).toBe(10);
  });

  describe("extractProductList", () => {
    it("extracts from direct array", () => {
      const input = [{ item_id: "101" }, { item_id: "102" }];
      expect(shopeeTopOffersService.extractProductList(input)).toEqual(input);
    });

    it("extracts from standard Shopee response { code: 0, data: { list: [...] } }", () => {
      const items = [{ item_id: "201" }];
      expect(shopeeTopOffersService.extractProductList({ code: 0, data: { list: items } })).toEqual(items);
    });

    it("extracts from { list: [...] }", () => {
      const items = [{ item_id: "301" }];
      expect(shopeeTopOffersService.extractProductList({ list: items })).toEqual(items);
    });

    it("extracts from { data: { products: [...] } } and { products: [...] }", () => {
      const items1 = [{ item_id: "401" }];
      const items2 = [{ item_id: "402" }];
      expect(shopeeTopOffersService.extractProductList({ data: { products: items1 } })).toEqual(items1);
      expect(shopeeTopOffersService.extractProductList({ products: items2 })).toEqual(items2);
    });

    it("extracts from { data: { items: [...] } } and { items: [...] }", () => {
      const items1 = [{ item_id: "501" }];
      const items2 = [{ item_id: "502" }];
      expect(shopeeTopOffersService.extractProductList({ data: { items: items1 } })).toEqual(items1);
      expect(shopeeTopOffersService.extractProductList({ items: items2 })).toEqual(items2);
    });

    it("extracts from stringified JSON", () => {
      const items = [{ item_id: "601" }];
      const jsonStr = JSON.stringify({ data: { list: items } });
      expect(shopeeTopOffersService.extractProductList(jsonStr)).toEqual(items);
    });

    it("extracts from UI wrapper { rawData: ... }", () => {
      const items = [{ item_id: "701" }];
      const jsonStr = JSON.stringify({ data: { list: items } });
      expect(shopeeTopOffersService.extractProductList({ rawData: jsonStr })).toEqual(items);
    });

    it("returns empty array for invalid input", () => {
      expect(shopeeTopOffersService.extractProductList(null)).toEqual([]);
      expect(shopeeTopOffersService.extractProductList("invalid json string")).toEqual([]);
      expect(shopeeTopOffersService.extractProductList({})).toEqual([]);
    });
  });

  describe("Item field fallback mappings", () => {
    it("maps item_id from item.item_id || item.itemid || item.batch_item_for_item_card_full?.itemid", () => {
      expect(shopeeTopOffersService.transformShopeeOffer({ item_id: "id_1" }).itemId).toBe("id_1");
      expect(shopeeTopOffersService.transformShopeeOffer({ itemid: "id_2" }).itemId).toBe("id_2");
      expect(
        shopeeTopOffersService.transformShopeeOffer({
          batch_item_for_item_card_full: { itemid: "id_3" },
        }).itemId
      ).toBe("id_3");
    });

    it("maps commission_rate from default_commission_rate || commission_rate || seller_commission_rate || '0%'", () => {
      expect(
        shopeeTopOffersService.transformShopeeOffer({
          item_id: "1",
          default_commission_rate: "12%",
        }).rate
      ).toBe(12);

      expect(
        shopeeTopOffersService.transformShopeeOffer({
          item_id: "1",
          commission_rate: "15,5%",
        }).rate
      ).toBe(15.5);

      expect(
        shopeeTopOffersService.transformShopeeOffer({
          item_id: "1",
          seller_commission_rate: "20%",
        }).rate
      ).toBe(20);

      expect(
        shopeeTopOffersService.transformShopeeOffer({
          item_id: "1",
        }).rate
      ).toBe(0);
    });

    it("falls back to flat item properties when batch_item_for_item_card_full is missing", () => {
      const flatItem = {
        item_id: "flat_100",
        name: "Áo polo nam cao cấp",
        price: 199000,
        original_price: 299000,
        discount: "33%",
        commission_rate: "22%",
        image: "https://example.com/polo.jpg",
        affUrl: "https://shopee.vn/aff/flat_100",
        sold: "1.5k",
        rating: 4.9,
        shop_name: "Coolmate Official",
      };

      const offer = shopeeTopOffersService.transformShopeeOffer(flatItem);
      expect(offer.itemId).toBe("flat_100");
      expect(offer.title).toBe("Áo polo nam cao cấp");
      expect(offer.price).toBe(199000);
      expect(offer.originalPrice).toBe(299000);
      expect(offer.discount).toBe("33%");
      expect(offer.rate).toBe(22);
      expect(offer.imageUrl).toBe("https://example.com/polo.jpg");
      expect(offer.affUrl).toBe("https://shopee.vn/aff/flat_100");
      expect(offer.sold).toBe("1.5k");
      expect(offer.soldCount).toBe(1500);
      expect(offer.rating).toBe(4.9);
      expect(offer.shopName).toBe("Coolmate Official");
    });
  });
});
