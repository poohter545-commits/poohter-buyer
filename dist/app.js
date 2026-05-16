const API_URL = "https://api.poohter.com/api";

const state = {
  products: [],
  cart: readJson("poohterBuyerGuestCart", []),
  token: localStorage.getItem("poohterBuyerToken") || "",
  user: readJson("poohterBuyerUser", null),
  authMode: "login",
  pendingCheckout: false,
  resetOtpSent: false,
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
  return `$${Number(value || 0).toFixed(2)}`;
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

function saveCart() {
  writeJson("poohterBuyerGuestCart", state.cart);
  renderCart();
}

function cartTotal() {
  return state.cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
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
        <div class="product-img"><i data-lucide="package" size="48"></i></div>
        <div class="product-info">
          <h3 class="product-name">${escapeHtml(product.name || "Untitled Product")}</h3>
          <p class="product-desc">${escapeHtml(product.description || "Premium quality crafted product for your daily needs.")}</p>
          <span class="product-price">${money(product.price)}</span>
          <button class="btn-add-cart" data-add-cart="${escapeHtml(product.id)}" type="button">
            <i data-lucide="shopping-cart"></i> Add to Cart
          </button>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">No products match your search.</div>';
  iconRefresh();
}

function findProduct(productId) {
  return state.products.find((product) => String(product.id) === String(productId));
}

function addToCart(productId) {
  const product = findProduct(productId);
  if (!product) return notify("Product not found.", "error");

  const existing = state.cart.find((item) => String(item.product_id) === String(product.id));
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      product_id: product.id,
      product_name: product.name,
      product_price: Number(product.price || 0),
      quantity: 1,
    });
  }
  saveCart();
  notify("Added to cart successfully", "success");
}

function updateQty(productId, delta) {
  const item = state.cart.find((entry) => String(entry.product_id) === String(productId));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((entry) => String(entry.product_id) !== String(productId));
  }
  saveCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((entry) => String(entry.product_id) !== String(productId));
  saveCart();
  notify("Item removed", "success");
}

function renderCart() {
  const list = $("#sidebar-items");
  const total = cartTotal();
  $("#side-total").textContent = money(total);
  $("#side-subtotal").textContent = money(total);
  $("#cart-badge-count").textContent = cartCount();
  $("#btn-side-checkout").disabled = state.cart.length === 0;

  if (!state.cart.length) {
    list.innerHTML = '<div class="empty-state">Your bag is empty.</div>';
    iconRefresh();
    return;
  }

  list.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <div class="cart-item-img"><i data-lucide="box"></i></div>
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
  await api("/cart", "DELETE");
  for (const item of state.cart) {
    await api("/cart", "POST", {
      product_id: item.product_id,
      quantity: Number(item.quantity || 0),
    });
  }
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
  $("#signup-otp-group").classList.toggle("hidden", !enabled);
  $("#signup-otp").required = enabled;
  $("#btn-signup").innerHTML = enabled
    ? 'Verify Email & Create Account <i data-lucide="shield-check" size="18"></i>'
    : 'Create Account <i data-lucide="arrow-right" size="18"></i>';
  iconRefresh();
}

function setResetOtpMode(enabled) {
  state.resetOtpSent = enabled;
  $("#reset-otp-fields").classList.toggle("hidden", !enabled);
  ["reset-otp", "reset-password", "reset-confirm-password"].forEach((id) => {
    $(`#${id}`).required = enabled;
  });
  $("#btn-reset").innerHTML = enabled
    ? 'Change Password <i data-lucide="shield-check"></i>'
    : 'Send Reset Code <i data-lucide="mail"></i>';
  iconRefresh();
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
    if ($("#signup-otp-group").classList.contains("hidden")) {
      button.innerHTML = original;
    } else {
      setSignupOtpMode(true);
    }
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
      notify(data.message || "OTP sent to your email.", "success");
      return;
    }
    setSession(data);
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
    button.innerHTML = original;
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

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.switchView) switchView(button.dataset.switchView);
  if (button.dataset.openCart !== undefined) toggleCart(true);
  if (button.dataset.closeCart !== undefined) toggleCart(false);
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
$("#btn-side-checkout").addEventListener("click", handleCheckout);

window.addEventListener("load", () => {
  renderAuthState();
  renderCart();
  fetchProducts();
  iconRefresh();
});
