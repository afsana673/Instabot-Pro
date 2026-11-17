const { drive, getPrefix } = global.utils;
const { nickNameBot } = global.GoatBot.config;
const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

/* ──────────────────────────────────────────────────────────────
 * CONFIG
 * ────────────────────────────────────────────────────────────── */
const BRAND = "Powered By Habib";
const SCALE = 2;                     // 2 = crisp 2400×1260 output. Use 1 for smaller files.
const W = 1200, H = 630;

// Prefer env/config. The fallback is the original token so nothing breaks on upgrade.
// Move it out of source control when you can.
const ACCESS_TOKEN =
  process.env.FB_GRAPH_TOKEN ||
  global.GoatBot.config.fbGraphToken ||
  "6628568379%7Cc1e620fa708a1d5696fb991c1bde5662";

// Optional: drop Inter-Regular/SemiBold/Bold .ttf into ./assets/fonts for identical
// rendering on every server (Linux hosts usually lack "Segoe UI").
(function loadFonts() {
  const dir = path.join(__dirname, "assets", "fonts");
  const files = [
    ["Inter-Regular.ttf", "400"],
    ["Inter-SemiBold.ttf", "600"],
    ["Inter-Bold.ttf", "700"]
  ];
  for (const [file, weight] of files) {
    const p = path.join(dir, file);
    try { if (fs.existsSync(p)) registerFont(p, { family: "Inter", weight }); } catch (_) {}
  }
})();

const FONT = '"Inter","Segoe UI","Noto Sans","DejaVu Sans",Arial,sans-serif';

// Design tokens (all text colors verified ≥ 4.5:1 on the dark surface)
const T = {
  bg:        "#070A12",
  text:      "#F4F6FB",
  muted:     "rgba(244,246,251,0.74)",
  faint:     "rgba(244,246,251,0.10)",
  glass:     "rgba(255,255,255,0.045)",
  glassHi:   "rgba(255,255,255,0.07)",
  emerald:   "#34D399",
  cyan:      "#38BDF8",
  violet:    "#A78BFA",
  gold:      "#FBBF24"
};

