const API_URL = "https://api.poohter.com/api";
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");
const DEFAULT_DELIVERY_CHARGE = 99;

const state = {
  products: [],
  cart: mergeCartItems(readJson("poohterBuyerGuestCart", [])),
  token: localStorage.getItem("poohterBuyerToken") || "",
  user: readJson("poohterBuyerUser", null),
  authMode: "login",
  pendingCheckout: false,
  resetOtpSent: false,
  otpTimers: {},
  otpResends: { signup: 0, reset: 0 },
  currentProduct: null,
  productQuantity: 1,
  checkoutItem: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[character]));
}

function money(value) {
  return `Rs ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function absoluteAssetUrl(value = "") {
  const path = String(value || "").trim();
  if (!path) return "";
  if (/^(https?:|data:)/i.test(path)) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, "")}`;
}

function mediaFileUrl(media = {}) {
  return absoluteAssetUrl(media.url || media.file_url || media.file_path || media.path || "");
}

function uniqueAssetUrls(values = []) {
  const seen = new Set();
  return values
    .map(absoluteAssetUrl)
    .filter(Boolean)
    .filter((url) => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function productImageList(product = {}) {
  const mediaImages = Array.isArray(product.media_files)
    ? product.media_files
        .filter((media) => String(media.type || "").toLowerCase() === "image")
        .map(mediaFileUrl)
    : [];

  return uniqueAssetUrls([
    product.image,
    product.image_url,
    ...(Array.isArray(product.product_images) ? product.product_images : []),
    ...mediaImages,
  ]);
}

function firstProductImage(product = {}) {
  return productImageList(product)[0] || "";
}

function firstProductVideo(product = {}) {
  const mediaVideo = Array.isArray(product.media_files)
    ? product.media_files.find((media) => String(media.type || "").toLowerCase() === "video")
    : null;
  return absoluteAssetUrl(product.video || product.video_url || product.product_video || "") || mediaFileUrl(mediaVideo);
}

function renderImageFrame(imageUrl, altText, className = "product-img", loading = "lazy") {
  const image = absoluteAssetUrl(imageUrl);
  const failedClass = image ? "" : " image-failed";
  return `
    <div class="${className}${failedClass}">
      <i class="product-fallback-icon" data-lucide="package" size="48"></i>
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(altText || "Product")}" loading="${loading}" onload="this.parentElement.classList.add('image-loaded')" onerror="this.parentElement.classList.add('image-failed'); this.remove();" />` : ""}
    </div>
  `;
}

function renderProductMedia(product = {}) {
  const image = firstProductImage(product);
  const video = firstProductVideo(product);

  return `
    <div class="product-media">
      <div class="product-img-wrap">
        ${renderImageFrame(image, product.name)}
        ${video ? '<span class="product-media-chip"><i data-lucide="play-circle" size="14"></i> Video</span>' : ""}
      </div>
    </div>
  `;
}

function stockLabel(product = {}) {
  const stock = Number(product.stock_quantity ?? product.stock ?? 0);
  if (!Number.isFinite(stock) || stock <= 0) return "Out of stock";
  if (stock <= 5) return `${stock} left`;
  return "In stock";
}

function normalizeProductResponse(data = {}) {
  if (data?.product && typeof data.product === "object") return data.product;
  if (data && !Array.isArray(data) && typeof data === "object" && data.id != null) return data;
  const products = normalizeProducts(data);
  return products[0] || null;
}

function productMaxQuantity(product = {}) {
  const stock = Number(product.stock_quantity ?? product.stock ?? 0);
  return Number.isFinite(stock) && stock > 0 ? stock : 1;
}

function productMediaItems(product = {}) {
  const images = productImageList(product);
  const video = firstProductVideo(product);
  const items = images.map((url, index) => ({
    type: "image",
    src: url,
    poster: url,
    label: `Image ${index + 1}`,
  }));
  if (video) {
    items.push({
      type: "video",
      src: video,
      poster: images[0] || "",
      label: "Video",
    });
  }
  if (!items.length) {
    items.push({ type: "image", src: "", poster: "", label: "Image" });
  }
  return items;
}

function renderProductPreview(item = {}, productName = "Product") {
  if (item.type === "video" && item.src) {
    const poster = item.poster ? ` poster="${escapeHtml(item.poster)}"` : "";
    return `
      <video class="pdp-main-video" controls autoplay playsinline preload="metadata"${poster}>
        <source src="${escapeHtml(item.src)}" type="video/mp4" />
      </video>
    `;
  }

  return renderImageFrame(item.src, productName, "pdp-main-image", "eager");
}

function ratingMarkup(product = {}) {
  const rating = Number(product.rating ?? product.average_rating ?? 0);
  const count = Number(product.review_count ?? product.reviews_count ?? 0);
  if (!rating) {
    return '<span class="pdp-new-badge">New arrival</span>';
  }
  return `
    <span class="pdp-rating-score">${rating.toFixed(1)}</span>
    <span class="pdp-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
    <span class="pdp-rating-count">${count ? `${count} ratings` : "Rated product"}</span>
  `;
}

function renderDeliveryInfo() {
  return `
    <aside class="pdp-sidebox">
      <div class="sidebox-row">
        <i data-lucide="map-pin"></i>
        <div>
          <strong>Delivery</strong>
          <span>Standard delivery across Pakistan</span>
        </div>
      </div>
      <div class="sidebox-row">
        <i data-lucide="banknote"></i>
        <div>
          <strong>Cash on Delivery</strong>
          <span>Pay when your parcel arrives</span>
        </div>
      </div>
      <div class="sidebox-row">
        <i data-lucide="rotate-ccw"></i>
        <div>
          <strong>Return Policy</strong>
          <span>7 day return window after delivery</span>
        </div>
      </div>
      <div class="sidebox-row">
        <i data-lucide="shield-check"></i>
        <div>
          <strong>Warranty</strong>
          <span>Seller warranty applies where available</span>
        </div>
      </div>
    </aside>
  `;
}

function renderProductPage(product = {}) {
  const mediaItems = productMediaItems(product);
  const activeItem = mediaItems[0];
  const stock = Number(product.stock_quantity ?? product.stock ?? 0);
  const maxQuantity = productMaxQuantity(product);
  const quantity = Math.min(Math.max(1, Number(state.productQuantity || 1)), maxQuantity);
  state.productQuantity = quantity;

  return `
    <div class="pdp">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <button data-route="/" type="button">Poohter</button>
        <span>/</span>
        <button data-route="/" type="button">Products</button>
        <span>/</span>
        <strong>${escapeHtml(product.name || "Product")}</strong>
      </nav>

      <div class="pdp-layout">
        <section class="pdp-gallery" aria-label="Product media">
          <div id="pdp-main-preview" class="pdp-main-preview">
            ${renderProductPreview(activeItem, product.name)}
          </div>
          <div class="pdp-thumbs" aria-label="Product thumbnails">
            ${mediaItems.map((item, index) => `
              <button
                class="pdp-thumb ${index === 0 ? "active" : ""}"
                data-preview-type="${escapeHtml(item.type)}"
                data-preview-src="${escapeHtml(item.src)}"
                data-preview-poster="${escapeHtml(item.poster || "")}"
                type="button"
                aria-label="${escapeHtml(item.label)}"
              >
                ${item.type === "video"
                  ? `<span class="pdp-video-thumb">${renderImageFrame(item.poster, product.name, "pdp-thumb-image")}<i data-lucide="play"></i></span>`
                  : renderImageFrame(item.src, product.name, "pdp-thumb-image")}
              </button>
            `).join("")}
          </div>
        </section>

        <section class="pdp-info">
          <h1>${escapeHtml(product.name || "Untitled Product")}</h1>
          <div class="pdp-rating">${ratingMarkup(product)}</div>
          <div class="pdp-price">${money(product.price)}</div>
          <div class="pdp-stock-row">
            <span class="stock-pill">${escapeHtml(stockLabel(product))}</span>
            <span>${Number.isFinite(stock) ? `${stock.toLocaleString()} available` : "Stock checking"}</span>
          </div>
          <p class="pdp-description">${escapeHtml(product.description || "Premium quality crafted product for your daily needs.")}</p>
          <div class="pdp-quantity-row">
            <span>Quantity</span>
            <div class="pdp-qty-control">
              <button data-product-qty-delta="-1" type="button" aria-label="Decrease quantity">-</button>
              <strong id="product-quantity">${quantity}</strong>
              <button data-product-qty-delta="1" type="button" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <div class="pdp-actions">
            <button class="btn-place-order" data-place-order="${escapeHtml(product.id)}" type="button">
              <i data-lucide="shopping-bag"></i> Place Order
            </button>
            <button class="btn-add-cart" data-add-cart="${escapeHtml(product.id)}" data-use-selected-qty="true" type="button">
              <i data-lucide="shopping-cart"></i> Add to Cart
            </button>
          </div>
        </section>

        ${renderDeliveryInfo()}
      </div>
    </div>
  `;
}

function renderCheckoutPage(item = null) {
  if (!item) {
    return `
      <div class="checkout-page">
        <nav class="breadcrumb"><button data-route="/" type="button">Poohter</button><span>/</span><strong>Checkout</strong></nav>
        <div class="empty-state">No product selected for checkout.</div>
      </div>
    `;
  }

  const subtotal = Number(item.product_price || 0) * Number(item.quantity || 1);
  const total = subtotal + DEFAULT_DELIVERY_CHARGE;
  return `
    <div class="checkout-page">
      <nav class="breadcrumb"><button data-route="/" type="button">Poohter</button><span>/</span><strong>Checkout</strong></nav>
      <div class="checkout-layout">
        <section class="checkout-summary">
          <h1>Checkout</h1>
          <div class="checkout-product">
            ${renderImageFrame(item.image, item.product_name, "checkout-product-image")}
            <div>
              <strong>${escapeHtml(item.product_name || "Product")}</strong>
              <span>${money(item.product_price)} x ${Number(item.quantity || 1)}</span>
            </div>
          </div>
          <div class="checkout-lines">
            <div><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
            <div><span>Shipping</span><strong>${money(DEFAULT_DELIVERY_CHARGE)}</strong></div>
            <div class="checkout-total"><span>Total</span><strong>${money(total)}</strong></div>
          </div>
          <button class="btn-place-order" data-confirm-place-order type="button">
            <i data-lucide="badge-check"></i> Place Order
          </button>
        </section>
        ${renderDeliveryInfo()}
      </div>
    </div>
  `;
}

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
}

function notify(message, type = "error") {
  const container = $("#alert-container");
  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  container.appendChild(alert);
  setTimeout(() => {
    alert.style.opacity = "0";
    setTimeout(() => alert.remove(), 300);
  }, 4000);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function summarizeAuthResponse(data = {}) {
  return {
    responsePresent: isObject(data),
    message: isObject(data) ? data.message || "" : "",
    requiresOtp: Boolean(data?.requiresOtp),
    userPresent: Boolean(data?.user),
    userId: data?.user?.id ?? null,
    userEmail: data?.user?.email ?? null,
    tokenPresent: typeof data?.token === "string" && data.token.length > 0,
    tokenLength: typeof data?.token === "string" ? data.token.length : 0,
  };
}

function requireObjectResponse(data, fallbackMessage) {
  if (isObject(data)) return data;
  console.error("[Buyer auth] Empty or invalid API response", { data });
  throw new Error(fallbackMessage || "Poohter returned an empty response. Please try again.");
}

function setButtonLoading(button, label) {
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> ${label}`;
  iconRefresh();
}

async function api(endpoint, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  } catch (error) {
    throw new Error("Could not connect to Poohter API.");
  }

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (response.status === 401) {
    clearSession();
    throw new Error("Please login to continue.");
  }
  if (!response.ok) {
    const message = isObject(data) ? data.error || data.message : "";
    throw new Error(message || "Request failed");
  }
  return data;
}

