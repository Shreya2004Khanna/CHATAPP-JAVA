const messagesEl = document.getElementById("messages");
const sendBtn = document.getElementById("sendButton");
const input = document.getElementById("messageInput");
const chatList = document.getElementById("chatList");
const dragHandle = document.getElementById("dragHandle");
const sidebar = document.getElementById("sidebar");
const usernameDisplay = document.getElementById("usernameDisplay");
const mobileUsernameDisplay = document.getElementById("mobileUsernameDisplay");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");

if (
  !messagesEl ||
  !sendBtn ||
  !input ||
  !chatList ||
  !dragHandle ||
  !sidebar ||
  !usernameDisplay ||
  !mobileUsernameDisplay
) {
  console.warn("Some UI elements are missing. Script will run partially.");
}

// Load temporary session data only
const username = sessionStorage.getItem("username");
const roomCode = sessionStorage.getItem("roomCode");
if (!username || !roomCode) {
  window.location.href = "login.html";
} else {
  if (usernameDisplay) usernameDisplay.textContent = username;
  if (mobileUsernameDisplay) mobileUsernameDisplay.textContent = username;
  if (roomCodeDisplay) roomCodeDisplay.textContent = "Room: " + roomCode;
}

// Keep the user list empty until the server provides real online users.
if (chatList) chatList.innerHTML = "";

// currently selected recipient (GROUP CHAT by default)
window.__selectedRecipient = "GROUP CHAT";

// Temporary session-only chat memory: no message persistence across reloads or closes.
window.__chatHistory = {};
window.addEventListener("beforeunload", () => {
  window.__chatHistory = {};
});

// Initialize with GROUP CHAT
if (!window.__chatHistory["GROUP CHAT"]) {
  window.__chatHistory["GROUP CHAT"] = [];
}

// Show GROUP CHAT immediately on page load
updateChatList(["GROUP CHAT"]);

// WebSocket connection to bridge server
let ws;
try {
  ws = new WebSocket("ws://localhost:8080");
} catch (e) {
  console.error("WebSocket connection failed:", e);
  appendMessage("Failed to connect to server.", "system");
}

if (ws) {
  ws.onopen = function (event) {
    console.log("Connected to server");
    ws.send("JOIN|" + roomCode + "|" + username);
    ws.send("/users");
  };

  ws.onmessage = function (event) {
    const message = event.data;
    console.log("[WS] Received:", message);
    if (message.startsWith("SYSTEM|")) {
      const text = message.substring("SYSTEM|".length);
      if (
        text.toLowerCase().includes("please send") ||
        text.toLowerCase().includes("invalid join") ||
        text.toLowerCase().includes("disconnected from server")
      ) {
        return;
      }
      appendMessage(text, "system");
      storeMessage("GROUP CHAT", text, "system");
      // If the server rejected our username, return to login
      if (
        text.toLowerCase().includes("username already taken") ||
        text.toLowerCase().includes("invalid username") ||
        text.toLowerCase().includes("connection closing")
      ) {
        alert(text);
        sessionStorage.removeItem("username");
        sessionStorage.removeItem("roomCode");
        window.location.href = "login.html";
      }
    } else if (message.startsWith("USERS|")) {
      const usersStr = message.substring("USERS|".length).trim();
      console.log("[WS] Raw users string:", usersStr);
      let users = usersStr
        ? usersStr
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u)
        : [];
      console.log("[WS] Parsed users:", users);
      // Always include current user
      if (!users.includes(username)) users.push(username);
      updateChatList(users);
    } else if (message.startsWith("PUBLIC|")) {
      const parts = message.split("|", 3);
      if (parts.length === 3) {
        const from = parts[1];
        const msg = parts[2];
        const displayText = `${from}: ${msg}`;
        storeMessage("GROUP CHAT", displayText, "other");
        if (window.__selectedRecipient === "GROUP CHAT") {
          appendMessage(displayText, "other");
        }
      }
    } else if (message.startsWith("PRIVATE|")) {
      const parts = message.split("|", 4);
      if (parts.length === 4) {
        const from = parts[1];
        const to = parts[2];
        const msg = parts[3];
        if (to === username) {
          const displayText = `[Private from ${from}] ${msg}`;
          storeMessage(from, displayText, "private");
          if (window.__selectedRecipient === from) {
            appendMessage(displayText, "private");
          }
        } else if (from === username) {
          const displayText = `[Private to ${to}] ${msg}`;
          storeMessage(to, displayText, "you");
          if (window.__selectedRecipient === to) {
            appendMessage(displayText, "you");
          }
        }
      }
    }
  };

  ws.onclose = function (event) {
    console.log("Disconnected from server");
    // Intentionally silent: the app should only show natural room activity.
  };

  ws.onerror = function (error) {
    console.error("WebSocket error:", error);
    appendMessage("Connection error.", "system");
  };
}

