const form = document.querySelector("#orderForm");
const serviceSelect = document.querySelector("#service");
const quantityInput = document.querySelector("#quantity");
const imageInput = document.querySelector("#image");
const previewWrap = document.querySelector("#previewWrap");
const preview = document.querySelector("#preview");
const message = document.querySelector("#formMessage");
const dialog = document.querySelector("#successDialog");
let services = [];

const peso = value => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP"
}).format(value || 0);

async function loadServices() {
  const response = await fetch("/api/services");
  services = await response.json();
  const groups = Object.groupBy
    ? Object.groupBy(services, service => service.category)
    : services.reduce((result, service) => {
        (result[service.category] ||= []).push(service);
        return result;
      }, {});
  serviceSelect.innerHTML = '<option value="">Choose a service…</option>';
  Object.entries(groups).forEach(([category, items]) => {
    const group = document.createElement("optgroup");
    group.label = category;
    items.forEach(service => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = `${service.name}${service.price ? ` — ${peso(service.price)}` : ""}`;
      group.append(option);
    });
    serviceSelect.append(group);
  });
}

function selectedService() {
  return services.find(service => service.id === serviceSelect.value);
}

function updateEstimate() {
  const service = selectedService();
  const quantity = Math.max(1, Number(quantityInput.value) || 1);
  document.querySelector("#total").textContent = peso((service?.price || 0) * quantity);
  document.querySelector("#serviceHint").textContent = service?.hasLayout
    ? "Photo required • A print-ready A4 PDF layout will be generated automatically."
    : service
      ? "You may attach an image if needed."
      : "";
  imageInput.required = Boolean(service?.hasLayout);
  document.querySelector("#uploadTitle").textContent = service?.hasLayout
    ? "Choose the photo to auto-layout *"
    : "Choose a photo";
}

serviceSelect.addEventListener("change", updateEstimate);
quantityInput.addEventListener("input", updateEstimate);
document.querySelector("#minus").addEventListener("click", () => {
  quantityInput.value = Math.max(1, Number(quantityInput.value) - 1);
  updateEstimate();
});
document.querySelector("#plus").addEventListener("click", () => {
  quantityInput.value = Math.min(500, Number(quantityInput.value) + 1);
  updateEstimate();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  previewWrap.classList.remove("hidden");
});
document.querySelector("#removeImage").addEventListener("click", () => {
  imageInput.value = "";
  preview.src = "";
  previewWrap.classList.add("hidden");
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "";
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = "Submitting…";
  try {
    const response = await fetch("/api/orders", { method: "POST", body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    document.querySelector("#reference").textContent = result.reference;
    document.querySelector("#dialogTotal").textContent = result.total
      ? `Estimated total: ${peso(result.total)}`
      : "The shop will confirm the price.";
    dialog.showModal();
    form.reset();
    quantityInput.value = 1;
    previewWrap.classList.add("hidden");
    updateEstimate();
  } catch (error) {
    message.textContent = error.message || "Unable to submit the order.";
  } finally {
    button.disabled = false;
    button.innerHTML = 'Submit order <span>→</span>';
  }
});

document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
document.querySelector("#newOrder").addEventListener("click", () => dialog.close());

loadServices().catch(() => {
  serviceSelect.innerHTML = '<option value="">Unable to load services</option>';
  message.textContent = "The server is unavailable. Please try again.";
});
