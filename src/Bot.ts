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
