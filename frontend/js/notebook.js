// notebook skin
(function () {
  const msgs = document.getElementById("cb-msg");
  if (!msgs) return;

  const LINE = 32;
  let level = "12";

  // class changes
  document.addEventListener("change", (e) => {
    if (e.target.matches('select[name="class"]')) level = e.target.value;
  });

  // snap to lines
  const sizer = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      const msg = target.closest(".msg");
      if (!msg) return;
      msg.style.minHeight = Math.ceil(target.offsetHeight / LINE) * LINE + "px";
    });
  });

  function watch(msg) {
    if (msg.dataset.nb) return;
    msg.dataset.nb = "1";
    const body = msg.querySelector(".msg-wrap, .type-ind");
    if (body) sizer.observe(body);
  }

  // margin note
  function addNote(msg) {
    if (!msg.matches(".msg.bot") || msg.id) return;
    const bubble = msg.querySelector(".msg-bbl");
    if (!bubble) return;

    const old = msg.querySelector(".margin-note");
    const failed = /^\s*(Oops|Hmm 🤔)/.test(bubble.textContent);
    if (failed) {
      if (old) old.remove();
      return;
    }
    if (old) return;

    // data-source = "Ch 5|p.112"
    const parts = (msg.dataset.source || "NCERT|Class " + level).split("|");
    const note = document.createElement("span");
    note.className = "margin-note";
    parts.forEach((text) => {
      const line = document.createElement("b");
      line.textContent = text;
      note.append(line);
    });
    msg.prepend(note);
  }

  function scan() {
    msgs.querySelectorAll(".msg").forEach((msg) => {
      watch(msg);
      addNote(msg);
    });
  }

  let queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  }

  new MutationObserver(queue).observe(msgs, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scan();
})();

// style switcher: normal / graph paper / answer sheet / sticky notes
(function () {
  const KEY = "studynotes.skin";
  const SKINS = ["normal", "graph", "sheet", "sticky"];
  const btn = document.getElementById("cb-style-btn");
  const menu = document.getElementById("cb-style-menu");
  if (!btn || !menu) return;

  const items = Array.from(menu.querySelectorAll("[data-skin]"));

  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  // normal = no data-skin, so the existing notebook look stays as it is
  function applySkin(skin, save) {
    if (!SKINS.includes(skin)) skin = "normal";
    if (skin === "normal") delete document.body.dataset.skin;
    else document.body.dataset.skin = skin;

    items.forEach((item) => {
      item.setAttribute("aria-checked", String(item.dataset.skin === skin));
    });

    if (save) {
      try {
        localStorage.setItem(KEY, skin);
      } catch {
        // storage unavailable, skin still applies for this visit
      }
    }
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  items.forEach((item) => {
    item.addEventListener("click", () => {
      applySkin(item.dataset.skin, true);
      setOpen(false);
    });
  });

  // close on outside tap / Escape
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });

  let saved = "normal";
  try {
    saved = localStorage.getItem(KEY) || "normal";
  } catch {
    // ignore
  }
  applySkin(saved, false);

  // sticky notes: a very tall note (13 MCQs etc.) loses its tilt, otherwise its
  // corners poke past the screen edge. The CSS straightens it through .is-tall.
  const feed = document.getElementById("cb-msg");
  if (feed && typeof ResizeObserver === "function") {
    const TALL = 800;
    const seen = new WeakSet();
    const tilt = new ResizeObserver((entries) => {
      entries.forEach(({ target }) => {
        target.classList.toggle("is-tall", target.offsetHeight > TALL);
      });
    });
    const watchBubbles = () => {
      feed.querySelectorAll(".msg-bbl").forEach((bubble) => {
        if (seen.has(bubble)) return;
        seen.add(bubble);
        tilt.observe(bubble);
      });
    };
    new MutationObserver(watchBubbles).observe(feed, { childList: true, subtree: true });
    watchBubbles();
  }
})();