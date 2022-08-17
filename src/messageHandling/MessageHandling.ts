import {Client, Message} from "discord.js";
import {YouTubeShorts} from "./handlers/YouTube_Shorts.js";
import {iFunny} from "./handlers/iFunny.js";

export interface MessageHandler {
    canHandle(client: Client, message: Message): boolean;

    handle(client: Client, message: Message): Promise<any>;
}

const messageHandlers: MessageHandler[] = [new YouTubeShorts(), new iFunny()];

/**
 * Applies all applicable message handlers to the message
 */
export const applyMessageHandlers = (client: Client, message: Message) => {
    for (const handler of messageHandlers) {
        // Exhaust the handlers until we find a handler that says it's applicable and has taken action
        if (handler.canHandle(client, message)) {
            console.log(`Replying to message ID: ${message.id}`);
            handler.handle(client, message).catch(() => `Reply to message ID: ${message.id} failed`);
            break;
        }
    }
};

// In the future, use a series of "message handlers" to compose one big message in case the message in question has multiple applicable links of different sources
