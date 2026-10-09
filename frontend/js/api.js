// backend address
const BASE_URL = "https://study-notes-pro-ai.onrender.com";

// check server
async function pingServer() {
  try {
    const res = await fetch(BASE_URL + "/");
    return res.ok;
  } catch (err) {
    return false;
  }
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
        : `Could not connect to the study API at ${BASE_URL}. Make sure the Python server is running (uvicorn main:app) and reload the page with Ctrl+Shift+R.`,
    );
    err.kind = "network";
    throw err;
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