function storeMessage(recipient, text, type) {
  if (!window.__chatHistory[recipient]) {
    window.__chatHistory[recipient] = [];
  }
  window.__chatHistory[recipient].push({ text, type });
}

function appendMessage(text, type = "you") {
  const d = document.createElement("div");
  d.className =
    "msg " + (type === "you" ? "you" : type === "system" ? "system" : "other");
  d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function sendMessage() {
  const val = input.value.trim();
  if (!val) return;
  if (!(ws && ws.readyState === WebSocket.OPEN)) {
    appendMessage("Not connected to server.", "system");
    return;
  }

  // If a recipient is selected (not GROUP CHAT), send as private.
  // We do not append locally; the server echo is the single source of truth.
  const recipient = window.__selectedRecipient || "GROUP CHAT";
  if (recipient && recipient !== "GROUP CHAT" && recipient !== username) {
    ws.send("/pm " + recipient + " " + val);
    input.value = "";
    return;
  }

  // default: public message in the room
  ws.send(val);
  input.value = "";
}

window.addEventListener("beforeunload", () => {
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("roomCode");
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send("/exit");
  }
});

if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (input)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

function updateChatList(users) {
  if (!chatList) return;
  // normalize users array
  let list = Array.isArray(users) ? users.slice() : [];
  list = list.map((u) => u.trim()).filter((u) => u && u !== username);

  // always include GROUP CHAT as first entry
  list = ["GROUP CHAT"].concat(list);

  // Remove duplicates while preserving order
  list = [...new Set(list)];

  chatList.innerHTML = "";
  list.forEach((user) => {
    const item = document.createElement("div");
    item.className = "chat-item";
    item.dataset.name = user;
    item.textContent = user;
    // highlight the currently selected recipient
    if (user === window.__selectedRecipient) {
      item.classList.add("active");
    }
    // ensure GROUP CHAT has chat history initialized
    if (user && !window.__chatHistory[user]) {
      window.__chatHistory[user] = [];
    }
    chatList.appendChild(item);
  });

  // if nothing matched, select GROUP CHAT by default
  const active = chatList.querySelector(".chat-item.active");
  if (!active) {
    const groupChat = chatList.querySelector('[data-name="GROUP CHAT"]');
    if (groupChat) {
      groupChat.classList.add("active");
      window.__selectedRecipient = "GROUP CHAT";
    }
  }
}