function normalizeProducts(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function normalizeCartItem(item = {}) {
  const productId = item.product_id ?? item.id;
  const price = Number(item.product_price ?? item.price ?? 0);
  const quantity = Math.max(1, Number(item.quantity || 1));

  return {
    product_id: productId,
    product_name: item.product_name || item.name || "Product",
    product_price: price,
    image: firstProductImage(item),
    quantity,
  };
}

function normalizeCartResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cart)) return data.cart;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (data == null) return [];

  console.warn("[Buyer cart] Unexpected cart response, using empty cart", {
    responseType: typeof data,
    keys: isObject(data) ? Object.keys(data) : [],
  });
  return [];
}

function normalizeOrdersResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data?.data)) return data.data;
  if (data == null) return [];

  console.warn("[Buyer orders] Unexpected orders response, using empty order list", {
    responseType: typeof data,
    keys: isObject(data) ? Object.keys(data) : [],
  });
  return [];
}

function mergeCartItems(...cartGroups) {
  const byProductId = new Map();

  cartGroups.flat().forEach((rawItem) => {
    const item = normalizeCartItem(rawItem);
    if (!item.product_id) return;

    const key = String(item.product_id);
    const existing = byProductId.get(key);
    if (existing) {
      byProductId.set(key, {
        ...existing,
        ...item,
        quantity: existing.quantity + item.quantity,
      });
    } else {
      byProductId.set(key, item);
    }
  });

  return Array.from(byProductId.values());
}