module.exports = {
  config: {
    name: "welcome",
    version: "9.0",
    author: "EryXenX (upgraded)",
    category: "events"
  },

  langs: {
    en: {
      defaultWelcomeMessage: "𝗪𝗲𝗹𝗰𝗼𝗺𝗲 {userName} 🎉\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n✦ Glad to have you here! Enjoy your stay and make great memories 🌸",
      botAddedMessage:
        "━━━━━━━━━━━━━━━━━━━\n🤖 ᴛʜᴀɴᴋ ʏᴏᴜ ғᴏʀ ᴀᴅᴅɪɴɢ ᴍᴇ ᴛᴏ ᴛʜᴇ ɢʀᴏᴜᴘ! 💖\n\n⚙️ ʙᴏᴛ ᴘʀᴇꜰɪx : /\n📜 ᴛʏᴘᴇ /help ᴛᴏ sᴇᴇ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs\n\n✨ ʟᴇᴛ's ᴍᴀᴋᴇ ᴛʜɪs ɢʀᴏᴜᴘ ᴇᴠᴇɴ ᴍᴏʀᴇ ꜰᴜɴ ᴛᴏɢᴇᴛʜᴇʀ! 😄\n━━━━━━━━━━━━━━━━━━━"
    }
  },

  onStart: async ({ threadsData, message, event, api, usersData, getLang }) => {
    if (event.logMessageType !== "log:subscribe") return;

    const { threadID } = event;
    const threadData = await threadsData.get(threadID);
    if (!threadData.settings.sendWelcomeMessage) return;

    const added      = event.logMessageData.addedParticipants || [];
    const botID      = api.getCurrentUserID();
    const prefix     = getPrefix(threadID);
    const threadName = threadData.threadName || "our group";
    const inviterID  = event.author;
    const data       = threadData.data || {};

    // Bot itself was added
    if (added.some(u => u.userFbId == botID)) {
      if (nickNameBot) await api.changeNickname(nickNameBot, threadID, botID).catch(() => {});
      await message.send(getLang("botAddedMessage", prefix));
    }

    const members = added.filter(u => u.userFbId != botID);
    if (!members.length) return;

    // Shared across every newcomer in this event → load once
    const totalMembers = event.participantIDs.length;
    const inviterName  = await usersData.getName(inviterID);
    const [inviterImg, groupImg] = await Promise.all([
      loadProfile(inviterID, api),
      getGroupImage(threadID, api)
    ]);

    const template = data.welcomeMessage || getLang("defaultWelcomeMessage");

    for (let i = 0; i < members.length; i++) {
      const user     = members[i];
      const userID   = user.userFbId;
      const userName = user.fullName;
      // Approximate join order when several people are added at once
      const memberCount = totalMembers - (members.length - 1 - i);

      const vars = { userName, userTag: userName, threadName, memberCount, inviterName };
      const welcomeMessage = template.replace(
        /\{(userName|userTag|threadName|memberCount|inviterName)\}/g,
        (_, k) => String(vars[k] ?? "")          // function form: names containing "$&" can't corrupt output
      );

      let imagePath = null;
      try {
        const newUserImg = await loadProfile(userID, api);
        imagePath = await createWelcomeCard({
          userName, threadName, memberCount, inviterName,
          newUserImg, inviterImg, groupImg
        });
      } catch (err) {
        console.error("[welcome] card creation failed:", err);
      }

      const form = { body: welcomeMessage, mentions: [{ tag: userName, id: userID }] };

      if (imagePath && fs.existsSync(imagePath)) {
        form.attachment = fs.createReadStream(imagePath);
      } else if (data.welcomeAttachment) {
        const files = data.welcomeAttachment.map(f => drive.getFile(f, "stream"));
        form.attachment = (await Promise.allSettled(files))
          .filter(({ status }) => status === "fulfilled")
          .map(({ value }) => value);
      }

      try {
        await message.send(form);
      } finally {
        if (imagePath) fs.remove(imagePath).catch(() => {});
      }
    }
  }
};

/* ──────────────────────────────────────────────────────────────
 * NETWORK
 * ────────────────────────────────────────────────────────────── */
async function fetchBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return Buffer.from(res.data);
  } catch { return null; }
}

async function loadProfile(uid, api) {
  const hq = await fetchBuffer(
    `https://graph.facebook.com/${uid}/picture?width=512&height=512&access_token=${ACCESS_TOKEN}`
  );
  if (hq) { const img = await loadImage(hq).catch(() => null); if (img) return img; }
  try {
    const info = await api.getUserInfo([uid]);
    const src  = info[uid]?.thumbSrc;
    if (src) { const b = await fetchBuffer(src); if (b) return await loadImage(b).catch(() => null); }
  } catch {}
  return null;
}

async function getGroupImage(threadID, api) {
  try {
    const info = await api.getThreadInfo(threadID);
    if (info.imageSrc) {
      const b = await fetchBuffer(info.imageSrc);
      if (b) return await loadImage(b).catch(() => null);
    }
  } catch {}
  return null;
}

/* ──────────────────────────────────────────────────────────────
 * TEXT HELPERS
 * ────────────────────────────────────────────────────────────── */

// Only repair names that are actually mojibake (UTF-8 bytes read as latin1).
// The old version re-decoded every string and could corrupt valid names like "José".
function fixMojibake(str) {
  if (!str) return "";
  if (!/[\u00C2-\u00F4][\u0080-\u00BF]/.test(str)) return str;
  try {
    const fixed = Buffer.from(str, "latin1").toString("utf8");
    return fixed.includes("\uFFFD") ? str : fixed;
  } catch { return str; }
}

