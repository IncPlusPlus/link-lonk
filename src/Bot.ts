import {Client, Intents} from "discord.js";
import ready from "./listeners/ready.js";
import message from "./listeners/message.js";

const token = process.env.LINK_LONK_BOT_TOKEN;

console.log("Bot is starting...");

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_MESSAGES],
    partials: [
        'MESSAGE',
        'REACTION',
        // Required to receive DMs (https://github.com/discordjs/discord.js/issues/5516#issuecomment-985458524)
        'CHANNEL'
    ],
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
    console.log('Attempting to destroy client...');
    client.destroy();
    console.log('Client destroyed.');
    process.exit();
};

// Handle shutdown
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
// This event isn't registered on Windows and completely crashes if attempting to register on Linux. Guess it's not needed then???
// process.on('SIGKILL', handleShutdown);