function saveCart() {
  state.cart = mergeCartItems(state.cart);
  writeJson("poohterBuyerGuestCart", state.cart);
  renderCart();
}

function cartSubtotal() {
  return state.cart.reduce((total, item) => (
    total + Number(item.product_price ?? item.price ?? 0) * Number(item.quantity || 0)
  ), 0);
}

function cartDeliveryCharge() {
  return state.cart.length ? DEFAULT_DELIVERY_CHARGE : 0;
}

function cartTotal() {
  return cartSubtotal() + cartDeliveryCharge();
}

function cartCount() {
  return state.cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
}

function renderAuthState() {
  const isAuthed = Boolean(state.token);
  $("#user-profile-icon").textContent = isAuthed
    ? (state.user?.name || state.user?.email || "U").charAt(0).toUpperCase()
    : "G";
  $("#auth-status-button").textContent = isAuthed ? "Logout" : "Login";
  $("#auth-status-button").dataset.openAuth = isAuthed ? "" : "true";
}

function setSession(data) {
  const authData = requireObjectResponse(
    data,
    "Account created, but Poohter did not return login details. Please login manually."
  );
  const token = typeof authData.token === "string" ? authData.token : "";
  const user = isObject(authData.user) ? authData.user : null;
  console.log("[Buyer auth] session/token creation", summarizeAuthResponse(authData));

  if (!token || !user) {
    throw new Error(authData.message || "Account created, but login details were not returned. Please login manually.");
  }
  state.token = token;
  state.user = user;
  localStorage.setItem("poohterBuyerToken", state.token);
  writeJson("poohterBuyerUser", state.user);
  renderAuthState();
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("poohterBuyerToken");
  localStorage.removeItem("poohterBuyerUser");
  renderAuthState();
}

function showAuth(mode = "login", pendingCheckout = false) {
  state.authMode = mode;
  state.pendingCheckout = pendingCheckout;
  $("#auth-panel").classList.remove("hidden");
  $("#auth-overlay").classList.add("active");
  $("#login-form").classList.toggle("hidden", mode !== "login");
  $("#signup-form").classList.toggle("hidden", mode !== "signup");
  $("#reset-form").classList.toggle("hidden", mode !== "reset");
  $("#toggle-auth-mode").textContent = mode === "login" ? "Need an account? Sign Up" : "Already have an account? Login";
  iconRefresh();
}

