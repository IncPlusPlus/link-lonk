import { Client } from "discord.js";
import ready from "./listeners/ready";

const token = process.env.LINK_LONK_BOT_TOKEN;

console.log("Bot is starting...");

const client = new Client({
    intents: []
});
ready(client);

client.login(token);
console.log(client);

const handleShutdown = (...args: any[]) => {
    console.log(`link-lonk received ${args[0]}`);
    client.destroy();
    console.log('Client destroyed.');
    process.exit();
}

// Handle shutdown
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('SIGKILL', handleShutdown);
