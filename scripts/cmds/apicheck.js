
module.exports = {
  config: {
    name: "apicheck",
    version: "1.0.0",
    author: "SK HABIBULLA",
    role: 2,
    shortDescription: "Instagram API Checker",
    category: "owner"
  },

  onStart: async function ({ api, message }) {
    const methods = new Set();
    let obj = api;

    while (obj && obj !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(obj)) {
        if (/group|thread|invite|request|pending|friend/i.test(name)) {
          methods.add(name);
        }
      }
      obj = Object.getPrototypeOf(obj);
    }

    message.reply(
      "👑 HR HABIB API CHECK\n\n" +
      ([...methods].sort().join("\n") || "No matching methods found")
    );
  }
};