function closeAuth() {
  $("#auth-panel").classList.add("hidden");
  $("#auth-overlay").classList.remove("active");
}

function toggleCart(forceOpen = null) {
  const sidebar = $("#cart-sidebar");
  const overlay = $("#cart-overlay");
  const shouldOpen = forceOpen ?? !sidebar.classList.contains("active");
  sidebar.classList.toggle("active", shouldOpen);
  overlay.classList.toggle("active", shouldOpen);
  if (shouldOpen) renderCart();
}

function setActiveSection(viewId) {
  ["shop", "orders", "product", "checkout"].forEach((section) => {
    $(`#section-${section}`)?.classList.toggle("hidden", section !== viewId);
  });
  $$(".nav-link").forEach((link) => link.classList.remove("active"));
  $(`#nav-${viewId}`)?.classList.add("active");
}

function switchView(viewId, { push = true } = {}) {
  if (viewId === "orders" && !state.token) {
    notify("Please login to view your orders.", "error");
    showAuth("login");
    return;
  }

  if (push) {
    window.history.pushState({}, "", viewId === "orders" ? "/orders" : "/");
  }
  setActiveSection(viewId);
  if (viewId === "orders") loadOrders();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  route();
}

function navigateToProduct(productId) {
  if (!productId) return;
  navigateTo(`/product/${encodeURIComponent(productId)}`);
}

async function loadProductPage(productId) {
  const container = $("#product-page-content");
  setActiveSection("product");
  container.innerHTML = '<div class="loader">Loading product details...</div>';
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    const data = await api(`/products/${encodeURIComponent(productId)}`);
    const product = normalizeProductResponse(data);
    if (!product) throw new Error("Product not found");
    state.currentProduct = product;
    state.productQuantity = 1;
    container.innerHTML = renderProductPage(product);
    iconRefresh();
  } catch (error) {
    container.innerHTML = `
      <div class="product-error">
        <h1>Product unavailable</h1>
        <p>${escapeHtml(error.message || "Could not load product details.")}</p>
        <button class="btn-detail-secondary" data-route="/" type="button">Back to Shop</button>
      </div>
    `;
  }
}

function setProductPreview(type, src, poster = "") {
  const frame = $("#pdp-main-preview");
  if (!frame) return;
  frame.innerHTML = renderProductPreview({ type, src, poster }, state.currentProduct?.name || "Product");
  $$(".pdp-thumb").forEach((button) => {
    button.classList.toggle("active", button.dataset.previewType === type && button.dataset.previewSrc === src);
  });
  iconRefresh();
}

function adjustProductQuantity(delta) {
  if (!state.currentProduct) return;
  const maxQuantity = productMaxQuantity(state.currentProduct);
  state.productQuantity = Math.min(maxQuantity, Math.max(1, Number(state.productQuantity || 1) + delta));
  const quantity = $("#product-quantity");
  if (quantity) quantity.textContent = state.productQuantity;
}

function checkoutItemFromProduct(product, quantity = 1) {
  return normalizeCartItem({
    ...product,
    quantity,
    product_id: product.id,
    product_name: product.name,
    product_price: product.price,
    image: firstProductImage(product),
  });
}

async function openCheckoutForProduct(productId, quantity = state.productQuantity) {
  let product = state.currentProduct && String(state.currentProduct.id) === String(productId)
    ? state.currentProduct
    : findProduct(productId);

  if (!product) {
    const data = await api(`/products/${encodeURIComponent(productId)}`);
    product = normalizeProductResponse(data);
  }
  if (!product) return notify("Product not found.", "error");

  const safeQuantity = Math.min(productMaxQuantity(product), Math.max(1, Number(quantity || 1)));
  state.checkoutItem = checkoutItemFromProduct(product, safeQuantity);
  navigateTo(`/checkout?product=${encodeURIComponent(product.id)}&quantity=${safeQuantity}`);
}

async function loadCheckoutPage(productId = null, quantity = 1) {
  const container = $("#checkout-page-content");
  setActiveSection("checkout");
  container.innerHTML = '<div class="loader">Preparing checkout...</div>';
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    let item = state.checkoutItem;
    if (productId) {
      const data = await api(`/products/${encodeURIComponent(productId)}`);
      const product = normalizeProductResponse(data);
      if (!product) throw new Error("Product not found");
      item = checkoutItemFromProduct(product, Math.min(productMaxQuantity(product), Math.max(1, Number(quantity || 1))));
      state.checkoutItem = item;
    }
    container.innerHTML = renderCheckoutPage(item);
    iconRefresh();
  } catch (error) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Checkout is unavailable.")}</div>`;
  }
}

async function confirmPlaceOrder() {
  const item = state.checkoutItem;
  if (!item) return notify("No product selected for checkout.", "error");
  if (!state.token) {
    state.pendingCheckout = true;
    notify("Login is required before placing an order.", "error");
    showAuth("login", true);
    return;
  }

  const button = $("[data-confirm-place-order]");
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Placing Order...';
    iconRefresh();
  }

  const previousCart = state.cart.map((cartItem) => ({ ...cartItem }));
  try {
    state.cart = mergeCartItems([item]);
    saveCart();
    await syncCartToServer();
    const order = await api("/checkout", "POST");
    state.cart = [];
    state.checkoutItem = null;
    saveCart();
    notify(`Order placed successfully${order.order_code ? `: ${order.order_code}` : "!"}`, "success");
    navigateTo("/orders");
  } catch (error) {
    state.cart = previousCart;
    saveCart();
    notify(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
      iconRefresh();
    }
  }
}

