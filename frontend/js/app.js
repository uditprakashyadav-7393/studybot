const inputMsg = document.getElementById("input");
const inputArea = document.querySelector(".input-area");
const msgs = document.getElementById("cb-msg");
const sendBtn = document.getElementById("send-btn");
const navbar = document.querySelector(".navbar");
const hamburger = document.querySelector(".hamburger");
const attachBtn = document.getElementById("attach-btn");
const attachmentInput = document.getElementById("attachment-input");
const attachmentList = document.getElementById("attachment-list");
const newChat = document.getElementById("new-chat");
const savedChat = document.getElementById("saved-chat");
const savedChatView = document.getElementById("saved-chat-view");
const studyTopics = document.getElementById("study-topics");
const ncertTopics = document.getElementById("ncert-topics");
const topicsView = document.getElementById("topics-view");
const notesView = document.getElementById("notes-view");
const themeToggle = document.getElementById("cb-theme");
const welcomeMessage = msgs.firstElementChild.cloneNode(true);
const SAVED_CHATS_KEY = "studynotes.savedChats";
const THEME_KEY = "studynotes.theme";
let attachedFiles = [];
let conversationId = 0;
let activeChatId = createChatId();
let conversationMessages = [];


// hamburger menu
function toggleMenu() {
  navbar.classList.toggle("open");
  hamburger.classList.toggle("open");
}

//? TIME
function cbTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readSavedChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_CHATS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistConversation() {
  const firstUserMessage = conversationMessages.find(
    (message) => message.role === "user",
  );
  if (!firstUserMessage) return;

  const titleSource =
    firstUserMessage.text || firstUserMessage.files[0]?.name || "New chat";
  const savedConversation = {
    id: activeChatId,
    title: titleSource.slice(0, 48),
    updatedAt: new Date().toISOString(),
    messages: conversationMessages,
  };
  const savedChats = readSavedChats().filter((chat) => chat.id !== activeChatId);

  try {
    localStorage.setItem(
      SAVED_CHATS_KEY,
      JSON.stringify([savedConversation, ...savedChats].slice(0, 50)),
    );
  } catch {
    // Keep the chat usable if browser storage is unavailable or full.
  }
}


function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function enhanceCodeBlocks(container) {
  const preElements = container.querySelectorAll("pre");
  preElements.forEach((pre) => {
    if (pre.closest(".code-block-wrapper")) return;

    const code = pre.querySelector("code");
    const codeText = code ? code.textContent : pre.textContent;

    let language = "Code";
    if (code && code.className) {
      const match = code.className.match(/language-(\w+)/);
      if (match) language = match[1].toUpperCase();
    }

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";

    const header = document.createElement("div");
    header.className = "code-header";

    const langLabel = document.createElement("span");
    langLabel.textContent = language;

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "code-copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeText);
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      } catch {
        copyBtn.textContent = "Failed";
      }
    });

    header.append(langLabel, copyBtn);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(header, pre);
  });
}

function renderBotMessageContent(bubble, text) {
  if (!text) {
    bubble.textContent = "";
    return;
  }

  // 1. Protect LaTeX math delimiters from Markdown processing
  const mathPlaceholders = [];

  // Protect display math ($$...$$ and \[...\])
  let processed = text.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (match) => {
    const key = `@@MATH_BLOCK_${mathPlaceholders.length}@@`;
    mathPlaceholders.push({ key, raw: match });
    return key;
  });

  // Protect inline math ($...$ and \(...\))
  processed = processed.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$|\\\(([\s\S]*?)\\\)/g, (match) => {
    const key = `@@MATH_BLOCK_${mathPlaceholders.length}@@`;
    mathPlaceholders.push({ key, raw: match });
    return key;
  });

  // 2. Parse Markdown
  let html = "";
  if (typeof marked !== "undefined" && typeof marked.parse === "function") {
    try {
      marked.setOptions({
        gfm: true,
        breaks: true,
      });
      html = marked.parse(processed);
    } catch {
      html = escapeHtml(processed).replace(/\n/g, "<br>");
    }
  } else {
    html = escapeHtml(processed)
      .replace(/\n\n/g, "<p></p>")
      .replace(/\n/g, "<br>");
  }

  // 3. Restore protected math blocks
  mathPlaceholders.forEach(({ key, raw }) => {
    html = html.split(key).join(raw);
  });

  // 4. Sanitize with DOMPurify if present
  if (typeof DOMPurify !== "undefined" && typeof DOMPurify.sanitize === "function") {
    bubble.innerHTML = DOMPurify.sanitize(html, {
      ADD_TAGS: [
        "annotation", "math", "semantics", "mtext", "mn", "mo", "mi",
        "mspace", "mover", "munder", "msubsup", "msup", "msub",
        "mfrac", "mroot", "msqrt", "mtable", "mtr", "mtd"
      ],
      ADD_ATTR: ["display", "xmlns", "columnalign", "rowspacing", "columnspacing"],
    });
  } else {
    bubble.innerHTML = html;
  }

  // 5. Render KaTeX math
  if (typeof renderMathInElement === "function") {
    try {
      renderMathInElement(bubble, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } catch (e) {
      console.warn("KaTeX rendering error:", e);
    }
  }

  // 6. Enhance code blocks with language and copy buttons
  enhanceCodeBlocks(bubble);
}

// ==========================================
// 🧠 INTERACTIVE QUIZ ENGINE
// ==========================================

let activeQuiz = null;

function resolveQuizAnswer(rawAnswer, options) {
  const answer = String(rawAnswer ?? "").trim();
  if (!answer || !Array.isArray(options) || options.length === 0) return "";

  const letterMatch = answer.match(/^\W*([A-Da-d])\W*$/);
  if (letterMatch) {
    const letter = letterMatch[1].toUpperCase();
    if (options.some((o) => o.id === letter)) return letter;
  }

  if (/^[1-4]$/.test(answer)) {
    const index = Number(answer) - 1;
    if (options[index]) return options[index].id;
  }

  const target = answer.toLowerCase();
  const exact = options.find((o) => o.text.trim().toLowerCase() === target);
  if (exact) return exact.id;

  if (target.length >= 4) {
    const loose = options.find((o) => {
      const text = o.text.trim().toLowerCase();
      return text.length >= 3 && (text.includes(target) || target.includes(text));
    });
    if (loose) return loose.id;
  }

  return "";
}

