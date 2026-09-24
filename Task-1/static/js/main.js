document.addEventListener("DOMContentLoaded", () => {
  const badge = document.getElementById("cart-count");
  const csrf = document.querySelector("[name=csrfmiddlewaretoken]")?.value;

  function toast(text) {
    document.querySelector(".toast")?.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  document.querySelectorAll(".add-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      if (button?.disabled) return;
      try {
        const body = new FormData(form);
        const response = await fetch(form.action, {
          method: "POST",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": body.get("csrfmiddlewaretoken") || csrf,
          },
          body,
        });
        const data = await response.json();
        if (!data.ok) return;
        if (badge) badge.textContent = data.cart_count;
        if (button) {
          const original = button.textContent;
          button.textContent = "Added";
          setTimeout(() => {
            button.textContent = original;
          }, 1200);
        }
        toast("Added to bag");
      } catch {
        form.submit();
      }
    });
  });
});