function route() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/orders") {
    switchView("orders", { push: false });
    return;
  }
  if (path === "/checkout") {
    const params = new URLSearchParams(window.location.search);
    loadCheckoutPage(params.get("product"), params.get("quantity") || 1);
    return;
  }

  const productMatch = path.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    loadProductPage(decodeURIComponent(productMatch[1]));
    return;
  }

  switchView("shop", { push: false });
}

async function fetchProducts() {
  const grid = $("#product-list");
  const loader = $("#shop-loader");
  grid.innerHTML = "";
  loader.classList.remove("hidden");
  loader.innerHTML = Array(4).fill('<div class="skeleton skeleton-card"></div>').join("");

  try {
    const data = await api("/products");
    state.products = normalizeProducts(data);
    loader.classList.add("hidden");
    filterAndSortProducts();
  } catch (error) {
    loader.classList.add("hidden");
    grid.innerHTML = `<div class="empty-state">Could not load products. ${escapeHtml(error.message)}</div>`;
  }
}

function filterAndSortProducts() {
  const query = $("#search-box").value.trim().toLowerCase();
  const sort = $("#sort-box").value;
  const grid = $("#product-list");

  let products = state.products.filter((product) =>
    [product.name, product.description].filter(Boolean).join(" ").toLowerCase().includes(query)
  );

  if (sort === "low") products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  if (sort === "high") products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  if (sort === "newest") products.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  grid.innerHTML = products.length
    ? products.map((product) => `
      <article class="product-card" data-product-card="${escapeHtml(product.id)}" tabindex="0">
        ${renderProductMedia(product)}
        <div class="product-info">
          <h3 class="product-name">${escapeHtml(product.name || "Untitled Product")}</h3>
          <p class="product-desc">${escapeHtml(product.description || "Premium quality crafted product for your daily needs.")}</p>
          <span class="product-price">${money(product.price)}</span>
          <div class="product-actions">
            <button class="btn-view-details" data-view-details="${escapeHtml(product.id)}" type="button">
              <i data-lucide="eye"></i> View Details
            </button>
            <button class="btn-add-cart" data-add-cart="${escapeHtml(product.id)}" type="button">
              <i data-lucide="shopping-cart"></i> Add to Cart
            </button>
          </div>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">No products match your search.</div>';
  iconRefresh();
}

function findProduct(productId) {
  return state.products.find((product) => String(product.id) === String(productId));
}

async function addToCart(productId, quantity = 1) {
  const product = (state.currentProduct && String(state.currentProduct.id) === String(productId))
    ? state.currentProduct
    : findProduct(productId);
  if (!product) return notify("Product not found.", "error");

  const addQuantity = Math.min(productMaxQuantity(product), Math.max(1, Number(quantity || 1)));
  const previousCart = state.cart.map((item) => ({ ...item }));
  const existing = state.cart.find((item) => String(item.product_id) === String(product.id));
  if (existing) {
    existing.quantity += addQuantity;
  } else {
    state.cart.push({
      product_id: product.id,
      product_name: product.name,
      product_price: Number(product.price || 0),
      image: firstProductImage(product),
      quantity: addQuantity,
    });
  }
  saveCart();
  notify("Added to cart successfully", "success");

  if (state.token) {
    try {
      await api("/cart", "POST", {
        product_id: product.id,
        quantity: addQuantity,
      });
      await loadServerCart();
    } catch (error) {
      state.cart = previousCart;
      saveCart();
      notify(error.message, "error");
    }
  }
}

async function updateQty(productId, delta) {
  const previousCart = state.cart.map((item) => ({ ...item }));
  const item = state.cart.find((entry) => String(entry.product_id) === String(productId));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((entry) => String(entry.product_id) !== String(productId));
  }
  saveCart();

  if (state.token) {
    try {
      if (item.quantity <= 0) {
        await api(`/cart/${encodeURIComponent(productId)}`, "DELETE");
      } else {
        await api("/cart", "POST", {
          product_id: productId,
          quantity: Number(delta),
        });
      }
      await loadServerCart();
    } catch (error) {
      state.cart = previousCart;
      saveCart();
      notify(error.message, "error");
    }
  }
}

async function removeFromCart(productId) {
  const previousCart = state.cart.map((item) => ({ ...item }));
  state.cart = state.cart.filter((entry) => String(entry.product_id) !== String(productId));
  saveCart();
  notify("Item removed", "success");

  if (state.token) {
    try {
      await api(`/cart/${encodeURIComponent(productId)}`, "DELETE");
      await loadServerCart();
    } catch (error) {
      state.cart = previousCart;
      saveCart();
      notify(error.message, "error");
    }
  }
}

function renderCart() {
  const list = $("#sidebar-items");
  const subtotal = cartSubtotal();
  const delivery = cartDeliveryCharge();
  const total = cartTotal();
  $("#side-total").textContent = money(total);
  $("#side-subtotal").textContent = money(subtotal);
  $("#side-shipping").textContent = money(delivery);
  $("#cart-badge-count").textContent = cartCount();
  $("#btn-side-checkout").disabled = state.cart.length === 0;

  if (!state.cart.length) {
    list.innerHTML = '<div class="empty-state">Your bag is empty.</div>';
    iconRefresh();
    return;
  }

  list.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <div class="cart-item-img">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.product_name || "Product")}" loading="lazy" />` : '<i data-lucide="box"></i>'}
      </div>
      <div class="cart-item-details">
        <div class="cart-item-name">${escapeHtml(item.product_name || "Product")}</div>
        <div class="cart-item-price">${money(item.product_price)} per unit</div>
        <div class="cart-qty-ctrl">
          <button class="qty-btn" data-cart-delta="-1" data-product-id="${escapeHtml(item.product_id)}" type="button">-</button>
          <span style="font-weight:700">${Number(item.quantity || 0)}</span>
          <button class="qty-btn" data-cart-delta="1" data-product-id="${escapeHtml(item.product_id)}" type="button">+</button>
        </div>
      </div>
      <button class="icon-button" data-remove-cart="${escapeHtml(item.product_id)}" type="button" aria-label="Remove item">
        <i data-lucide="trash-2" size="18"></i>
      </button>
    </div>
  `).join("");
  iconRefresh();
}

async function syncCartToServer() {
  state.cart = mergeCartItems(state.cart);
  await api("/cart", "DELETE");
  for (const item of state.cart) {
    await api("/cart", "POST", {
      product_id: item.product_id,
      quantity: Number(item.quantity || 0),
    });
  }
}

async function loadServerCart({ mergeLocal = false } = {}) {
  if (!state.token) return;

  const remoteCart = normalizeCartResponse(await api("/cart")).map(normalizeCartItem);
  if (mergeLocal && state.cart.length) {
    state.cart = mergeCartItems(remoteCart, state.cart);
    saveCart();
    await syncCartToServer();
    state.cart = normalizeCartResponse(await api("/cart")).map(normalizeCartItem);
  } else {
    state.cart = remoteCart;
  }
  saveCart();
}

async function handleCheckout() {
  if (!state.cart.length) {
    notify("Your bag is empty.", "error");
    return;
  }

  if (!state.token) {
    notify("Login is required only when placing an order.", "error");
    showAuth("login", true);
    return;
  }

  const button = $("#btn-side-checkout");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Securing Order...';
  iconRefresh();

  try {
    await syncCartToServer();
    const order = await api("/checkout", "POST");
    state.cart = [];
    saveCart();
    notify(`Order placed successfully${order.order_code ? `: ${order.order_code}` : "!"}`, "success");
    toggleCart(false);
    switchView("orders");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    iconRefresh();
  }
}

async function loadOrders() {
  const container = $("#orders-list");
  container.innerHTML = "<div class='loader'>Synchronizing your history...</div>";

  try {
    const orders = normalizeOrdersResponse(await api("/orders"));
    if (!orders.length) {
      container.innerHTML = "<div class='empty-state'>You have not placed any orders yet.</div>";
      return;
    }

    container.innerHTML = orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return `
        <article class="order-card">
          <div class="order-meta">
            <div>
              <span class="order-tag">${escapeHtml(order.order_code || `ID: #${order.id}`)}</span>
              <div style="margin-top: 5px; font-size: 0.8rem; color: var(--text-muted)">
                ${order.created_at ? new Date(order.created_at).toLocaleDateString() : ""}
              </div>
            </div>
            <span class="status-badge ${order.status === "delivered" ? "status-delivered" : "status-pending"}">
              ${escapeHtml(order.status || "Pending")}
            </span>
          </div>
      <div class="order-item-list">
        ${items.map((item) => `
          <div class="order-item-mini">
            <span>${escapeHtml(item.product_name || item.name || "Product")} x${Number(item.quantity || 0)}</span>
            <span style="font-weight: 700">${money(Number(item.product_price || item.price || 0) * Number(item.quantity || 0))}</span>
          </div>
        `).join("")}
        ${Number(order.delivery_charge || 0) ? `
          <div class="order-item-mini">
            <span>Delivery</span>
            <span style="font-weight: 700">${money(order.delivery_charge)}</span>
          </div>
        ` : ""}
      </div>
          <div style="text-align: right; margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1rem; font-weight: 800; font-size: 1.2rem;">
            Total Paid: ${money(order.total_price || order.totalAmount)}
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    container.innerHTML = `<div class='loader'>${escapeHtml(error.message)}</div>`;
  }
}