function normalizeQuizData(raw) {
  if (!raw) return null;

  const quiz =
    raw.quiz && typeof raw.quiz === "object"
      ? raw.quiz
      : Array.isArray(raw.quiz)
        ? { title: raw.title, questions: raw.quiz }
        : raw;

  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0)
    return null;

  const questions = quiz.questions
    .map((q, idx) => {
      if (!q || typeof q !== "object") return null;

      let rawOptions = [];

      if (Array.isArray(q.options)) {
        rawOptions = q.options;
      } else if (Array.isArray(q.choices)) {
        rawOptions = q.choices;
      } else if (q.options && typeof q.options === "object") {
        rawOptions = Object.entries(q.options).map(([key, value]) =>
          value && typeof value === "object"
            ? { id: key, ...value }
            : { id: key, text: String(value) },
        );
      }

      const cleanOptions = rawOptions
        .map((o, i) => {
          if (typeof o === "string") {
            const text = o.trim();
            return text ? { id: String.fromCharCode(65 + i), text } : null;
          }
          if (!o || typeof o !== "object") return null;
          const text = String(o.text ?? o.label ?? o.content ?? "").trim();
          if (!text) return null;
          const rawId = String(o.id ?? "").trim().toUpperCase();
          const id = /^[A-D]$/.test(rawId) ? rawId : String.fromCharCode(65 + i);
          return { id, text };
        })
        .filter(Boolean)
        .slice(0, 4);

      if (!q.question || cleanOptions.length < 2) return null;

      const answer = resolveQuizAnswer(
        q.answer ?? q.correct ?? q.correctAnswer ?? "",
        cleanOptions,
      );

      // Drop questions whose answer cannot be mapped to an option so
      // the quiz stays gradeable instead of failing to render.
      if (!answer) return null;

      return {
        id: q.id ?? idx + 1,
        question: String(q.question),
        options: cleanOptions,
        answer,
        hint: q.hint ? String(q.hint) : "",
        explanation: q.explanation ? String(q.explanation) : "",
      };
    })
    .filter(Boolean);
  if (questions.length === 0) return null;
  return {
    type: "quiz",
    quiz: {
      title: quiz.title ? String(quiz.title) : "Quiz",
      questions,
    },
  };
}

function extractQuizFromText(text) {
  if (!text || typeof text !== "string") return null;

  const trimmed = text.trim();

  // The whole reply may be one JSON-encoded string (double-encoded JSON).
  if (trimmed.startsWith('"')) {
    try {
      const unwrapped = JSON.parse(trimmed);
      if (typeof unwrapped === "string" && unwrapped !== text) {
        return extractQuizFromText(unwrapped);
      }
    } catch {}
  }

  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const candidates = [];
  if (cleaned.includes('"quiz"') || cleaned.includes('"questions"'))
    candidates.push(cleaned);
  for (let s = 0; s < text.length; s++) {
    if (text[s] !== "{") continue;
    let depth = 0,
      inStr = false,
      esc = false;
    for (let i = s; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const snippet = text.slice(s, i + 1);
            if (snippet.includes('"quiz"') || snippet.includes('"questions"'))
              candidates.push(snippet);
            break;
          }
        }
      }
    }
    if (candidates.length >= 6) break;
  }
  for (const cand of candidates) {
    const norm = parseQuizCandidate(cand);
    if (norm) return norm;
  }
  return null;
}

function parseQuizCandidate(candidate) {
  const attempts = [candidate, candidate.replace(/,\s*([}\]])/g, "$1")];
  for (const attempt of attempts) {
    try {
      let parsed = JSON.parse(attempt);
      for (let i = 0; i < 2 && typeof parsed === "string"; i++) {
        parsed = JSON.parse(parsed);
      }
      const norm = normalizeQuizData(parsed);
      if (norm) return norm;
    } catch {}
  }
  return null;
}

const QUIZ_FAILED_TEXT =
  "Oops! 😅 I couldn't show that quiz — the reply didn't include valid quiz data. Could you please ask me again? I'll get it right for you! 🍀";

function isRawQuizJson(text) {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1 || firstBrace > 80) return false;
  return trimmed.includes('"quiz"') || trimmed.includes('"questions"');
}

function getQuizIntroMessage(reply, quizData) {
  if (
    reply &&
    typeof reply === "object" &&
    typeof reply.message === "string" &&
    reply.message.trim()
  ) {
    return reply.message.trim();
  }

  const questions =
    reply && typeof reply === "object" && reply.quiz && Array.isArray(reply.quiz.questions)
      ? reply.quiz.questions
      : quizData && quizData.quiz && Array.isArray(quizData.quiz.questions)
        ? quizData.quiz.questions
        : [];

  if (questions.length > 0) {
    return `Absolutely! Here are your ${questions.length} MCQs 🎯 Take your time, and best of luck! 🍀✨`;
  }

  return "Here's your quiz! 🎯 Best of luck! 🍀✨";
}

function renderQuizMessage(quizData) {
  const normalized = normalizeQuizData(quizData);
  if (!normalized) {
    return null;
  }

  const quiz = normalized.quiz;

  if (
    !Array.isArray(quiz.questions) ||
    quiz.questions.length === 0
  ) {
    return null;
  }

  const state = {
    title: quiz.title || "Study Notes Pro Quiz",
    questions: quiz.questions,
    currentIndex: 0,
    score: 0,
    answered: false,
    answers: [],
  };

  // Keep global ref for backwards-compat, but state lives on the bubble
  // so multiple quizzes + history restore don't clobber each other.
  activeQuiz = state;

  const message = document.createElement("div");
  message.className = "msg bot";

  const avatar = document.createElement("div");
  avatar.className = "msg-lg";
  avatar.textContent = "🤖";

  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";

  const bubble = document.createElement("div");
  bubble.className = "msg-bbl cb-text quiz-bubble";
  bubble._quizState = state;

  renderQuizQuestion(bubble, state);

  const timestamp = document.createElement("div");
  timestamp.className = "msg-ts";
  timestamp.textContent = cbTime();

  wrap.append(bubble, timestamp);
  message.append(avatar, wrap);

  msgs.appendChild(message);
  msgs.scrollTop = msgs.scrollHeight;

  return message;
}


function renderQuizQuestion(container, quizState) {
  container.replaceChildren();

  const quiz = quizState || container._quizState || activeQuiz;

  if (!quiz) return;

  container._quizState = quiz;

  const question =
    quiz.questions[quiz.currentIndex];

  if (!question) {
    renderQuizResult(container, quiz);
    return;
  }

  quiz.answered = false;

  // ------------------------------------------
  // Header
  // ------------------------------------------

  const header = document.createElement("div");
  header.className = "quiz-header";

  const title = document.createElement("div");
  title.className = "quiz-title";
  title.textContent =
    quiz.title || "Study Notes Pro Quiz";

  const progress = document.createElement("div");
  progress.className = "quiz-progress";

  progress.textContent =
    `${quiz.currentIndex + 1} / ${quiz.questions.length}`;

  header.append(title, progress);


  // ------------------------------------------
  // Progress bar
  // ------------------------------------------

  const progressBar = document.createElement("div");
  progressBar.className = "quiz-progress-bar";

  const progressFill = document.createElement("div");
  progressFill.className = "quiz-progress-fill";

  progressFill.style.width =
    `${((quiz.currentIndex + 1) / quiz.questions.length) * 100}%`;

  progressBar.appendChild(progressFill);


  // ------------------------------------------
  // Question
  // ------------------------------------------

  const questionNumber =
    document.createElement("div");

  questionNumber.className = "quiz-question-number";

  questionNumber.textContent =
    `Question ${quiz.currentIndex + 1}`;


  const questionText =
    document.createElement("div");

  questionText.className = "quiz-question";

  renderBotMessageContent(
    questionText,
    question.question || "",
  );


  // ------------------------------------------
  // Options
  // ------------------------------------------

  const options =
    document.createElement("div");

  options.className = "quiz-options";

  const optionList =
    Array.isArray(question.options)
      ? question.options
      : [];

  optionList.forEach((option) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "quiz-option";

    const optionId =
      option.id || option.label || "";

    const optionText =
      option.text || option.content || "";

    const label =
      document.createElement("span");

    label.className = "quiz-option-label";
    label.textContent = optionId;

    const text =
      document.createElement("span");

    text.className = "quiz-option-text";

    renderBotMessageContent(
      text,
      optionText,
    );

    button.append(label, text);

    button.addEventListener("click", () => {
      handleQuizAnswer(
        container,
        question,
        optionId,
        quiz,
      );
    });

    options.appendChild(button);
  });


  // ------------------------------------------
  // Hint
  // ------------------------------------------

  const hintButton =
    document.createElement("button");

  hintButton.type = "button";
  hintButton.className = "quiz-hint-btn";
  hintButton.textContent = "💡 Hint";

  hintButton.addEventListener("click", () => {
    showQuizHint(
      container,
      question,
    );
  });


  // ------------------------------------------
  // Assemble
  // ------------------------------------------

  container.append(
    header,
    progressBar,
    questionNumber,
    questionText,
    options,
    hintButton,
  );

  // Render equations
  renderQuizMath(container);
}


