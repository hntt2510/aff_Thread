/**
 * Centralized Resilient Selectors Dictionary for Shopee Affiliate Portal.
 * Ordered by semantic preference:
 * 1. Accessible roles / aria-labels
 * 2. Stable visible Vietnamese / English text
 * 3. Stable attribute selectors
 * 4. CSS structural classes only as last resort
 *
 * NOTE: Never hardcode sensitive tokens or brittle nth-child paths.
 */

export const SHOPEE_SELECTORS = {
  // Navigation & Session Verification
  session: {
    // Authenticated indicators on affiliate.shopee.vn
    userAvatar: [
      '[data-testid="user-avatar"]',
      '.user-profile-avatar',
      '.shopee-affiliate-avatar',
      'img[alt="avatar"]',
      '.navbar-user-avatar',
    ],
    userName: [
      '[data-testid="username"]',
      '.account-name',
      '.user-name',
      '.affiliate-user-name',
    ],
    // Login form indicators
    loginContainer: [
      'form[action*="login"]',
      'input[name="loginKey"]',
      'input[type="password"]',
      '.login-card',
      'button:has-text("Đăng nhập")',
      'button:has-text("Log In")',
    ],
    // CAPTCHA / Security Challenge / OTP indicators
    challengeContainer: [
      '.shopee-captcha',
      '.security-verification',
      '.captcha-dialog',
      'iframe[src*="captcha"]',
      'text="Xác minh bảo mật"',
      'text="Security Verification"',
      'text="Trượt để hoàn thành ghép hình"',
      'text="Xác minh OTP"',
      'text="Enter verification code"',
      'input[autocomplete="one-time-code"]',
    ],
  },

  // Product Offer Catalog Page
  catalog: {
    // Product list card container
    productCard: [
      '[data-testid="product-card"]',
      '.offer-product-item',
      '.product-card-container',
      '.shopee-product-item',
      '.offer-item',
    ],
    // Card Title
    productTitle: [
      '[data-testid="product-title"]',
      '.product-name',
      '.product-title',
      '.offer-title',
      'h3',
      'h4',
    ],
    // Card Link
    productLink: [
      'a[href*="shopee.vn"]',
      'a[href*="/product/"]',
      'a[data-testid="product-link"]',
      'a.product-link',
    ],
    // Commission percentage / amount
    commissionRate: [
      '[data-testid="commission-rate"]',
      '.commission-rate',
      '.commission-percent',
      'text=/\\d+([.,]\\d+)?%/',
    ],
    commissionAmount: [
      '[data-testid="commission-amount"]',
      '.commission-value',
      '.commission-amount',
    ],
    // Sold count
    soldCount: [
      '[data-testid="sold-count"]',
      '.sold-count',
      '.sales-count',
      'text=/Đã bán\\s+\\d+/i',
      'text=/Sold\\s+\\d+/i',
    ],
    // Image
    productImage: [
      'img.product-image',
      'img[data-testid="product-img"]',
      'img[src*="shopee"]',
      'img',
    ],
    // Category label or tag
    categoryTag: [
      '[data-testid="category-name"]',
      '.category-tag',
      '.product-category',
      '.category-breadcrumb',
    ],
  },

  // Direct Affiliate Link Acquisition
  linkModal: {
    // "Get Link" / "Lấy link" trigger button on card
    getLinkButton: [
      'button:has-text("Lấy link")',
      'button:has-text("Get Link")',
      'button:has-text("Chia sẻ")',
      'button:has-text("Share")',
      '[data-testid="get-link-btn"]',
      '.get-link-btn',
    ],
    // Resulting input box containing the short affiliate URL
    linkInput: [
      'input[value*="s.shopee.vn"]',
      'input[value*="shopee.vn"]',
      '[data-testid="affiliate-link-input"]',
      '.share-link-input',
      '.affiliate-url-input',
    ],
    // Copy button
    copyButton: [
      'button:has-text("Sao chép")',
      'button:has-text("Copy")',
      '[data-testid="copy-link-btn"]',
    ],
    // Close modal
    closeButton: [
      'button[aria-label="Close"]',
      'button.close',
      '.modal-close',
      '[data-testid="modal-close-btn"]',
    ],
  },
};