function togglePassword(inputId, button) {
  const input = $(`#${inputId}`);
  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.innerHTML = `<i data-lucide="${shouldShow ? "eye-off" : "eye"}"></i>`;
  iconRefresh();
}

function updateStrength(value) {
  const meter = $("#signup-strength");
  const bar = meter.querySelector(".strength-meter-bar");
  if (!value) {
    meter.style.display = "none";
    return;
  }
  meter.style.display = "block";

  let strength = 0;
  if (value.length >= 6) strength += 1;
  if (/[0-9]/.test(value)) strength += 1;
  if (/[!@#$%^&*(),.?":{}|<>/]/.test(value)) strength += 1;
  bar.className = `strength-meter-bar ${strength === 1 ? "strength-weak" : strength === 2 ? "strength-medium" : "strength-strong"}`;
}

function setSignupOtpMode(enabled) {
  const wasEnabled = !$("#signup-otp-group").classList.contains("hidden");
  $("#signup-otp-group").classList.toggle("hidden", !enabled);
  $("#signup-otp").required = enabled;
  if (enabled && !wasEnabled) startOtpCooldown("signup");
  $("#btn-signup").innerHTML = enabled
    ? 'Verify Email & Create Account <i data-lucide="shield-check" size="18"></i>'
    : 'Create Account <i data-lucide="arrow-right" size="18"></i>';
  iconRefresh();
}

function setResetOtpMode(enabled) {
  const wasEnabled = state.resetOtpSent;
  state.resetOtpSent = enabled;
  $("#reset-otp-fields").classList.toggle("hidden", !enabled);
  ["reset-otp", "reset-password", "reset-confirm-password"].forEach((id) => {
    $(`#${id}`).required = enabled;
  });
  if (enabled && !wasEnabled) startOtpCooldown("reset");
  $("#btn-reset").innerHTML = enabled
    ? 'Change Password <i data-lucide="shield-check"></i>'
    : 'Send Reset Code <i data-lucide="mail"></i>';
  iconRefresh();
}

function startOtpCooldown(kind, seconds = 60) {
  const button = $(`#${kind}-resend-otp`);
  if (!button) return;
  window.clearInterval(state.otpTimers[kind]);
  let remaining = seconds;
  button.disabled = true;
  button.textContent = `Resend OTP in ${remaining}s`;
  state.otpTimers[kind] = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(state.otpTimers[kind]);
      const used = state.otpResends[kind] || 0;
      button.disabled = used >= 5;
      button.textContent = used >= 5 ? "Resend limit reached" : `Resend OTP (${used}/5)`;
      return;
    }
    button.textContent = `Resend OTP in ${remaining}s`;
  }, 1000);
}