function handleQuizAnswer(
  container,
  question,
  selectedAnswer,
  quizState,
) {
  const quiz = quizState || container._quizState || activeQuiz;

  if (!quiz || quiz.answered) {
    return;
  }

  container._quizState = quiz;
  quiz.answered = true;

  const correctAnswer =
    String(question.answer || "")
      .trim()
      .toUpperCase();

  const selected =
    String(selectedAnswer)
      .trim()
      .toUpperCase();

  const isCorrect =
    selected === correctAnswer;

  if (isCorrect) {
    quiz.score += 1;
  }

  quiz.answers.push({
    question: quiz.currentIndex + 1,
    selected: selectedAnswer,
    correct: question.answer,
    isCorrect,
  });

  const optionButtons =
    container.querySelectorAll(".quiz-option");

  optionButtons.forEach((button) => {
    button.disabled = true;

    const label =
      button.querySelector(".quiz-option-label");

    const id =
      label?.textContent
        ?.trim()
        ?.toUpperCase();

    if (id === correctAnswer) {
      button.classList.add("correct");
    }

    if (
      id === selected &&
      !isCorrect
    ) {
      button.classList.add("wrong");
    }
  });


  // ------------------------------------------
  // Feedback
  // ------------------------------------------

  const feedback =
    document.createElement("div");

  feedback.className =
    `quiz-feedback ${
      isCorrect ? "correct" : "wrong"
    }`;

  const feedbackTitle =
    document.createElement("strong");

  feedbackTitle.textContent =
    isCorrect
      ? "✓ Correct!"
      : "✗ Not quite";

  feedback.appendChild(feedbackTitle);


  // ------------------------------------------
  // Explanation
  // ------------------------------------------

  if (question.explanation) {
    const explanation =
      document.createElement("div");

    explanation.className =
      "quiz-explanation";

    renderBotMessageContent(
      explanation,
      question.explanation,
    );

    feedback.appendChild(explanation);
  }


  // ------------------------------------------
  // Next button
  // ------------------------------------------

  const nextButton =
    document.createElement("button");

  nextButton.type = "button";
  nextButton.className =
    "quiz-next-btn";

  const isLast =
    quiz.currentIndex >=
    quiz.questions.length - 1;

  nextButton.textContent =
    isLast
      ? "View Result"
      : "Next Question →";

  nextButton.addEventListener(
    "click",
    () => {
      if (isLast) {
        renderQuizResult(container, quiz);
      } else {
        quiz.currentIndex += 1;
        renderQuizQuestion(container, quiz);
      }

      msgs.scrollTop =
        msgs.scrollHeight;
    },
  );

  feedback.appendChild(nextButton);

  container.appendChild(feedback);

  renderQuizMath(container);

  msgs.scrollTop =
    msgs.scrollHeight;
}


function showQuizHint(
  container,
  question,
) {
  const existing =
    container.querySelector(
      ".quiz-hint",
    );

  if (existing) {
    existing.remove();
    return;
  }

  const hint =
    document.createElement("div");

  hint.className =
    "quiz-hint";

  hint.textContent =
    question.hint ||
    "Think about the key NCERT concept related to this question.";

  container.appendChild(hint);

  msgs.scrollTop =
    msgs.scrollHeight;
}


function renderQuizResult(container, quizState) {
  const quiz = quizState || container._quizState || activeQuiz;

  if (!quiz) return;

  container._quizState = quiz;

  container.replaceChildren();

  const total =
    quiz.questions.length;

  const score =
    quiz.score;

  const percentage =
    Math.round((score / total) * 100);

  const result =
    document.createElement("div");

  result.className =
    "quiz-result";


  const title =
    document.createElement("h3");

  title.textContent =
    "🎉 Quiz Completed!";


  const scoreText =
    document.createElement("div");

  scoreText.className =
    "quiz-score";

  scoreText.textContent =
    `${score} / ${total}`;


  const accuracy =
    document.createElement("div");

  accuracy.className =
    "quiz-accuracy";

  accuracy.textContent =
    `Accuracy: ${percentage}%`;


  const message =
    document.createElement("p");

  if (percentage >= 80) {
    message.textContent =
      "Excellent work! 🔥 Keep it up.";
  } else if (percentage >= 60) {
    message.textContent =
      "Good attempt! Revise the weak areas once.";
  } else {
    message.textContent =
      "Nice attempt! Review the explanations and try again.";
  }


  const retryButton =
    document.createElement("button");

  retryButton.type = "button";
  retryButton.className =
    "quiz-retry-btn";

  retryButton.textContent =
    "↻ Retry Quiz";

  retryButton.addEventListener(
    "click",
    () => {
      quiz.currentIndex = 0;
      quiz.score = 0;
      quiz.answered = false;
      quiz.answers = [];

      renderQuizQuestion(container, quiz);
    },
  );

  result.append(
    title,
    scoreText,
    accuracy,
    message,
    retryButton,
  );

  container.appendChild(result);
}


function renderQuizMath(container) {
  if (
    typeof renderMathInElement !==
    "function"
  ) {
    return;
  }

  try {
    renderMathInElement(container, {
      delimiters: [
        {
          left: "$$",
          right: "$$",
          display: true,
        },
        {
          left: "\\[",
          right: "\\]",
          display: true,
        },
        {
          left: "\\(",
          right: "\\)",
          display: false,
        },
        {
          left: "$",
          right: "$",
          display: false,
        },
      ],
      throwOnError: false,
    });
  } catch (error) {
    console.warn(
      "Quiz KaTeX rendering error:",
      error,
    );
  }
}

//& Append message

