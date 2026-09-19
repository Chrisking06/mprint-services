const loginShell = document.querySelector("#loginShell");
const adminApp = document.querySelector("#adminApp");
const peso = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value || 0);
let dashboard = { orders: [], services: [], summary: {} };

function escapeHtml(value = "") {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function toast(text) {
  const element = document.querySelector("#toast");
  element.textContent = text;
  element.classList.remove("hidden");
  window.setTimeout(() => element.classList.add("hidden"), 2200);
}

async function api(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("json") ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data?.error || "Request failed.");
  }
  return data;
}

function showLogin() {
  loginShell.classList.remove("hidden");
  adminApp.classList.add("hidden");
}

async function showAdmin() {
  loginShell.classList.add("hidden");
  adminApp.classList.remove("hidden");
  await loadDashboard();
}

async function loadDashboard() {
  dashboard = await api("/api/admin/dashboard");
  document.querySelector("#totalOrders").textContent = dashboard.summary.totalOrders;
  document.querySelector("#totalItems").textContent = dashboard.summary.totalItems;
  document.querySelector("#newOrders").textContent = dashboard.summary.newOrders || 0;
  document.querySelector("#revenue").textContent = peso(dashboard.summary.revenue);
  renderOrders();
  renderServices();
}

function renderOrders() {
  const query = document.querySelector("#orderSearch").value.toLowerCase();
  const orders = dashboard.orders.filter(order => Object.values(order).join(" ").toLowerCase().includes(query));
  document.querySelector("#ordersBody").innerHTML = orders.length ? orders.map(order => `
    <tr>
      <td><strong>${escapeHtml(order.reference)}</strong></td>
      <td>${new Date(order.created_at.replace(" ", "T")).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td>
      <td>${escapeHtml(order.customer_name || "Walk-in")}<br><small>${escapeHtml(order.contact || "")}</small></td>
      <td class="service-cell">${escapeHtml(order.service_name)}</td>
      <td>${order.quantity}</td>
      <td>${peso(order.total)}</td>
      <td>
        <select class="status-select" data-order="${order.id}">
          ${["New", "Processing", "Ready", "Completed", "Cancelled"].map(status =>
            `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
      <td>
        ${order.file_name ? `<a class="table-action" href="/api/admin/orders/${order.id}/image">Image</a>` : "—"}
        ${order.file_name && dashboard.services.find(service => service.id === order.service_id)?.hasLayout
          ? `<a class="table-action" href="/api/admin/orders/${order.id}/layout.pdf" target="_blank">Print PDF</a>` : ""}
      </td>
    </tr>
  `).join("") : '<tr><td class="empty-cell" colspan="8">No orders found.</td></tr>';

  document.querySelectorAll(".status-select").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await api(`/api/admin/orders/${select.dataset.order}`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        const order = dashboard.orders.find(item => item.id == select.dataset.order);
        if (order) order.status = select.value;
        toast("Order status updated.");
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderServices() {
  const query = document.querySelector("#serviceSearch").value.toLowerCase();
  const services = dashboard.services.filter(service => `${service.category} ${service.name}`.toLowerCase().includes(query));
  document.querySelector("#servicesBody").innerHTML = services.map(service => `
    <tr>
      <td>${escapeHtml(service.category)}</td>
      <td class="service-cell">${escapeHtml(service.name)}</td>
      <td>${service.hasLayout ? "Yes" : "—"}</td>
      <td><input class="price-input" data-price="${service.id}" type="number" min="0" step="0.01" value="${service.price}"></td>
      <td><button class="save-price" data-save="${service.id}">Save</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-save]").forEach(button => {
    button.addEventListener("click", async () => {
      const input = document.querySelector(`[data-price="${button.dataset.save}"]`);
      try {
        await api(`/api/admin/services/${button.dataset.save}`, {
          method: "PATCH",
          body: JSON.stringify({ price: Number(input.value) })
        });
        const service = dashboard.services.find(item => item.id === button.dataset.save);
        if (service) service.price = Number(input.value);
        toast("Price saved.");
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

document.querySelector("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const message = document.querySelector("#loginMessage");
  message.textContent = "";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
    });
    await showAdmin();
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  showLogin();
});
document.querySelector("#orderSearch").addEventListener("input", renderOrders);
document.querySelector("#serviceSearch").addEventListener("input", renderServices);
document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("active", item === button));
    const orders = button.dataset.tab === "orders";
    document.querySelector("#ordersPanel").classList.toggle("hidden", !orders);
    document.querySelector("#pricesPanel").classList.toggle("hidden", orders);
    document.querySelector("#pageTitle").textContent = orders ? "Orders" : "Services & prices";
  });
});

document.querySelector("#today").textContent = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "full"
}).format(new Date());

api("/api/admin/session")
  .then(session => session.authenticated ? showAdmin() : showLogin())
  .catch(showLogin);
