// backend address
const BASE_URL = "http://127.0.0.1:8000";

// check server
async function pingServer() {
  try {
    const res = await fetch(BASE_URL + "/");
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function readSseChatResponse(res, onChunk) {
  if (!res.body) {
    throw new Error("The study server returned an empty stream.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let completed = false;

  function handleEvent(block) {
    let eventName = "message";
    const dataLines = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join("\n"));

    if (eventName === "token") {
      if (typeof payload.text !== "string") {
        throw new Error("The study server sent an invalid text chunk.");
      }
      reply += payload.text;
      onChunk(payload.text);
    } else if (eventName === "error") {
      throw new Error(payload.detail || "The AI request failed.");
    } else if (eventName === "done") {
      completed = true;
    }
  }

  function processBufferedEvents(final = false) {
    buffer = buffer.replace(/\r\n/g, "\n");

    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      if (block) handleEvent(block);
      separator = buffer.indexOf("\n\n");
    }

    if (final && buffer.trim()) {
      handleEvent(buffer);
      buffer = "";
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      processBufferedEvents(done);
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  if (!completed) {
    throw new Error("The study server ended the reply stream unexpectedly.");
  }

  return reply;
}

// send chat message
async function sendMessage(
  message,
  classLevel,
  history,
  onChunk = () => {},
  files = [],
  chatId = null,
  chatTitle = null,
) {
  const attachments = await Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";

      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 0x8000),
        );
      }

      return {
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        content_base64: btoa(binary),
      };
    }),
  );

  let res;

  try {
    res = await fetch(BASE_URL + "/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        class_level: classLevel,
        chat_id: chatId,
        chat_title: chatTitle,
        history,
        attachments,
      }),
    });
  } catch (networkErr) {
    // fetch() only rejects for network-level failures:
    // server not running, DNS/refused, CORS/PNA block, mixed content.
    const mixedContent =
      window.location.protocol === "https:" &&
      BASE_URL.startsWith("http://");

    const err = new Error(
      mixedContent
        ? `This page is served over HTTPS, so the browser blocked the call to the local HTTP API at ${BASE_URL} (mixed content). Open the frontend over http:// (localhost) or serve the API over HTTPS.`
        : `Could not connect to the study API. `,
    );
    err.kind = "network";
    throw err;
  }

  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    return readSseChatResponse(res, onChunk);
  }

  if (!res.ok) {
    let detail = "";

    try {
      const errBody = await res.json();
      if (errBody && errBody.detail) {
        detail = String(errBody.detail);
      }
    } catch (parseErr) {
      // ignore body parse failures
    }

    const err = new Error(
      `The study server returned HTTP ${res.status}` +
        (detail ? `: ${detail}` : ".") +
        (res.status === 429
          ? " (rate limited — try again in a few seconds.)"
          : ""),
    );
    err.kind = "http";
    err.status = res.status;
    throw err;
  }

 const data = await res.json();

if (data.type === "quiz" && data.quiz) {
  onChunk(data);
  return data;
}

if (typeof data.reply === "string") {
  const trimmed = data.reply.trim();

  // AI ne JSON string ke form mein quiz bheja ho
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed && parsed.type === "quiz" && parsed.quiz) {
        onChunk(parsed);
        return parsed;
      }
    } catch (err) {
      console.warn("Response is not valid quiz JSON:", err);
    }
  }

  onChunk(data.reply);
  return data.reply;
}

throw new Error("Invalid chat response");
}

// list chats saved on the server
async function getSavedChats() {
  const res = await fetch(BASE_URL + "/api/chats");
  if (!res.ok) throw new Error("Could not load saved chats");
  return res.json();
}

async function getSavedChat(chatId) {
  const res = await fetch(
    BASE_URL + "/api/chats/" + encodeURIComponent(chatId),
  );
  if (!res.ok) throw new Error("Could not load saved chat");
  return res.json();
}

async function deleteSavedChatFromServer(chatId) {
  const res = await fetch(
    BASE_URL + "/api/chats/" + encodeURIComponent(chatId),
    {
      method: "DELETE",
    },
  );
  if (!res.ok) throw new Error("Could not delete saved chat");
}