function cbAppend(role, text, files = [], shouldPersist = true) {
  if (shouldPersist) {
    conversationMessages.push({
      role,
      text,
      files: files.map((file) => ({ name: file.name, size: file.size })),
    });
    persistConversation();
  }

  const message = document.createElement("div");
  message.className = `msg ${role === "user" ? "me" : "bot"}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-lg";
  avatar.textContent = role === "user" ? "🤴" : "🤖";

  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";

  const bubble = document.createElement("div");
  bubble.className = "msg-bbl cb-text";

  if (role === "user") {
    bubble.textContent = text;
  } else {
    renderBotMessageContent(bubble, text);
  }

  if (files.length > 0) {
    const fileList = document.createElement("div");
    fileList.className = "message-attachments";

    files.forEach((file) => {
      const fileCard = document.createElement("div");
      fileCard.className = "message-attachment";

      const fileName = document.createElement("span");
      fileName.className = "message-attachment-name";
      fileName.textContent = file.name;

      const fileSize = document.createElement("span");
      fileSize.className = "message-attachment-size";
      fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

      fileCard.append(fileName, fileSize);
      fileList.append(fileCard);
    });

    bubble.append(fileList);
  }

  if (role === "user") {
    const timestamp = document.createElement("div");
    timestamp.className = "msg-ts";
    timestamp.textContent = cbTime();
    wrap.append(bubble, timestamp);
  } else {
    const footer = document.createElement("div");
    footer.className = "msg-footer";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "msg-copy-action";
    copyBtn.title = "Copy answer";
    copyBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor">
        <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
      </svg>
      <span>Copy</span>
    `;

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        const span = copyBtn.querySelector("span");
        if (span) span.textContent = "Copied!";
        setTimeout(() => {
          if (span) span.textContent = "Copy";
        }, 2000);
      } catch (err) {
        console.warn("Copy failed:", err);
      }
    });

    const timestamp = document.createElement("div");
    timestamp.className = "msg-ts";
    timestamp.textContent = cbTime();

    footer.append(copyBtn, timestamp);
    wrap.append(bubble, footer);
  }

  message.append(avatar, wrap);
  msgs.appendChild(message);
  msgs.scrollTop = msgs.scrollHeight;
  return message;
}


//* Typing indicator 
function showType(){
  const d = document.createElement("div");
  d.id = "bot-typing";
  d.className = "msg bot";
  d.innerHTML = `<div class="msg-lg">🤖</div><div class="msg-wrap"><div class="type-ind"><span></span><span></span><span></span></div></div>`;
  msgs.append(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function hideType() {
 const t = document.getElementById("bot-typing");
 if (t) t.remove();
}

//? New Chat

function resetInputHeight() {
  inputMsg.value = "";
  inputMsg.style.height = "auto";
}

function autoResizeInput() {
  inputMsg.style.height = "auto";
  const newHeight = Math.min(inputMsg.scrollHeight, 150);
  inputMsg.style.height = `${Math.max(newHeight, 24)}px`;
}

function startNewChat() {
  conversationId += 1;
  conversationMessages = [];
  activeChatId = createChatId();
  renderCurrentConversation();
  resetInputHeight();
  attachedFiles = [];
  renderAttachments();
  hideType();
  sendBtn.disabled = false;
  navbar.classList.remove("open");
  hamburger.classList.remove("open");
  inputMsg.focus();
}

newChat.addEventListener("click", startNewChat);
savedChat.addEventListener("click", showSavedChats);

function renderCurrentConversation() {
  savedChatView.hidden = true;
  topicsView.hidden = true;
  notesView.hidden = true;
  msgs.hidden = false;
  msgs.replaceChildren(welcomeMessage.cloneNode(true));
  conversationMessages.forEach((msg) => {
    const { role, text, files = [] } = msg;

    // Interactive quiz saved as structured data
    if (msg.quiz) {
      const rendered = renderQuizMessage({ type: "quiz", quiz: msg.quiz });
      if (!rendered) {
        cbAppend(role, QUIZ_FAILED_TEXT, files, false);
      }
      return;
    }

    // Older saves may hold the quiz as a raw JSON text blob
    if (role === "bot" && typeof text === "string" && isRawQuizJson(text)) {
      const embeddedQuiz = extractQuizFromText(text);
      if (embeddedQuiz) {
        renderQuizMessage(embeddedQuiz);
      } else {
        // Never dump raw JSON into the chat bubble.
        cbAppend(role, QUIZ_FAILED_TEXT, files, false);
      }
      return;
    }

    cbAppend(role, text, files, false);
  });
}

function savedNode(tag, className, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  if (tag === "button") node.type = "button";
  return node;
}

//* Saved Chat 
async function showSavedChats() {
  conversationId += 1;
  const requestId = conversationId;
  sendBtn.disabled = false;
  hideType();
  navbar.classList.remove("open");
  hamburger.classList.remove("open");
  msgs.hidden = true;
  topicsView.hidden = true;
  notesView.hidden = true;
  savedChatView.hidden = false;

  const header = savedNode("div", "saved-chat-header");
  header.append(savedNode("h2", "", "Saved chats"));
  const backButton = savedNode("button", "saved-chat-back", "Back to chat");
  backButton.addEventListener("click", renderCurrentConversation);
  header.append(backButton);

  savedChatView.replaceChildren(
    header,
    savedNode("p", "saved-chat-empty", "Loading saved chats..."),
  );

  const chatsById = new Map(readSavedChats().map((chat) => [chat.id, chat]));
  try {
    const serverChats = await getSavedChats();
    serverChats.forEach((chat) => {
      if (!chatsById.has(chat.id)) {
        chatsById.set(chat.id, {
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updated_at,
          messages: [],
        });
      }
    });
  } catch {
    // Keep browser-saved chats available when the backend is offline.
  }
  if (requestId !== conversationId || savedChatView.hidden) return;

  const chats = [...chatsById.values()].sort(
    (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt),
  );
  if (chats.length === 0) {
    savedChatView.replaceChildren(
      header,
      savedNode("p", "saved-chat-empty", "Your conversations will appear here after you chat."),
    );
    return;
  }

  const list = savedNode("div", "saved-chat-list");
  chats.forEach((chat) => {
    const row = savedNode("div", "saved-chat-row");
    const openButton = savedNode("button", "saved-chat-open");
    const messageCount = Array.isArray(chat.messages) ? chat.messages.length : 0;
    openButton.append(
      savedNode("span", "saved-chat-title", chat.title || "Saved chat"),
      savedNode(
        "span",
        "saved-chat-details",
        `${messageCount ? `${messageCount} messages · ` : "Saved · "}${new Date(chat.updatedAt).toLocaleDateString()}`,
      ),
    );
    openButton.addEventListener("click", () => loadSavedChat(chat.id));

    const deleteButton = savedNode("button", "saved-chat-delete", "Delete");
    deleteButton.setAttribute("aria-label", `Delete ${chat.title || "saved chat"}`);
    deleteButton.addEventListener("click", () => deleteSavedChat(chat.id));
    row.append(openButton, deleteButton);
    list.append(row);
  });
  savedChatView.replaceChildren(header, list);
}

async function loadSavedChat(chatId) {
  let chat = readSavedChats().find((saved) => saved.id === chatId);
  if (!chat) {
    try {
      const saved = await getSavedChat(chatId);
      chat = {
        id: saved.id,
        title: saved.title,
        updatedAt: saved.updated_at,
        messages: saved.messages.map((message) => ({
          role: message.role === "assistant" ? "bot" : "user",
          text: message.content,
          files: message.files || [],
        })),
      };
    } catch {
      return;
    }
  }

  conversationId += 1;
  activeChatId = chat.id;
  conversationMessages = Array.isArray(chat.messages) ? chat.messages : [];
  resetInputHeight();
  attachedFiles = [];
  renderAttachments();
  sendBtn.disabled = false;
  renderCurrentConversation();
}

//$ Delete Chat 
async function deleteSavedChat(chatId) {
  try {
    const remainingChats = readSavedChats().filter((chat) => chat.id !== chatId);
    localStorage.setItem(SAVED_CHATS_KEY, JSON.stringify(remainingChats));
  } catch {
    // The server copy can still be removed if browser storage is unavailable.
  }
  try {
    await deleteSavedChatFromServer(chatId);
  } catch {
    // The chat may only exist in local storage, or the backend may be offline.
  }
  await showSavedChats();
}


// Send 
async function cbSend() {
  const txt = inputMsg.value.trim();

  const filesToSend = [...attachedFiles];

  if (
    (!txt && filesToSend.length === 0) ||
    sendBtn.disabled
  ) {
    return;
  }

  if (
    !savedChatView.hidden ||
    !topicsView.hidden ||
    !notesView.hidden
  ) {
    renderCurrentConversation();
  }

  const sentConversationId =
    conversationId;

  const history =
    conversationMessages.map(
      ({ role, text, quiz }) => ({
        role:
          role === "bot"
            ? "assistant"
            : "user",
        content:
          text ||
          (quiz
            ? `Interactive quiz: ${quiz.title || "Quiz"}`
            : ""),
      }),
    );

  cbAppend(
    "user",
    txt,
    filesToSend,
  );

  const firstUserMessage =
    conversationMessages.find(
      (message) =>
        message.role === "user",
    );

  const chatTitle =
    firstUserMessage?.text ||
    firstUserMessage?.files?.[0]?.name ||
    "New chat";

  resetInputHeight();

  attachedFiles = [];
  renderAttachments();

  sendBtn.disabled = true;

  showType();

  try {
    const classLevel =
      document.getElementById(
        "class-select",
      ).value;

    const reply = await sendMessage(
      txt,
      classLevel,
      history,
      () => {},
      filesToSend,
      activeChatId,
      chatTitle,
    );

    if (
      sentConversationId !==
      conversationId
    ) {
      return;
    }

    hideType();


    // ======================================
    // 🧠 INTERACTIVE QUIZ RESPONSE
    // ======================================

    const quizReply =
      reply && typeof reply === "object" &&
      (reply.type === "quiz" || reply.quiz)
        ? normalizeQuizData(reply)
        : typeof reply === "string"
          ? extractQuizFromText(reply)
          : null;

    if (quizReply) {
      // A short, polite intro line above every quiz 🎯
      cbAppend("bot", getQuizIntroMessage(reply, quizReply));
      conversationMessages.push({
        role: "bot",
        text: "",
        files: [],
        quiz: quizReply.quiz,
      });
      persistConversation();
      renderQuizMessage(quizReply);
    }

    // ======================================
    // 💬 NORMAL CHAT RESPONSE
    // ======================================

    else if (
      typeof reply === "string"
    ) {
      // A quiz reply that could not be parsed must never be shown
      // as raw JSON text in the chat.
      if (isRawQuizJson(reply)) {
        console.warn("Unparseable quiz reply:", reply);
        cbAppend("bot", QUIZ_FAILED_TEXT);
      } else {
        cbAppend("bot", reply);
      }
    }

    // ======================================
    // 🛡️ FALLBACK
    // ======================================

    else {
      cbAppend(
        "bot",
        "Hmm 🤔 I received an unexpected response from the study server. Could you please try again? 🙏",
      );
    }

  } catch (error) {
    console.error(
      "Chat request failed:",
      error,
    );

    if (
      sentConversationId !==
      conversationId
    ) {
      return;
    }

    hideType();

    const detail =
      error && error.message
        ? error.message
        : "Please check that the Python API is running and try again.";

    cbAppend(
      "bot",
      `Oops 😅 I couldn't reach the study server. ${detail}`,
    );

  } finally {
    if (
      sentConversationId ===
      conversationId
    ) {
      sendBtn.disabled = false;
      inputMsg.focus();
    }
  }
}

inputMsg.addEventListener("input", autoResizeInput);

inputMsg.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    cbSend();
  }
});


