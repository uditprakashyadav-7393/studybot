// extras: mascot, reactions, chips
(function () {
  const msgs = document.getElementById("cb-msg");
  const sendBtn = document.getElementById("send-btn");
  const input = document.getElementById("input");
  if (!msgs || !sendBtn || !input) return;

  const mascot = document.querySelector(".cb-header .cb-logo");
  const status = document.querySelector(".cb-title div");

  // antenna
  if (mascot && !mascot.querySelector(".ant")) {
    const ant = document.createElement("i");
    ant.className = "ant";
    mascot.appendChild(ant);
  }

  const labels = {
    idle: " online",
    thinking: " thinking…",
    happy: " happy to help!",
    confused: " oops, try again",
  };
  let moodTimer;

  function setMood(mood, backAfter) {
    clearTimeout(moodTimer);
    if (document.body.dataset.mood !== mood) {
      document.body.dataset.mood = mood;
      const node = status && status.lastChild;
      if (node && node.nodeType === 3) node.textContent = labels[mood];
    }
    if (backAfter) moodTimer = setTimeout(() => setMood("idle"), backAfter);
  }

  const actions = [
    { icon: "💡", label: "Simplify", prompt: "Explain that again in simpler words, like I'm new to it." },
    { icon: "📌", label: "Example", prompt: "Give me a real-life example of this." },
    { icon: "🧠", label: "Quiz me", prompt: "Quiz me on this topic with 5 questions." },
    { icon: "🃏", label: "Flashcards", prompt: "Turn your last answer into 6 flashcards in a table with Question and Answer columns." },
    { icon: "📝", label: "Summarise", prompt: "Summarise your last answer in 4 short bullet points." },
  ];
  const colors = ["--cyan", "--pink", "--lime", "--amber", "--violet"];
  const reactions = ["👍", "❤️", "🤯", "😕"];

  function ask(text) {
    if (sendBtn.disabled) return;
    input.value = text;
    cbSend();
  }

  function buildBar(isQuiz) {
    const bar = document.createElement("div");
    bar.className = "ext-bar";

    const react = document.createElement("div");
    react.className = "ext-react";
    reactions.forEach((emoji) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "react-btn";
      b.textContent = emoji;
      b.title = "React";
      react.append(b);
    });
    bar.append(react);

    if (!isQuiz) {
      const chips = document.createElement("div");
      chips.className = "ext-chips";
      actions.forEach((a, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "xchip";
        b.dataset.prompt = a.prompt;
        b.style.setProperty("--i", i);
        b.style.setProperty("--c", `var(${colors[i % colors.length]})`);
        b.textContent = `${a.icon} ${a.label}`;
        chips.append(b);
      });
      bar.append(chips);
    }
    return bar;
  }

  // emoji burst
  function burst(el, emoji) {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const p = document.createElement("span");
      p.className = "burst";
      p.textContent = emoji;
      p.style.left = r.left + r.width / 2 + "px";
      p.style.top = r.top + "px";
      p.style.setProperty("--dx", Math.round(Math.random() * 90 - 45) + "px");
      p.style.setProperty("--r", Math.round(Math.random() * 80 - 40) + "deg");
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 950);
    }
  }

  function confetti() {
    const bits = ["🎉", "✨", "⭐", "💙", "💖", "🎊"];
    for (let i = 0; i < 28; i++) {
      const c = document.createElement("span");
      c.className = "confetti";
      c.textContent = bits[i % bits.length];
      c.style.left = Math.random() * 100 + "vw";
      c.style.animationDelay = Math.random() * 0.6 + "s";
      c.style.setProperty("--dx", Math.round(Math.random() * 160 - 80) + "px");
      c.style.setProperty("--r", Math.round(Math.random() * 720) + "deg");
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3200);
    }
  }

  msgs.addEventListener("click", (e) => {
    const r = e.target.closest(".react-btn");
    if (r) {
      const on = r.classList.toggle("on");
      r.parentElement.querySelectorAll(".react-btn").forEach((o) => {
        if (o !== r) o.classList.remove("on");
      });
      if (on) burst(r, r.textContent);
      return;
    }
    const c = e.target.closest(".xchip");
    if (c) ask(c.dataset.prompt);
  });

  const isBusy = () => !!document.getElementById("bot-typing") || sendBtn.disabled;
  let wasBusy = false;
  let timer;

  function refresh() {
    if (isBusy()) return;

    const bots = [...msgs.querySelectorAll(".msg.bot")].filter(
      (m) => !m.id && !m.querySelector(".suggest-chips"),
    );

    bots.forEach((m) => {
      const wrap = m.querySelector(".msg-wrap");
      const bubble = m.querySelector(".msg-bbl");
      if (!wrap || !bubble || wrap.querySelector(".ext-bar")) return;
      if (!bubble.textContent.trim() && !bubble.children.length) return;
      if (/^\s*(Oops|Hmm 🤔)/.test(bubble.textContent)) {
        m.dataset.err = "1";
        return;
      }
      const quiz = m.matches(".quiz-bubble") || m.querySelector(".quiz-bubble");
      wrap.appendChild(buildBar(!!quiz));
    });

    msgs.querySelectorAll(".msg.is-last").forEach((m) => m.classList.remove("is-last"));
    const last = bots[bots.length - 1];
    if (last && last === msgs.lastElementChild && !last.dataset.err && last.querySelector(".ext-bar")) {
      last.classList.add("is-last");
    }

    if (wasBusy) {
      wasBusy = false;
      setMood(last && last.dataset.err ? "confused" : "happy", 3500);
    }
  }

  const watcher = new MutationObserver(() => {
    // wave bars
    msgs.querySelectorAll(".type-ind").forEach((t) => {
      while (t.children.length < 5) t.appendChild(document.createElement("span"));
    });
    if (isBusy()) {
      wasBusy = true;
      setMood("thinking");
    }
    // quiz done
    const done = msgs.querySelector(".quiz-result:not([data-cele])");
    if (done) {
      done.dataset.cele = "1";
      const pct = parseInt((done.textContent.match(/(\d+)%/) || [])[1], 10);
      if (isNaN(pct) || pct >= 60) confetti();
    }
    clearTimeout(timer);
    timer = setTimeout(refresh, 450);
  });

  watcher.observe(msgs, { childList: true, subtree: true, characterData: true });
  watcher.observe(sendBtn, { attributes: true, attributeFilter: ["disabled"] });
  setMood("idle");
})();