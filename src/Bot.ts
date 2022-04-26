import {Client, Intents} from "discord.js";
import ready from "./listeners/ready";
import message from "./listeners/message";

const token = process.env.LINK_LONK_BOT_TOKEN;

console.log("Bot is starting...");

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_MESSAGES],
    partials: ['MESSAGE', 'REACTION'],
});
ready(client);
message(client);

// client.on("debug", (info) => {
//     console.log(`debug info: ${info}`);
// })

client.login(token)
    .then(() => console.log("Client logged in successfully."))
    .catch((reason) => console.log(`Client failed to log in. Reason: ${reason}`));
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