//* Attachment 
attachBtn.addEventListener("click", () => attachmentInput.click());

attachmentInput.addEventListener("change", () => {
  const selectedFiles = Array.from(attachmentInput.files);
  attachedFiles = [
    ...attachedFiles,
    ...selectedFiles.filter(
      (file) =>
        !attachedFiles.some(
          (attached) =>
            attached.name === file.name &&
            attached.size === file.size &&
            attached.lastModified === file.lastModified,
        ),
    ),
  ];
  attachmentInput.value = "";
  renderAttachments();
});

function renderAttachments() {
  attachmentList.replaceChildren();
  attachmentList.hidden = attachedFiles.length === 0;

  attachedFiles.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const filename = document.createElement("span");
    filename.textContent = file.name;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "attachment-remove";
    removeButton.setAttribute("aria-label", `Remove ${file.name}`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      attachedFiles.splice(index, 1);
      renderAttachments();
    });

    chip.append(filename, removeButton);
    attachmentList.append(chip);
  });
}


// ==========================================
// 📚 NCERT Study Topics Data & Browser
// ==========================================

const NCERT_TOPICS = {
  12: [
    { subject: "Maths", title: "Integrals & Calculus", desc: "Definite & indefinite integrals, substitution, by parts, partial fractions.", prompt: "Explain the fundamental methods of integration in Class 12 Maths with step-by-step examples." },
    { subject: "Maths", title: "Matrices & Determinants", desc: "Matrix multiplication, inverse, Cramer's rule, properties of determinants.", prompt: "Explain how to find the inverse of a 3x3 matrix using adjoint and row operations." },
    { subject: "Maths", title: "Differential Equations", desc: "Order, degree, variable separable, homogeneous, linear differential equations.", prompt: "Teach me how to solve linear differential equations with integrating factor (IF)." },
    { subject: "Maths", title: "Vectors & 3D Geometry", desc: "Dot & cross products, direction cosines, shortest distance between lines.", prompt: "Explain how to find the shortest distance between two skew lines in 3D geometry." },
    { subject: "Physics", title: "Electrostatics & Capacitance", desc: "Coulomb's law, electric field, Gauss's law, potential, capacitors.", prompt: "Explain Gauss's law and its applications to find electric field for an infinite sheet and wire." },
    { subject: "Physics", title: "Current Electricity", desc: "Ohm's law, drift velocity, Kirchhoff's rules, Wheatstone bridge, potentiometer.", prompt: "Explain Kirchhoff's junction and loop rules with a circuit diagram example." },
    { subject: "Physics", title: "Optics (Ray & Wave)", desc: "Lens maker's formula, prism formula, Huygens principle, Young's double slit.", prompt: "Derive the Lens Maker's Formula and explain Young's Double Slit Experiment (YDSE)." },
    { subject: "Physics", title: "Semiconductors & Devices", desc: "p-n junction diodes, forward/reverse bias, rectifiers, solar cells, LEDs.", prompt: "Explain the working of a full wave rectifier with circuit diagram and input/output waveforms." },
    { subject: "Chemistry", title: "Solutions & Colligative Properties", desc: "Raoult's law, elevation in boiling point, depression in freezing point, van 't Hoff factor.", prompt: "Explain the 4 colligative properties and van 't Hoff factor with formulas and numerical tips." },
    { subject: "Chemistry", title: "Electrochemistry", desc: "Nernst equation, Gibbs free energy, Kohlrausch's law, fuel cells, batteries.", prompt: "Explain how to apply the Nernst equation to calculate EMF of a galvanic cell." },
    { subject: "Chemistry", title: "Chemical Kinetics", desc: "Rate law, order vs molecularity, integrated rate equations, Arrhenius equation.", prompt: "Derive integrated rate equations for zero order and first order reactions with half-life." },
    { subject: "Chemistry", title: "Coordination Compounds", desc: "Werner's theory, IUPAC naming, Valence Bond Theory (VBT), Crystal Field Theory (CFT).", prompt: "Explain Crystal Field Splitting in octahedral and tetrahedral coordination complexes." },
    { subject: "Biology", title: "Genetics & Inheritance", desc: "Mendel's laws, chromosomal theory, sex determination, genetic disorders.", prompt: "Explain Mendel's laws of inheritance and chromosomal theory with examples." },
    { subject: "Biology", title: "Molecular Basis of Inheritance", desc: "DNA replication, transcription, genetic code, translation, lac operon.", prompt: "Explain the transcription process and the mechanism of the Lac Operon." }
  ],
  11: [
    { subject: "Maths", title: "Trigonometric Functions", desc: "Compound angles, multiple & sub-multiple angles, general solutions.", prompt: "Explain all important trigonometric compound angle formulas and identities for Class 11." },
    { subject: "Maths", title: "Limits & Derivatives", desc: "First principle of derivative, standard limits, product & quotient rules.", prompt: "Explain how to find derivatives using first principles with step-by-step examples." },
    { subject: "Physics", title: "Laws of Motion", desc: "Newton's laws, momentum, friction, banking of roads, pulley problems.", prompt: "Explain Newton's second and third laws of motion with free body diagrams (FBD)." },
    { subject: "Physics", title: "Work, Energy & Power", desc: "Work-energy theorem, conservation of mechanical energy, elastic collisions.", prompt: "State and prove the Work-Energy Theorem for variable forces." },
    { subject: "Physics", title: "Thermodynamics", desc: "Zeroth, First & Second laws, isothermal & adiabatic processes, heat engines.", prompt: "Explain isothermal and adiabatic processes, their PV diagrams, and work done formulas." },
    { subject: "Chemistry", title: "Structure of Atom", desc: "Bohr's model, de Broglie relation, Heisenberg uncertainty, quantum numbers.", prompt: "Explain the four quantum numbers and electronic configuration principles (Aufbau, Pauli, Hund)." },
    { subject: "Chemistry", title: "Chemical Bonding", desc: "VSEPR theory, hybridization, molecular orbital theory (MOT), hydrogen bonding.", prompt: "Explain hybridization (sp, sp2, sp3) and predict shapes of molecules using VSEPR theory." }
  ],
  10: [
    { subject: "Science", title: "Chemical Reactions & Equations", desc: "Balancing equations, types of reactions, oxidation-reduction, corrosion.", prompt: "Explain the 5 main types of chemical reactions with balanced NCERT equations." },
    { subject: "Science", title: "Acids, Bases & Salts", desc: "pH scale, indicators, neutralization, bleaching powder, baking soda, POP.", prompt: "Explain pH in everyday life and the preparation of important salts (Bleaching powder, Plaster of Paris)." },
    { subject: "Science", title: "Life Processes", desc: "Nutrition, respiration in humans & plants, circulation, human heart, excretion.", prompt: "Explain the human circulatory system with double circulation and the functioning of the nephron." },
    { subject: "Science", title: "Light: Reflection & Refraction", desc: "Mirror formula, magnification, Snell's law, refractive index, lens power.", prompt: "Explain sign conventions for spherical mirrors and lenses, and solve a numerical using mirror formula." },
    { subject: "Science", title: "Electricity & Circuits", desc: "Ohm's law, resistance, series & parallel combinations, Joule's heating effect.", prompt: "State Ohm's law, derive equivalent resistance for series and parallel circuits, and explain Joule's law." },
    { subject: "Maths", title: "Quadratic Equations", desc: "Factorization, quadratic formula, nature of roots, discriminant.", prompt: "Explain how to find roots of a quadratic equation using the quadratic formula with examples." },
    { subject: "Maths", title: "Trigonometry Basics", desc: "Trigonometric ratios, values of 0°, 30°, 45°, 60°, 90°, standard identities.", prompt: "Teach me how to remember trigonometric values table and prove standard trigonometric identities." }
  ],
  9: [
    { subject: "Science", title: "Motion & Kinematics", desc: "Distance vs displacement, speed, velocity, acceleration, equations of motion.", prompt: "Derive the three equations of motion graphically: v=u+at, s=ut+1/2at^2, v^2=u^2+2as." },
    { subject: "Science", title: "Force and Laws of Motion", desc: "Inertia, momentum, Newton's three laws, conservation of momentum.", prompt: "Explain Newton's three laws of motion with daily life examples and law of conservation of momentum." },
    { subject: "Science", title: "Gravitation", desc: "Universal law of gravitation, free fall, acceleration due to gravity (g), mass vs weight.", prompt: "Explain Newton's Universal Law of Gravitation and the difference between mass and weight." },
    { subject: "Science", title: "Structure of the Atom", desc: "Thomson model, Rutherford alpha scattering, Bohr model, valency, isotopes.", prompt: "Explain Rutherford's alpha scattering experiment and Bohr's model of the atom." },
    { subject: "Maths", title: "Number Systems", desc: "Rational & irrational numbers, real numbers, laws of exponents, rationalization.", prompt: "Explain how to rationalize denominators and represent irrational numbers on number line." },
    { subject: "Maths", title: "Polynomials", desc: "Zeros of polynomial, remainder theorem, factor theorem, algebraic identities.", prompt: "Explain Factor Theorem and Remainder Theorem with solved polynomial examples." }
  ]
};

