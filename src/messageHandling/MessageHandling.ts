import {Client, Message} from "discord.js";
import {handleYouTubeShorts} from "./handlers/YouTube_Shorts.js";
import {handleIFunnyVideo} from "./handlers/iFunny.js";

export type MessageHandler = (client: Client, message: Message) => boolean;

const messageHandlers: MessageHandler[] = [handleYouTubeShorts, handleIFunnyVideo];

/**
 * Applies all applicable message handlers to the message
 */
export const applyMessageHandlers = (client: Client, message: Message) => {
    for (const handler of messageHandlers) {
        // Exhaust the handlers until we find a handler that says it's applicable and has taken action
        if (handler(client, message)) {
            console.log(`Replying to message ID: ${message.id}`);
            break;
        }
    }
};

// In the future, use a series of "message handlers" to compose one big message in case the message in question has multiple applicable links of different sources