async function resendOtp(kind) {
  const email = kind === "signup" ? $("#signup-email").value : $("#reset-email").value;
  if (!email) return notify("Enter your email before resending OTP.", "error");
  if ((state.otpResends[kind] || 0) >= 5) return notify("OTP resend limit reached.", "error");
  const button = $(`#${kind}-resend-otp`);
  button.disabled = true;
  button.textContent = "Resending...";
  try {
    await api("/auth/otp/resend", "POST", {
      email,
      accountType: "buyer",
      purpose: kind === "signup" ? "signup" : "password_reset",
    });
    state.otpResends[kind] = (state.otpResends[kind] || 0) + 1;
    notify("A new OTP has been sent to your email.", "success");
    startOtpCooldown(kind);
  } catch (error) {
    notify(error.message, "error");
    startOtpCooldown(kind, 5);
  }
}

$("#search-box").addEventListener("input", filterAndSortProducts);
$("#sort-box").addEventListener("change", filterAndSortProducts);
$("#signup-password").addEventListener("input", (event) => updateStrength(event.target.value));

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#btn-login");
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Verifying...";

  try {
    const data = await api("/auth/login", "POST", {
      email: $("#login-email").value,
      password: $("#login-password").value,
    });
    setSession(data);
    try {
      await loadServerCart({ mergeLocal: true });
    } catch (cartError) {
      console.warn("[Buyer login] Cart sync failed after login", cartError);
    }
    closeAuth();
    notify("Welcome back!", "success");
    if (state.pendingCheckout) {
      state.pendingCheckout = false;
      if (state.checkoutItem) confirmPlaceOrder();
      else handleCheckout();
    }
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    iconRefresh();
  }
});

$("#forgot-password-link").addEventListener("click", () => {
  $("#reset-email").value = $("#login-email").value;
  setResetOtpMode(false);
  showAuth("reset", state.pendingCheckout);
});

$("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#signup-password").value;
  const confirmPassword = $("#signup-confirm-password").value;
  const isOtpStep = !$("#signup-otp-group").classList.contains("hidden");

  if (password !== confirmPassword) {
    $("#confirm-password-hint").style.display = "block";
    return;
  }
  $("#confirm-password-hint").style.display = "none";

  if (!/^(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>/]).*$/.test(password)) {
    notify("Password must contain at least one number and one special character.", "error");
    return;
  }

  const button = $("#btn-signup");
  setButtonLoading(button, isOtpStep ? "Verifying..." : "Sending OTP...");

  try {
    const email = $("#signup-email").value.trim();
    const otp = $("#signup-otp").value.trim();

    console.log("[Buyer signup] OTP submit", {
      isOtpStep,
      email,
      otpLength: otp.length,
      passwordPresent: Boolean(password),
      confirmPasswordPresent: Boolean(confirmPassword),
    });

    if (isOtpStep && !otp) {
      notify("Enter the OTP from your email to verify your account.", "error");
      return;
    }

    let data;
    if (isOtpStep) {
      data = requireObjectResponse(
        await api("/auth/signup/verify", "POST", {
        email,
          otp,
        }),
        "Email verification returned an empty response. Please try again."
      );
      console.log("[Buyer signup] verify API response", summarizeAuthResponse(data));
    } else {
      data = requireObjectResponse(
        await api("/auth/signup", "POST", {
        name: $("#signup-name").value,
        email,
        phone: $("#signup-phone").value,
        address: $("#signup-address").value,
        password,
        confirmPassword,
        role: "buyer",
        }),
        "Signup returned an empty response. Please try again."
      );
      console.log("[Buyer signup] create account response", summarizeAuthResponse(data));
    }

    if (data.requiresOtp) {
      setSignupOtpMode(true);
      state.otpResends.signup = 0;
      notify(data.message || "OTP sent to your email.", "success");
      return;
    }

    if (!data.user || !data.token) {
      console.error("[Buyer signup] Missing session data after verification", summarizeAuthResponse(data));
      throw new Error(data.message || "Email verified, but login session was not returned. Please login manually.");
    }

    setSession(data);
    try {
      await loadServerCart({ mergeLocal: true });
    } catch (cartError) {
      console.warn("[Buyer signup] Cart sync failed after registration", cartError);
    }
    event.currentTarget.reset();
    setSignupOtpMode(false);
    closeAuth();
    notify("Registration successful!", "success");
    if (state.pendingCheckout) {
      state.pendingCheckout = false;
      if (state.checkoutItem) confirmPlaceOrder();
      else handleCheckout();
    }
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
    if ($("#signup-otp-group").classList.contains("hidden")) {
      setSignupOtpMode(false);
    } else {
      setSignupOtpMode(true);
    }
    iconRefresh();
  }
});

