
module.exports = {
  config: {
    name: "grouptest",
    version: "1.0.0",
    author: "SK HABIBULLA",
    role: 2,
    shortDescription: "Check group threads",
    category: "owner"
  },

  onStart: async function ({ api, message }) {
    try {
      const threads = await api.getThreadList(30);

      if (!Array.isArray(threads) || !threads.length)
        return message.reply("No threads found.");

      const result = threads.slice(0, 15).map((t, i) =>
        `${i + 1}. ${t.threadName || t.name || "Unknown"}\n` +
        `ID: ${t.threadID || t.id || "N/A"}\n` +
        `Fields: ${Object.keys(t).join(", ")}`
      );

      return message.reply(
        "👑 HR HABIB GROUP TEST\n\n" + result.join("\n\n")
      );
    } catch (e) {
      return message.reply("API Error: " + e.message);
    }
  }
};
