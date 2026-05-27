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
  const poster = image ? ` poster="${escapeHtml(image)}"` : "";

  return `
    <div class="product-media">
      <div class="product-img-wrap">
        ${renderImageFrame(image, product.name)}
        ${video ? '<span class="product-media-chip"><i data-lucide="play-circle" size="14"></i> Video</span>' : ""}
      </div>
      ${video ? `
        <video class="product-video" controls preload="metadata" playsinline${poster}>
          <source src="${escapeHtml(video)}" type="video/mp4" />
        </video>
      ` : ""}
    </div>
  `;
}

function stockLabel(product = {}) {
  const stock = Number(product.stock_quantity ?? product.stock ?? 0);
  if (!Number.isFinite(stock) || stock <= 0) return "Out of stock";
  if (stock <= 5) return `${stock} left`;
  return "In stock";
}

function renderProductDetails(product = {}) {
  const images = productImageList(product);
  const image = images[0] || "";
  const video = firstProductVideo(product);
  const poster = image ? ` poster="${escapeHtml(image)}"` : "";

  return `
    <div class="detail-grid">
      <div class="detail-media">
        <div id="detail-main-image">
          ${renderImageFrame(image, product.name, "detail-main-image", "eager")}
        </div>
        ${images.length > 1 ? `
          <div class="detail-thumbs" aria-label="Product images">
            ${images.map((thumb, index) => `
              <button class="detail-thumb ${index === 0 ? "active" : ""}" data-detail-thumb="${escapeHtml(thumb)}" type="button" aria-label="Show image ${index + 1}">
                ${renderImageFrame(thumb, product.name, "detail-thumb-image")}
              </button>
            `).join("")}
          </div>
        ` : ""}
        ${video ? `
          <video class="detail-video" controls preload="metadata" playsinline${poster}>
            <source src="${escapeHtml(video)}" type="video/mp4" />
          </video>
        ` : ""}
      </div>
      <div class="detail-copy">
        <div class="detail-price-row">
          <span class="product-price">${money(product.price)}</span>
          <span class="stock-pill">${escapeHtml(stockLabel(product))}</span>
        </div>
        <p class="detail-description">${escapeHtml(product.description || "Premium quality crafted product for your daily needs.")}</p>
        <div class="detail-facts">
          <div><span>ID</span><strong>${escapeHtml(product.product_uid || product.id || "N/A")}</strong></div>
          <div><span>Available</span><strong>${Number(product.stock_quantity ?? product.stock ?? 0).toLocaleString()}</strong></div>
        </div>
        <div class="detail-actions">
          <button class="btn-add-cart" data-add-cart="${escapeHtml(product.id)}" type="button">
            <i data-lucide="shopping-cart"></i> Add to Cart
          </button>
          <button class="btn-detail-secondary" data-close-product-detail type="button">Continue Shopping</button>
        </div>
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
  if (!response.ok) throw new Error(data.error || data.message || "Request failed");
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
  if (!data?.token || !data?.user) {
    throw new Error(data?.message || "Account created, but login details were not returned. Please login manually.");
  }
  state.token = data.token || "";
  state.user = data.user || null;
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

function switchView(viewId) {
  if (viewId === "orders" && !state.token) {
    notify("Please login to view your orders.", "error");
    showAuth("login");
    return;
  }

  $("#section-shop").classList.toggle("hidden", viewId !== "shop");
  $("#section-orders").classList.toggle("hidden", viewId !== "orders");
  $$(".nav-link").forEach((link) => link.classList.remove("active"));
  $(`#nav-${viewId}`)?.classList.add("active");
  if (viewId === "orders") loadOrders();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openProductDetails(productId) {
  const product = findProduct(productId);
  if (!product) return notify("Product not found.", "error");

  $("#detail-title").textContent = product.name || "Product Details";
  $("#product-detail-content").innerHTML = renderProductDetails(product);
  $("#product-detail-panel").classList.remove("hidden");
  $("#product-detail-overlay").classList.add("active");
  document.body.classList.add("modal-open");
  iconRefresh();
}

function closeProductDetails() {
  $("#product-detail-panel").classList.add("hidden");
  $("#product-detail-overlay").classList.remove("active");
  $("#product-detail-content").innerHTML = "";
  document.body.classList.remove("modal-open");
}

function setDetailImage(imageUrl) {
  const frame = $("#detail-main-image");
  if (!frame) return;
  frame.innerHTML = renderImageFrame(imageUrl, $("#detail-title")?.textContent || "Product", "detail-main-image", "eager");
  $$(".detail-thumb").forEach((button) => {
    button.classList.toggle("active", button.dataset.detailThumb === imageUrl);
  });
  iconRefresh();
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
      <article class="product-card">
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

async function addToCart(productId) {
  const product = findProduct(productId);
  if (!product) return notify("Product not found.", "error");

  const previousCart = state.cart.map((item) => ({ ...item }));
  const existing = state.cart.find((item) => String(item.product_id) === String(product.id));
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      product_id: product.id,
      product_name: product.name,
      product_price: Number(product.price || 0),
      image: firstProductImage(product),
      quantity: 1,
    });
  }
  saveCart();
  notify("Added to cart successfully", "success");

  if (state.token) {
    try {
      await api("/cart", "POST", {
        product_id: product.id,
        quantity: 1,
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

  const remoteCart = (await api("/cart")).map(normalizeCartItem);
  if (mergeLocal && state.cart.length) {
    state.cart = mergeCartItems(remoteCart, state.cart);
    saveCart();
    await syncCartToServer();
    state.cart = (await api("/cart")).map(normalizeCartItem);
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
    const orders = await api("/orders");
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
      notify(`Logged in, but cart sync failed: ${cartError.message}`, "error");
    }
    closeAuth();
    notify("Welcome back!", "success");
    if (state.pendingCheckout) {
      state.pendingCheckout = false;
      handleCheckout();
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
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = isOtpStep ? "Verifying..." : "Sending OTP...";

  try {
    const email = $("#signup-email").value;
    const data = isOtpStep
      ? await api("/auth/signup/verify", "POST", {
        email,
        otp: $("#signup-otp").value,
      })
      : await api("/auth/signup", "POST", {
        name: $("#signup-name").value,
        email,
        phone: $("#signup-phone").value,
        address: $("#signup-address").value,
        password,
        confirmPassword,
        role: "buyer",
      });
    if (data.requiresOtp) {
      setSignupOtpMode(true);
      state.otpResends.signup = 0;
      notify(data.message || "OTP sent to your email.", "success");
      return;
    }
    setSession(data);
    try {
      await loadServerCart({ mergeLocal: true });
    } catch (cartError) {
      notify(`Registered, but cart sync failed: ${cartError.message}`, "error");
    }
    event.currentTarget.reset();
    setSignupOtpMode(false);
    closeAuth();
    notify("Registration successful!", "success");
    if (state.pendingCheckout) {
      state.pendingCheckout = false;
      handleCheckout();
    }
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
    if ($("#signup-otp-group").classList.contains("hidden")) {
      button.innerHTML = original;
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
  if (!button) return;

  if (button.dataset.switchView) switchView(button.dataset.switchView);
  if (button.dataset.openCart !== undefined) toggleCart(true);
  if (button.dataset.closeCart !== undefined) toggleCart(false);
  if (button.dataset.viewDetails) openProductDetails(button.dataset.viewDetails);
  if (button.dataset.closeProductDetail !== undefined) closeProductDetails();
  if (button.dataset.detailThumb) setDetailImage(button.dataset.detailThumb);
  if (button.dataset.openAuth !== undefined) {
    if (!state.token) {
      showAuth("login");
    } else if (button.id === "auth-status-button") {
      clearSession();
      notify("Logged out.", "success");
      switchView("shop");
    } else {
      notify(`Logged in as ${state.user?.name || state.user?.email || "buyer"}.`, "success");
    }
  }
  if (button.dataset.closeAuth !== undefined) closeAuth();
  if (button.dataset.scrollProducts !== undefined) $("#product-list").scrollIntoView({ behavior: "smooth" });
  if (button.dataset.addCart) addToCart(button.dataset.addCart);
  if (button.dataset.cartDelta) updateQty(button.dataset.productId, Number(button.dataset.cartDelta));
  if (button.dataset.removeCart) removeFromCart(button.dataset.removeCart);
  if (button.dataset.togglePassword) togglePassword(button.dataset.togglePassword, button);
});

$("#cart-overlay").addEventListener("click", () => toggleCart(false));
$("#auth-overlay").addEventListener("click", closeAuth);
$("#product-detail-overlay").addEventListener("click", closeProductDetails);
$("#btn-side-checkout").addEventListener("click", handleCheckout);

window.addEventListener("load", () => {
  renderAuthState();
  renderCart();
  fetchProducts();
  if (state.token) {
    loadServerCart().catch((error) => notify(error.message, "error"));
  }
  iconRefresh();
});