// NFKC folds math-bold / fullwidth / circled / script letters to plain text
// (replaces ~60 lines of hand-rolled code-point tables).
function readableText(str) {
  return fixMojibake(str).normalize("NFKC").replace(/\s+/g, " ").trim();
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function initials(name) {
  const parts = Array.from(name).length ? name.split(" ").filter(Boolean) : [];
  const take  = parts.slice(0, 2).map(p => Array.from(p)[0]).join("");
  return (take || "?").toUpperCase();
}

function fitText(ctx, text, maxPx, maxSize, minSize, weight = 700) {
  let size = maxSize, t = text;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(t).width > maxPx && size > minSize) {
    size--; ctx.font = `${weight} ${size}px ${FONT}`;
  }
  if (ctx.measureText(t).width > maxPx) {
    while (t.length > 1 && ctx.measureText(t + "…").width > maxPx) t = t.slice(0, -1);
    t += "…";
  }
  return { text: t, size };
}

function wrapLines(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width <= maxW) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);

  const out = [];
  for (let line of lines) {            // hard-break tokens wider than the box (long names, CJK)
    while (line.length > 1 && ctx.measureText(line).width > maxW) {
      let i = line.length;
      while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--;
      out.push(line.slice(0, i)); line = line.slice(i);
    }
    out.push(line);
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return out.length ? out : [""];
}

// Largest size at which the text fits in `maxLines` without truncation
function fitBlock(ctx, text, maxW, maxLines, maxSize, minSize, weight = 700) {
  for (let size = maxSize; size >= minSize; size--) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrapLines(ctx, text, maxW, 99);
    if (lines.length <= maxLines) return { lines, size };
  }
  ctx.font = `${weight} ${minSize}px ${FONT}`;
  return { lines: wrapLines(ctx, text, maxW, maxLines), size: minSize };
}

// Letter-spaced text without relying on ctx.letterSpacing (missing in older node-canvas)
function spacedWidth(ctx, text, gap) {
  const chars = Array.from(text);
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + gap * (chars.length - 1);
}
function drawSpaced(ctx, text, x, y, gap, align = "left") {
  const chars = Array.from(text);
  const total = spacedWidth(ctx, text, gap);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  ctx.save(); ctx.textAlign = "left";
  for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + gap; }
  ctx.restore();
  return total;
}

/* ──────────────────────────────────────────────────────────────
 * SHAPE HELPERS
 * ────────────────────────────────────────────────────────────── */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sparkle(ctx, cx, cy, r, color) {   // vector 4-point star (no emoji / font dependency)
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fill();
  ctx.restore();
}