if (chatList)
  chatList.addEventListener("click", (ev) => {
    const item = ev.target.closest(".chat-item");
    if (!item) return;

    document
      .querySelectorAll(".chat-item")
      .forEach((x) => x.classList.remove("active"));

    item.classList.add("active");
    const recipient = item.dataset.name || "GROUP CHAT";

    // Keep the visible username as the logged-in user, not the selected chat item.
    window.__selectedRecipient = recipient;

    // Load chat history for this recipient
    if (messagesEl) {
      messagesEl.innerHTML = "";
      const history = window.__chatHistory[recipient] || [];
      history.forEach((msg) => {
        const d = document.createElement("div");
        d.className = "msg " + msg.type;
        d.textContent = msg.text;
        messagesEl.appendChild(d);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Close sidebar on mobile after selecting a chat
    if (window.innerWidth <= 700 && sidebar) {
      sidebar.classList.remove("open");
      if (overlayEl) overlayEl.classList.remove("visible");
    }
  });

// Keep the mobile header showing the logged-in user at all times.
(() => {
  const mobileName = document.querySelector(".mobile-username");
  if (mobileName) mobileName.textContent = username || "";
})();

// Drag-to-resize (uses Pointer Events with sensible fallbacks)
let dragging = false;
const rootStyles = window.getComputedStyle(document.documentElement);
const minW = parseInt(rootStyles.getPropertyValue("--sidebar-min")) || 170;
const maxW = parseInt(rootStyles.getPropertyValue("--sidebar-max")) || 420;

function onPointerDown(e) {
  dragging = true;
  try {
    if (e.pointerId && dragHandle.setPointerCapture)
      dragHandle.setPointerCapture(e.pointerId);
  } catch (err) {}
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function onPointerUp(e) {
  dragging = false;
  try {
    if (e.pointerId && dragHandle.releasePointerCapture)
      dragHandle.releasePointerCapture(e.pointerId);
  } catch (err) {}
  document.body.style.cursor = "default";
  document.body.style.userSelect = "auto";
}

function onPointerMove(e) {
  if (!dragging) return;
  const clientX =
    typeof e.clientX === "number"
      ? e.clientX
      : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  let w = clientX;
  if (w < minW) w = minW;
  if (w > maxW) w = maxW;
  if (sidebar) sidebar.style.width = w + "px";
  document.documentElement.style.setProperty("--sidebar-width", w + "px");
}

if (dragHandle && window.PointerEvent) {
  dragHandle.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
} else {
  // fallback to mouse events
  if (dragHandle)
    dragHandle.addEventListener("mousedown", () => {
      dragging = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    let w = e.clientX;
    if (w < minW) w = minW;
    if (w > maxW) w = maxW;
    if (sidebar) sidebar.style.width = w + "px";
    document.documentElement.style.setProperty("--sidebar-width", w + "px");
  });
}

// Sidebar toggle for small screens
const toggleBtn = document.getElementById("toggleSidebar");
let overlayEl = null;
function createOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "sidebar-overlay";
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener("click", () => {
    if (sidebar) sidebar.classList.remove("open");
    overlayEl.classList.remove("visible");
  });
  return overlayEl;
}

if (toggleBtn && sidebar) {
  toggleBtn.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("open");
    const overlay = createOverlay();
    if (isOpen) overlay.classList.add("visible");
    else overlay.classList.remove("visible");
    // on mobile, move/clone left header into the sidebar when opening
    if (window.innerWidth <= 700) {
      if (isOpen) moveLeftHeaderIntoSidebar();
      else restoreLeftHeader();
    }
  });
}

// On resize, ensure sidebar is visible on larger viewports
window.addEventListener("resize", () => {
  if (window.innerWidth > 700 && sidebar) {
    sidebar.classList.remove("open");
    if (overlayEl) overlayEl.classList.remove("visible");
    // ensure any cloned header is restored when resizing to desktop
    restoreLeftHeader();
  }
});

// --- Move / restore left header for mobile menu ---
function moveLeftHeaderIntoSidebar() {
  const left = document.querySelector(".curve-left");
  const wave = document.querySelector(".top-wave");
  const sidebarTop = document.querySelector(".sidebar-top");
  if (!left || !sidebarTop) return;
  // avoid duplicating
  if (sidebarTop.querySelector(".mobile-clone")) return;

  // clone left block and wave
  const leftClone = left.cloneNode(true);
  // remove ids from clone to avoid duplicates
  leftClone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  leftClone.classList.add("mobile-clone");
  // remove menu button inside clone (we rely on overlay to close)
  const btn = leftClone.querySelector(".menu-btn");
  if (btn) btn.remove();

  // insert the clone after the brand and the mobile username (if present)
  const brandEl = sidebarTop.querySelector(".sidebar-brand");
  const mobileNameEl = sidebarTop.querySelector(".mobile-username");
  if (mobileNameEl) {
    sidebarTop.insertBefore(leftClone, mobileNameEl.nextSibling);
  } else if (brandEl) {
    sidebarTop.insertBefore(leftClone, brandEl.nextSibling);
  } else {
    sidebarTop.insertBefore(leftClone, sidebarTop.firstChild);
  }
  if (wave && !sidebarTop.querySelector(".mobile-wave")) {
    const waveClone = wave.cloneNode(true);
    waveClone.classList.add("mobile-wave");
    // remove id attributes
    waveClone
      .querySelectorAll("[id]")
      .forEach((el) => el.removeAttribute("id"));
    sidebarTop.insertBefore(waveClone, leftClone.nextSibling);
  }

  // hide only the original left header's logo (keep the menu button visible)
  const origLogo = left.querySelector(".logo-img");
  if (origLogo) origLogo.style.display = "none";
  if (wave) wave.style.display = "none";
}

function restoreLeftHeader() {
  const left = document.querySelector(".curve-left");
  const wave = document.querySelector(".top-wave");
  const sidebarTop = document.querySelector(".sidebar-top");
  if (!sidebarTop) return;
  const leftClone = sidebarTop.querySelector(".mobile-clone");
  const waveClone = sidebarTop.querySelector(".mobile-wave");
  if (leftClone) leftClone.remove();
  if (waveClone) waveClone.remove();

  // restore only the logo and wave visibility
  if (left) {
    const origLogo = left.querySelector(".logo-img");
    if (origLogo) origLogo.style.display = "";
  }
  if (wave) wave.style.display = "";
}
