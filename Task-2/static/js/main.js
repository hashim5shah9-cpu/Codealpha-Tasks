/* ------------------------------------------------------------------
   SocialMedia — front-end interactions
------------------------------------------------------------------- */
(function () {
  "use strict";

  /* ------------------------- CSRF helper ------------------------- */
  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + "=") {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  const CSRF_TOKEN = getCookie("csrftoken") || "";

  /* --------------------------- toasts ---------------------------- */
  let toastTimer = null;
  function toast(message, type) {
    const area = document.getElementById("toast-area");
    if (!area) return;
    const el = document.createElement("div");
    el.className = "toast" + (type ? " toast--" + type : "");
    el.textContent = message;
    area.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  /* --------------------------- helpers --------------------------- */
  function postForm(form, opts) {
    opts = opts || {};
    const url = opts.url || form.getAttribute("action") || "";
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: opts.headers || { "X-CSRFToken": CSRF_TOKEN, "X-Requested-With": "XMLHttpRequest" },
      body: opts.body !== undefined ? opts.body : new FormData(form),
    }).then(function (res) {
      return res.json().catch(function () {
        return { status: "error" };
      }).then(function (data) {
        if (res.status >= 400) {
          const err = data && data.errors ? data.errors : "Something went wrong.";
          return Promise.reject(err);
        }
        return data;
      });
    });
  }

  function elemFromHTML(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /* --------------------- dropdown menus -------------------------- */
  document.addEventListener("click", function (e) {
    const openMenus = document.querySelectorAll(".menu-dropdown.open, .nav-user-menu.open");
    if (openMenus.length) {
      if (!e.target.closest(".post-actions-menu") && !e.target.closest(".nav-user")) {
        openMenus.forEach(function (m) { m.classList.remove("open"); });
      }
    }
  });

  document.querySelectorAll("[data-menu-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const menu = btn.closest(".post-actions-menu").querySelector(".menu-dropdown");
      document.querySelectorAll(".menu-dropdown.open").forEach(function (m) {
        if (m !== menu) m.classList.remove("open");
      });
      menu.classList.toggle("open");
    });
  });

  const navUser = document.querySelector(".nav-avatar-wrap");
  if (navUser) {
    navUser.addEventListener("click", function (e) {
      e.preventDefault();
      const menu = document.querySelector(".nav-user-menu");
      if (menu) menu.classList.toggle("open");
    });
  }

  /* ---------------------- like button ---------------------------- */
  function bindLike(form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const card = form.closest("[data-post-id]");
      const btn = form.querySelector("[data-like-btn]");
      const label = form.querySelector("[data-like-label]");
      const countSpan = card.querySelector("[data-like-count]");

      postForm(form).then(function (data) {
        btn.classList.toggle("liked", data.liked);
        btn.setAttribute("aria-pressed", data.liked ? "true" : "false");
        btn.innerHTML = '<span class="heart' + (data.liked ? " filled" : "") + '">♥</span>';
        if (countSpan) countSpan.textContent = data.count;
        toast(data.liked ? "Liked!" : "Removed like.", data.liked ? "success" : "");
      }).catch(function (err) {
        toast(typeof err === "string" ? err : "Could not update like.", "danger");
      });
    });
  }
  document.querySelectorAll("[data-like-form]").forEach(bindLike);

  /* -------------------- follow button ---------------------------- */
  function bindFollow(form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const btn = form.querySelector("[data-follow-btn]");
      const countEl = document.querySelector("[data-followers-count]");

      postForm(form).then(function (data) {
        btn.textContent = data.following ? "Following" : "Follow";
        btn.classList.remove("btn--primary", "btn--outline");
        btn.classList.add(data.following ? "btn--outline" : "btn--primary");
        if (countEl) countEl.textContent = data.count;
        toast(data.following ? "You are now following this user." : "Unfollowed.", data.following ? "success" : "");
      }).catch(function (err) {
        toast(typeof err === "string" ? err : "Could not update follow.", "danger");
      });
    });
  }
  document.querySelectorAll("[data-follow-form]").forEach(bindFollow);

  /* -------------------- create post ------------------------------ */
  const composer = document.querySelector("[data-post-form]");
  if (composer) {
    composer.addEventListener("submit", function (e) {
      /* Let the browser handle it normally: navigation + file uploads
         are simplest server-side. Nothing to enhance. */
      void e;
    });
  }

  /* -------------------- comments ------------------------------ */
  const commentForm = document.querySelector("[data-comment-form]");
  if (commentForm) {
    commentForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const input = commentForm.querySelector("textarea");
      if (!input.value.trim()) {
        toast("Write something first.", "danger");
        input.focus();
        return;
      }
      postForm(commentForm).then(function (data) {
        const list = document.querySelector("[data-comment-list]");
        const empty = list.querySelector("[data-comment-empty]");
        if (empty) empty.remove();

        const li = elemFromHTML(
          '<li class="comment" data-comment-id="' + data.id + '">' +
            '<a href="/profile/' + encodeURIComponent(data.author) + '/" class="comment-avatar">' +
              '<span class="avatar avatar--sm avatar--placeholder">' + data.author.charAt(0).toUpperCase() + "</span>" +
            "</a>" +
            '<div class="comment-body">' +
              '<div class="comment-meta">' +
                '<a href="/profile/' + encodeURIComponent(data.author) + '/" class="comment-author">' + data.author + "</a>" +
                '<span class="post-meta">' + data.created_at + "</span>" +
              "</div>" +
              '<p class="comment-text">' + escapeHtml(data.content).replace(/\n/g, "<br>") + "</p>" +
              (data.author === window.USERNAME
                ? '<button type="button" class="link-btn link-btn--danger" data-delete-comment="/comments/' + data.id + '/delete/">Delete</button>'
                : "") +
            "</div>" +
          "</li>"
        );
        list.appendChild(li);
        input.value = "";

        const badge = document.querySelector("[data-comments-total]");
        if (badge) badge.textContent = Number(badge.textContent || 0) + 1;
        if (data.total !== undefined) updateCommentCounts(data.total);
        toast("Comment posted.", "success");
      }).catch(function (err) {
        toast(typeof err === "string" ? err : "Could not post comment.", "danger");
      });
    });
  }

  /* -------------------- delete comment --------------------------- */
  document.addEventListener("click", function (e) {
    const delBtn = e.target.closest("[data-delete-comment]");
    if (!delBtn) return;
    e.preventDefault();
    if (!confirm("Delete this comment?")) return;

    fetch(delBtn.getAttribute("data-delete-comment"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRFToken": CSRF_TOKEN, "X-Requested-With": "XMLHttpRequest" },
    }).then(function (res) {
      return res.json().catch(function () { return { status: "error" }; });
    }).then(function (data) {
      const li = delBtn.closest(".comment");
      if (li) li.remove();
      const badge = document.querySelector("[data-comments-total]");
      if (badge) badge.textContent = Math.max(0, Number(badge.textContent || 0) - 1);
      if (data.count !== undefined) updateCommentCounts(data.count);
      toast("Comment deleted.");
    }).catch(function () {
      toast("Could not delete comment.", "danger");
    });
  });

  function updateCommentCounts(total) {
    document.querySelectorAll("[data-comment-count]").forEach(function (el) {
      el.textContent = total;
    });
  }

  /* -------------------- edit post inline ------------------------- */
  document.addEventListener("click", function (e) {
    const editBtn = e.target.closest("[data-edit-post]");
    if (!editBtn) return;

    const card = editBtn.closest("[data-post-id]");
    const contentEl = card.querySelector("[data-content]");
    const form = card.querySelector("[data-edit-form]");
    if (!form) return;

    contentEl.classList.add("hidden");
    form.classList.remove("hidden");
    const ta = form.querySelector("textarea");
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    const closeMenus = function () {
      const allOpen = document.querySelectorAll(".menu-dropdown.open");
      allOpen.forEach(function (m) { m.classList.remove("open"); });
    };
    closeMenus();
  });

  document.addEventListener("click", function (e) {
    const cancelBtn = e.target.closest("[data-cancel-edit]");
    if (!cancelBtn) return;
    const card = cancelBtn.closest("[data-post-id]");
    card.querySelector("[data-content]").classList.remove("hidden");
    cancelBtn.closest("[data-edit-form]").classList.add("hidden");
  });

  document.addEventListener("submit", function (e) {
    const form = e.target.closest("[data-edit-form]");
    if (!form) return;
    e.preventDefault();

    const card = form.closest("[data-post-id]");
    const contentEl = card.querySelector("[data-content]");
    const textarea = form.querySelector("textarea");
    if (!textarea.value.trim()) {
      toast("Post content cannot be empty.", "danger");
      return;
    }

    postForm(form, { url: form.action }).then(function (data) {
      contentEl.textContent = data.content;
      contentEl.classList.remove("hidden");
      form.classList.add("hidden");
      toast("Post updated.", "success");
    }).catch(function (err) {
      toast(typeof err === "string" ? err : "Could not update post.", "danger");
    });
  });

  /* -------------------- scroll to comments ----------------------- */
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-scroll-to-comments]");
    if (!btn) return;
    const comments = document.getElementById("comments");
    if (comments) comments.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* -------------------- escape util ------------------------------ */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();