$("#reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#btn-reset");
  button.disabled = true;
  button.textContent = state.resetOtpSent ? "Changing..." : "Sending...";

  try {
    const email = $("#reset-email").value;
    if (!state.resetOtpSent) {
      const data = await api("/auth/password/forgot", "POST", { email, accountType: "buyer" });
      setResetOtpMode(true);
      state.otpResends.reset = 0;
      notify(data.message || "Reset OTP sent to your email.", "success");
      return;
    }

    const password = $("#reset-password").value;
    const confirmPassword = $("#reset-confirm-password").value;
    if (password !== confirmPassword) {
      notify("Passwords do not match.", "error");
      return;
    }
    await api("/auth/password/reset", "POST", {
      email,
      accountType: "buyer",
      otp: $("#reset-otp").value,
      password,
      confirmPassword,
    });
    event.currentTarget.reset();
    setResetOtpMode(false);
    showAuth("login", state.pendingCheckout);
    notify("Password changed. Please login with your new password.", "success");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
    setResetOtpMode(state.resetOtpSent);
    iconRefresh();
  }
});

$("#toggle-auth-mode").addEventListener("click", (event) => {
  event.preventDefault();
  showAuth(state.authMode === "login" ? "signup" : "login", state.pendingCheckout);
});

$("#signup-resend-otp").addEventListener("click", () => resendOtp("signup"));
$("#reset-resend-otp").addEventListener("click", () => resendOtp("reset"));

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) {
    if (button.dataset.route) return navigateTo(button.dataset.route);
    if (button.dataset.switchView) return switchView(button.dataset.switchView);
    if (button.dataset.openCart !== undefined) return toggleCart(true);
    if (button.dataset.closeCart !== undefined) return toggleCart(false);
    if (button.dataset.viewDetails) return navigateToProduct(button.dataset.viewDetails);
    if (button.dataset.previewType) return setProductPreview(button.dataset.previewType, button.dataset.previewSrc || "", button.dataset.previewPoster || "");
    if (button.dataset.productQtyDelta) return adjustProductQuantity(Number(button.dataset.productQtyDelta));
    if (button.dataset.placeOrder) return openCheckoutForProduct(button.dataset.placeOrder, state.productQuantity);
    if (button.dataset.confirmPlaceOrder !== undefined) return confirmPlaceOrder();
    if (button.dataset.openAuth !== undefined) {
      if (!state.token) {
        showAuth("login");
      } else if (button.id === "auth-status-button") {
        clearSession();
        notify("Logged out.", "success");
        navigateTo("/");
      } else {
        notify(`Logged in as ${state.user?.name || state.user?.email || "buyer"}.`, "success");
      }
      return;
    }
    if (button.dataset.closeAuth !== undefined) return closeAuth();
    if (button.dataset.scrollProducts !== undefined) return $("#product-list").scrollIntoView({ behavior: "smooth" });
    if (button.dataset.addCart) {
      const quantity = button.dataset.useSelectedQty ? state.productQuantity : 1;
      return addToCart(button.dataset.addCart, quantity);
    }
    if (button.dataset.cartDelta) return updateQty(button.dataset.productId, Number(button.dataset.cartDelta));
    if (button.dataset.removeCart) return removeFromCart(button.dataset.removeCart);
    if (button.dataset.togglePassword) return togglePassword(button.dataset.togglePassword, button);
  }

  const card = event.target.closest("[data-product-card]");
  if (card) navigateToProduct(card.dataset.productCard);
});

$("#cart-overlay").addEventListener("click", () => toggleCart(false));
$("#auth-overlay").addEventListener("click", closeAuth);
$("#btn-side-checkout").addEventListener("click", handleCheckout);
window.addEventListener("popstate", route);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest?.("[data-product-card]");
  if (!card) return;
  event.preventDefault();
  navigateToProduct(card.dataset.productCard);
});

window.addEventListener("load", () => {
  renderAuthState();
  renderCart();
  route();
  fetchProducts();
  if (state.token) {
    loadServerCart().catch((error) => notify(error.message, "error"));
  }
  iconRefresh();
});