function showStudyTopics() {
  conversationId += 1;
  sendBtn.disabled = false;
  hideType();
  navbar.classList.remove("open");
  hamburger.classList.remove("open");

  msgs.hidden = true;
  savedChatView.hidden = true;
  notesView.hidden = true;
  topicsView.hidden = false;

  const currentClass = parseInt(document.getElementById("class-select").value, 10) || 12;
  renderTopicsContent(currentClass);
}

function renderTopicsContent(selectedClass, activeSubject = "All", searchQuery = "") {
  const searchHadFocus =
    document.activeElement instanceof HTMLElement &&
    document.activeElement.classList.contains("panel-search-input") &&
    topicsView.contains(document.activeElement);

  topicsView.replaceChildren();

  // Header
  const header = document.createElement("div");
  header.className = "panel-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "panel-title-wrap";

  const title = document.createElement("h2");
  title.textContent = "NCERT Study Topics";

  const badge = document.createElement("span");
  badge.className = "panel-badge";
  badge.textContent = `Class ${selectedClass}`;

  titleWrap.append(title, badge);

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "panel-back-btn";
  backBtn.textContent = "Back to chat";
  backBtn.addEventListener("click", renderCurrentConversation);

  header.append(titleWrap, backBtn);

  // Controls: Search & Subject Filters
  const controls = document.createElement("div");
  controls.className = "panel-controls";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "panel-search-input";
  searchInput.placeholder = `Search Class ${selectedClass} topics or concepts...`;
  searchInput.value = searchQuery;
  searchInput.addEventListener("input", (e) => {
    renderTopicsContent(selectedClass, activeSubject, e.target.value.trim());
  });

  const filters = document.createElement("div");
  filters.className = "panel-filters";

  const classTopics = NCERT_TOPICS[selectedClass] || [];
  const subjects = ["All", ...new Set(classTopics.map((t) => t.subject))];

  subjects.forEach((subj) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `panel-filter-btn ${activeSubject === subj ? "active" : ""}`;
    btn.textContent = subj;
    btn.addEventListener("click", () => {
      renderTopicsContent(selectedClass, subj, searchQuery);
    });
    filters.append(btn);
  });

  controls.append(searchInput, filters);

  // Grid
  const grid = document.createElement("div");
  grid.className = "panel-grid";

  const filtered = classTopics.filter((item) => {
    const matchesSubject = activeSubject === "All" || item.subject === activeSubject;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      item.title.toLowerCase().includes(query) ||
      item.desc.toLowerCase().includes(query) ||
      item.subject.toLowerCase().includes(query);
    return matchesSubject && matchesSearch;
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "No topics found matching your search. Try another keyword!";
    grid.append(empty);
  } else {
    filtered.forEach((topic) => {
      const card = document.createElement("div");
      card.className = "panel-card";

      const top = document.createElement("div");
      top.className = "panel-card-top";

      const subjTag = document.createElement("span");
      subjTag.className = "panel-card-subject";
      subjTag.textContent = topic.subject;

      top.append(subjTag);

      const cardTitle = document.createElement("h3");
      cardTitle.className = "panel-card-title";
      cardTitle.textContent = topic.title;

      const desc = document.createElement("p");
      desc.className = "panel-card-desc";
      desc.textContent = topic.desc;

      const actions = document.createElement("div");
      actions.className = "panel-card-actions";

      const teachBtn = document.createElement("button");
      teachBtn.type = "button";
      teachBtn.className = "panel-action-btn";
      teachBtn.innerHTML = `<span>💡 Teach Core Concepts & Formulas</span>`;
      teachBtn.addEventListener("click", () => {
        askBotTopicPrompt(topic.prompt);
      });

      const qBtn = document.createElement("button");
      qBtn.type = "button";
      qBtn.className = "panel-action-btn secondary";
      qBtn.innerHTML = `<span>❓ 3 Key Board Exam Questions</span>`;
      qBtn.addEventListener("click", () => {
        askBotTopicPrompt(`Give me 3 important NCERT Board Exam questions from "${topic.title}" with step-by-step solutions.`);
      });

      actions.append(teachBtn, qBtn);
      card.append(top, cardTitle, desc, actions);
      grid.append(card);
    });
  }

  topicsView.append(header, controls, grid);

  if (searchHadFocus) {
    const input = topicsView.querySelector(".panel-search-input");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}


// ==========================================
// 📖 NCERT Notes & Formula Reference Data
// ==========================================

const NCERT_NOTES = [
  {
    id: "maths-12-calculus",
    classLevel: 12,
    subject: "Maths",
    title: "Calculus & Integration Master Formula Sheet",
    badge: "Formulas",
    preview: [
      "$$\\int x^n dx = \\frac{x^{n+1}}{n+1} + C \\quad (n \\neq -1)$$",
      "$$\\int \\frac{1}{x} dx = \\ln|x| + C, \\quad \\int e^{ax} dx = \\frac{e^{ax}}{a} + C$$",
      "$$\\int \\sin x dx = -\\cos x + C, \\quad \\int \\cos x dx = \\sin x + C$$",
      "$$\\int \\sec^2 x dx = \\tan x + C, \\quad \\int \\csc^2 x dx = -\\cot x + C$$",
      "$$\\int \\frac{1}{a^2 + x^2} dx = \\frac{1}{a} \\tan^{-1}\\left(\\frac{x}{a}\\right) + C$$",
      "Integration by Parts: $$\\int u v dx = u \\int v dx - \\int \\left( u' \\int v dx \\right) dx$$"
    ],
    prompt: "Give me a complete revision of Class 12 Integration formulas with key substitution techniques."
  },
  {
    id: "physics-12-formulas",
    classLevel: 12,
    subject: "Physics",
    title: "Electromagnetism & Optics Quick Reference",
    badge: "Cheat Sheet",
    preview: [
      "Coulomb's Law: $$F = \\frac{1}{4\\pi\\varepsilon_0} \\frac{q_1 q_2}{r^2}$$",
      "Gauss's Law: $$\\Phi_E = \\oint \\vec{E} \\cdot d\\vec{A} = \\frac{q_{\\text{enc}}}{\\varepsilon_0}$$",
      "Capacitance of Parallel Plate: $$C = \\frac{\\varepsilon_0 A}{d}$$",
      "Ohm's Law & Drift: $$I = n e A v_d, \\quad v_d = \\frac{e E \\tau}{m}$$",
      "Lens Maker's Formula: $$\\frac{1}{f} = (\\mu - 1)\\left(\\frac{1}{R_1} - \\frac{1}{R_2}\\right)$$"
    ],
    prompt: "Explain the most important formulas of Class 12 Physics Electromagnetism and how to solve numericals with them."
  },
  {
    id: "chem-12-reactions",
    classLevel: 12,
    subject: "Chemistry",
    title: "High-Yield Named Organic Reactions",
    badge: "Reactions",
    preview: [
      "**1. Aldol Condensation:** Aldehydes/ketones with $\\alpha$-H in dil. $\\text{NaOH}$ form $\\beta$-hydroxy aldehydes.",
      "**2. Cannizzaro Reaction:** Aldehydes without $\\alpha$-H in conc. $\\text{KOH}$ disproportionate into alcohol + salt.",
      "**3. Reimer-Tiemann Reaction:** Phenol + $\\text{CHCl}_3$ + $\\text{NaOH} \\rightarrow$ Salicylaldehyde.",
      "**4. Kolbe's Reaction:** Phenol + $\\text{NaOH}$ + $\\text{CO}_2$ + $H^+ \\rightarrow$ Salicylic acid.",
      "**5. Williamson Synthesis:** $\\text{R-X} + \\text{R'-O}^- \\text{Na}^+ \\rightarrow \\text{R-O-R'} + \\text{NaX}$."
    ],
    prompt: "Explain all important Named Reactions in Class 12 Organic Chemistry with mechanisms and reagents."
  },
  {
    id: "chem-12-physical",
    classLevel: 12,
    subject: "Chemistry",
    title: "Physical Chemistry: Solutions & Electrochemistry Equations",
    badge: "Formulas",
    preview: [
      "Raoult's Law: $$P_{\\text{total}} = P_A^0 x_A + P_B^0 x_B$$",
      "Colligative Elevation: $$\\Delta T_b = i \\cdot K_b \\cdot m, \\quad \\Delta T_f = i \\cdot K_f \\cdot m$$",
      "Osmotic Pressure: $$\\Pi = i C R T$$",
      "Nernst Equation: $$E_{\\text{cell}} = E^0_{\\text{cell}} - \\frac{0.0591}{n} \\log Q \\quad (\\text{at } 298\\text{ K})$$",
      "First Order Kinetics: $$k = \\frac{2.303}{t} \\log\\left(\\frac{[A]_0}{[A]}\\right), \\quad t_{1/2} = \\frac{0.693}{k}$$"
    ],
    prompt: "Review all formulas in Class 12 Physical Chemistry with unit conversions and common calculation traps."
  },
  {
    id: "science-10-core",
    classLevel: 10,
    subject: "Science",
    title: "Class 10 Science: Physics & Chemistry Quick Formula Card",
    badge: "Class 10",
    preview: [
      "Mirror Formula: $$\\frac{1}{v} + \\frac{1}{u} = \\frac{1}{f}, \\quad m = -\\frac{v}{u}$$",
      "Lens Formula: $$\\frac{1}{v} - \\frac{1}{u} = \\frac{1}{f}, \\quad P = \\frac{1}{f(\\text{in m})}$$",
      "Ohm's Law: $$V = I R, \\quad R_s = \\sum R_i, \\quad \\frac{1}{R_p} = \\sum \\frac{1}{R_i}$$",
      "Joule's Heating & Power: $$H = I^2 R t, \\quad P = V I = \\frac{V^2}{R}$$"
    ],
    prompt: "Explain all Class 10 Physics electricity and light formulas with step-by-step example numericals."
  },
  {
    id: "science-9-motion",
    classLevel: 9,
    subject: "Science",
    title: "Class 9 Science: Laws of Motion & Gravitation Notes",
    badge: "Class 9",
    preview: [
      "Equations of Motion: $$v = u + at, \\quad s = ut + \\frac{1}{2}at^2, \\quad v^2 = u^2 + 2as$$",
      "Momentum & Force: $$p = m v, \\quad F = m a = \\frac{\\Delta p}{\\Delta t}$$",
      "Universal Gravitation: $$F = G \\frac{M m}{R^2}, \\quad g = \\frac{G M}{R^2} \\approx 9.8\\text{ m/s}^2$$",
      "Work & Energy: $$W = F s, \\quad E_k = \\frac{1}{2} m v^2, \\quad E_p = m g h$$"
    ],
    prompt: "Explain Class 9 equations of motion and Newton's laws with derivations and daily life examples."
  }
];

function showNcertNotes() {
  conversationId += 1;
  sendBtn.disabled = false;
  hideType();
  navbar.classList.remove("open");
  hamburger.classList.remove("open");

  msgs.hidden = true;
  savedChatView.hidden = true;
  topicsView.hidden = true;
  notesView.hidden = false;

  const currentClass = parseInt(document.getElementById("class-select").value, 10) || 12;
  renderNotesContent(currentClass);
}

function renderNotesContent(selectedClass, searchQuery = "") {
  const searchHadFocus =
    document.activeElement instanceof HTMLElement &&
    document.activeElement.classList.contains("panel-search-input") &&
    notesView.contains(document.activeElement);

  notesView.replaceChildren();

  // Header
  const header = document.createElement("div");
  header.className = "panel-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "panel-title-wrap";

  const title = document.createElement("h2");
  title.textContent = "NCERT Formula & Notes Reference";

  const badge = document.createElement("span");
  badge.className = "panel-badge";
  badge.textContent = `Class ${selectedClass}`;

  titleWrap.append(title, badge);

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "panel-back-btn";
  backBtn.textContent = "Back to chat";
  backBtn.addEventListener("click", renderCurrentConversation);

  header.append(titleWrap, backBtn);

  // Search input
  const controls = document.createElement("div");
  controls.className = "panel-controls";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "panel-search-input";
  searchInput.placeholder = "Search formulas, laws, or notes...";
  searchInput.value = searchQuery;
  searchInput.addEventListener("input", (e) => {
    renderNotesContent(selectedClass, e.target.value.trim());
  });

  controls.append(searchInput);

  // Grid
  const grid = document.createElement("div");
  grid.className = "panel-grid";

  const relevantNotes = NCERT_NOTES.filter((n) => {
    const query = searchQuery.toLowerCase();
    const classMatch = n.classLevel === selectedClass || (selectedClass > 10 && n.classLevel >= 11) || (selectedClass <= 10 && n.classLevel <= 10);
    const textMatch = !query || n.title.toLowerCase().includes(query) || n.subject.toLowerCase().includes(query);
    return classMatch && textMatch;
  });

  if (relevantNotes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "No formula notes found matching this search. Try a broader search keyword!";
    grid.append(empty);
  } else {
    relevantNotes.forEach((note) => {
      const card = document.createElement("div");
      card.className = "panel-card";

      const top = document.createElement("div");
      top.className = "panel-card-top";

      const subjTag = document.createElement("span");
      subjTag.className = "panel-card-subject";
      subjTag.textContent = `${note.subject} · ${note.badge}`;

      top.append(subjTag);

      const cardTitle = document.createElement("h3");
      cardTitle.className = "panel-card-title";
      cardTitle.textContent = note.title;

      const previewBox = document.createElement("div");
      previewBox.className = "panel-preview-box";
      previewBox.innerHTML = note.preview.join("<br>");

      // Render KaTeX in preview box
      if (typeof renderMathInElement === "function") {
        renderMathInElement(previewBox, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      }

      const actions = document.createElement("div");
      actions.className = "panel-card-actions";

      const askBtn = document.createElement("button");
      askBtn.type = "button";
      askBtn.className = "panel-action-btn";
      askBtn.innerHTML = `<span>🤖 Ask Study Bot to Explain This Note</span>`;
      askBtn.addEventListener("click", () => {
        askBotTopicPrompt(note.prompt);
      });

      actions.append(askBtn);
      card.append(top, cardTitle, previewBox, actions);
      grid.append(card);
    });
  }

  notesView.append(header, controls, grid);

  if (searchHadFocus) {
    const input = notesView.querySelector(".panel-search-input");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}

function askBotTopicPrompt(promptText) {
  renderCurrentConversation();
  inputMsg.value = promptText;
  autoResizeInput();
  cbSend();
}


// ==========================================
// 🌙 Theme Switcher (Dark / Light)
// ==========================================

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeToggle) {
      themeToggle.textContent = "☀️";
      themeToggle.title = "Switch to light mode";
    }
  } else {
    document.body.classList.remove("dark-theme");
    if (themeToggle) {
      themeToggle.textContent = "🌙";
      themeToggle.title = "Switch to dark mode";
    }
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Local storage unavailable
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-theme");
    applyTheme(isDark ? "light" : "dark");
  });
}

// Initial theme setup (defaults to dark for modern neon aesthetic)
const initialTheme = localStorage.getItem(THEME_KEY) || "dark";
applyTheme(initialTheme);


// ==========================================
// 🔗 Navigation & Selection Event Listeners
// ==========================================

if (studyTopics) {
  studyTopics.addEventListener("click", showStudyTopics);
}

if (ncertTopics) {
  ncertTopics.addEventListener("click", showNcertNotes);
}

const classSelect = document.getElementById("class-select");
if (classSelect) {
  classSelect.addEventListener("change", () => {
    if (!topicsView.hidden) showStudyTopics();
    if (!notesView.hidden) showNcertNotes();
  });
}