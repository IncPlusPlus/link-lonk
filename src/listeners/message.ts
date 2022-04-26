import { Client } from "discord.js";
import {applyMessageHandlers} from "../messageHandling/MessageHandling";

export default (client: Client): void => {
    client.on("messageCreate", (message) => {
        if (!client.user || !client.application) {
            return;
        }

        // Ignore bots
        if (message.author.bot) return;

        applyMessageHandlers(client,message);

        console.log(`Peeked at message ID: ${message.id}`);
    });
};