function blob(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function cover(ctx, img, x, y, w, h) {        // object-fit: cover
  const ir = img.width / img.height, r = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > r) { sw = img.height * r; sx = (img.width - sw) / 2; }
  else        { sh = img.width / r;  sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function glass(ctx, x, y, w, h, r, fill = T.glass) {
  ctx.save();
  ctx.fillStyle = fill;
  rrect(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = T.faint; ctx.lineWidth = 1;
  rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  ctx.restore();
}

// Photo avatar, or a gradient monogram when there is no photo (replaces the 👤 emoji)
function avatar(ctx, img, cx, cy, r, name, c1 = T.emerald, c2 = T.cyan) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (img) {
    cover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#07101A";
    ctx.font = `700 ${Math.round(r * 0.78)}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initials(name), cx, cy + r * 0.04);
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────
 * CARD
 * ────────────────────────────────────────────────────────────── */
async function createWelcomeCard({ userName, threadName, memberCount, inviterName, newUserImg, inviterImg, groupImg }) {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  const safeUser    = readableText(userName)    || "New Member";
  const safeInviter = readableText(inviterName) || "Someone";
  const safeGroup   = readableText(threadName)  || "Our Group";

  /* Background: aurora + dot grid */
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  blob(ctx, 170, 130, 560, "52,211,153", 0.20);
  blob(ctx, 1060, 560, 600, "167,139,250", 0.22);
  blob(ctx, 880, 40, 440, "56,189,248", 0.14);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) ctx.fillRect(x, y, 1.5, 1.5);

  /* Frame */
  const CX = 24, CY = 24, CW = W - 48, CH = H - 48;
  glass(ctx, CX, CY, CW, CH, 28);
  ctx.save();
  const frame = ctx.createLinearGradient(CX, CY, CX + CW, CY + CH);
  frame.addColorStop(0, "rgba(56,189,248,0.55)");
  frame.addColorStop(0.5, "rgba(255,255,255,0.06)");
  frame.addColorStop(1, "rgba(167,139,250,0.55)");
  ctx.strokeStyle = frame; ctx.lineWidth = 1.5;
  rrect(ctx, CX, CY, CW, CH, 28); ctx.stroke();
  ctx.restore();

  /* Left panel */
  const splitX = 440;
  const leftCX = CX + (splitX - CX) / 2;
  ctx.save();
  rrect(ctx, CX, CY, CW, CH, 28); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(CX, CY, splitX - CX, CH);
  const div = ctx.createLinearGradient(0, CY, 0, CY + CH);
  div.addColorStop(0, "rgba(255,255,255,0)");
  div.addColorStop(0.5, "rgba(255,255,255,0.14)");
  div.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = div; ctx.fillRect(splitX, CY, 1, CH);
  ctx.restore();

  // "NEW MEMBER" chip
  {
    ctx.font = `700 14px ${FONT}`;
    const label = "NEW MEMBER", gap = 2.6;
    const tw = spacedWidth(ctx, label, gap);
    const cw = tw + 56, ch = 34, cx = leftCX - cw / 2, cy = 58;
    glass(ctx, cx, cy, cw, ch, ch / 2, "rgba(52,211,153,0.12)");
    ctx.fillStyle = T.emerald;
    ctx.beginPath(); ctx.arc(cx + 20, cy + ch / 2, 4, 0, Math.PI * 2); ctx.fill();
    drawSpaced(ctx, label, cx + 34, cy + 22, gap);
  }

  // Avatar with gradient ring + glow
  const avR = 118, avY = 272;
  ctx.save();
  ctx.shadowColor = "rgba(56,189,248,0.45)"; ctx.shadowBlur = 40;
  const ring = ctx.createLinearGradient(leftCX - avR, avY - avR, leftCX + avR, avY + avR);
  ring.addColorStop(0, T.emerald); ring.addColorStop(0.55, T.cyan); ring.addColorStop(1, T.violet);
  ctx.strokeStyle = ring; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(leftCX, avY, avR + 12, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(leftCX, avY, avR + 26, 0, Math.PI * 2); ctx.stroke();
  avatar(ctx, newUserImg, leftCX, avY, avR, safeUser);

  // Name
  {
    const { text, size } = fitText(ctx, safeUser, splitX - CX - 56, 36, 18);
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fillStyle = T.text; ctx.textAlign = "center";
    ctx.fillText(text, leftCX, avY + avR + 64);
  }

  // Member badge
  {
    const label = `${ordinal(memberCount)} member`;
    ctx.font = `700 17px ${FONT}`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 76, bh = 40, bx = leftCX - bw / 2, by = avY + avR + 86;
    glass(ctx, bx, by, bw, bh, bh / 2, "rgba(52,211,153,0.14)");
    sparkle(ctx, bx + 24, by + bh / 2, 7, T.emerald);
    sparkle(ctx, bx + bw - 24, by + bh / 2, 7, T.emerald);
    ctx.fillStyle = T.emerald; ctx.textAlign = "center";
    ctx.fillText(label, leftCX, by + 26);
  }

  /* Right panel */
  const rX = splitX + 56, rRight = CX + CW - 48, rW = rRight - rX;

  // Eyebrow
  ctx.font = `700 14px ${FONT}`;
  ctx.fillStyle = T.cyan;
  ctx.beginPath(); ctx.arc(rX + 4, 83, 4, 0, Math.PI * 2); ctx.fill();
  drawSpaced(ctx, "WELCOME ABOARD", rX + 20, 88, 2.6);

  // Headline
  ctx.save();
  ctx.font = `700 68px ${FONT}`; ctx.textAlign = "left";
  const hg = ctx.createLinearGradient(rX, 0, rX + 360, 0);
  hg.addColorStop(0, "#FFFFFF"); hg.addColorStop(1, "#A5E3FF");
  ctx.fillStyle = hg;
  ctx.fillText("Welcome!", rX, 158);
  ctx.restore();
  ctx.font = `400 24px ${FONT}`; ctx.fillStyle = T.muted; ctx.textAlign = "left";
  ctx.fillText("You've just joined", rX, 198);

  // Group card
  {
    const y = 230, h = 132;
    glass(ctx, rX, y, rW, h, 20, T.glassHi);

    const gs = 88, gx = rX + 22, gy = y + 22;
    ctx.save();
    rrect(ctx, gx, gy, gs, gs, 18); ctx.clip();
    if (groupImg) cover(ctx, groupImg, gx, gy, gs, gs);
    else {
      const g = ctx.createLinearGradient(gx, gy, gx + gs, gy + gs);
      g.addColorStop(0, T.cyan); g.addColorStop(1, T.violet);
      ctx.fillStyle = g; ctx.fillRect(gx, gy, gs, gs);
      ctx.fillStyle = "#07101A"; ctx.font = `700 ${Math.round(gs * 0.46)}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initials(safeGroup), gx + gs / 2, gy + gs / 2 + 2);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(56,189,248,0.55)"; ctx.lineWidth = 2;
    rrect(ctx, gx, gy, gs, gs, 18); ctx.stroke();

    const tx = gx + gs + 22, tw = rRight - 22 - tx;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.font = `700 13px ${FONT}`; ctx.fillStyle = T.cyan;
    drawSpaced(ctx, `GROUP · ${memberCount} MEMBERS`, tx, y + 38, 2);

    const { lines, size } = fitBlock(ctx, safeGroup, tw, 2, 32, 20);
    ctx.font = `700 ${size}px ${FONT}`; ctx.fillStyle = T.text; ctx.textAlign = "left";
    const lh = Math.round(size * 1.15);
    const base = lines.length === 1 ? y + 88 : y + 74;
    lines.forEach((ln, i) => ctx.fillText(ln, tx, base + i * lh));
  }

  // Added-by card
  {
    const y = 382, h = 92;
    glass(ctx, rX, y, rW, h, 20);
    const r = 30, cx = rX + 22 + r, cy = y + h / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(251,191,36,0.7)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    avatar(ctx, inviterImg, cx, cy, r, safeInviter, T.gold, T.violet);

    const tx = cx + r + 22, tw = rRight - 22 - tx;
    ctx.textAlign = "left";
    ctx.font = `700 13px ${FONT}`; ctx.fillStyle = T.gold;
    drawSpaced(ctx, "ADDED BY", tx, y + 38, 2);
    const { text, size } = fitText(ctx, safeInviter, tw, 26, 15);
    ctx.font = `700 ${size}px ${FONT}`; ctx.fillStyle = T.text;
    ctx.fillText(text, tx, y + 70);
  }

  // Footer
  {
    const y = 520;
    const g = ctx.createLinearGradient(rX, 0, rRight, 0);
    g.addColorStop(0, "rgba(255,255,255,0.14)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(rX, y, rW, 1);

    sparkle(ctx, rX + 8, 562, 8, T.cyan);
    ctx.font = `600 18px ${FONT}`; ctx.textAlign = "left";
    const bg = ctx.createLinearGradient(rX, 0, rX + 260, 0);
    bg.addColorStop(0, T.cyan); bg.addColorStop(1, T.emerald);
    ctx.fillStyle = bg;
    ctx.fillText(BRAND, rX + 26, 568);

    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    ctx.font = `400 16px ${FONT}`; ctx.fillStyle = T.muted; ctx.textAlign = "right";
    ctx.fillText(`Joined ${date}`, rRight, 568);
  }

  const dir = path.join(__dirname, "cache");
  await fs.ensureDir(dir);
  const out = path.join(dir, `welcome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`);
  await fs.writeFile(out, canvas.toBuffer("image/png"));
  return out;
}
