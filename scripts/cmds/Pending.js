module.exports.config = {
    name: "pending",
    version: "1.0.0",
    hasPermission: 2,
    credits: "SK HABIBULLA",
    description: "Manage pending group requests",
    commandCategory: "Admin",
    usages: "[pending]",
    cooldowns: 5
};

module.exports.onStart = async ({ api, event }) => {
    try {
        const pendingThreads = await api.getPendingThreads();
        if (pendingThreads.length === 0) {
            return api.sendMessage("No pending group requests.", event.threadID, event.messageID);
        }
        let msg = "Pending Group Requests:\n";
        pendingThreads.forEach((thread, index) => {
            msg += `${index + 1}. ${thread.threadName} (ID: ${thread.threadID})\n`;
        });
        msg += "\nReply with 'accept [number]' or 'reject [number]'";
        const info = await api.sendMessage(msg, event.threadID, event.messageID);
        global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "choose",
            pendingThreads
        });
    } catch (e) {
        api.sendMessage("Error fetching pending requests.", event.threadID, event.messageID);
    }
};

module.exports.onReply = async ({ api, event, Reply }) => {
    const args = event.body.split(" ");
    const action = args[0].toLowerCase();
    const index = parseInt(args[1]) - 1;

    if (!["accept", "reject"].includes(action) || isNaN(index) || !Reply.pendingThreads[index]) {
        return api.sendMessage("Invalid format. Use 'accept [number]' or 'reject [number]'.", event.threadID, event.messageID);
    }

    const thread = Reply.pendingThreads[index];
    try {
        if (action === "accept") {
            await api.approveGroup(thread.threadID);
            api.sendMessage(`Approved ${thread.threadName}.`, event.threadID, event.messageID);
        } else {
            await api.declineGroup(thread.threadID);
            api.sendMessage(`Declined ${thread.threadName}.`, event.threadID, event.messageID);
        }
    } catch (e) {
        api.sendMessage(`Failed to ${action} request.`, event.threadID, event.messageID);
    }
};
