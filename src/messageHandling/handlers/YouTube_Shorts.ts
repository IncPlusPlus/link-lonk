import {Client, Message} from "discord.js";
import {MessageHandler} from "../MessageHandling.js";

const shortsRegEx = new RegExp('https:\\/\\/(\\w+\\.)?youtube.com\\/shorts\\/([0-9A-Za-z_-]+)', 'g');

export class YouTubeShorts implements MessageHandler {
    canHandle(client: Client, message: Message): boolean {
        const matches = [...message.content.matchAll(shortsRegEx)];
        return matches.length !== 0;

    }

    handle(client: Client, message: Message): Promise<any> {
        const matches = [...message.content.matchAll(shortsRegEx)];
        let replyMessage = `Hey, bruh. I fixed your YT Shorts link${matches.length > 1 ? 's' : ''}. The mobile users can thank me later.`;
        for (const match of matches) {
            replyMessage += '\n' + `https://${match[1] ?? ''}youtube.com/watch?v=${match[2]}`;
        }
        // Reply to the message with the full YT links
        return message.reply(replyMessage)
            .then(() => {
                console.log(`Replied to message "${message.id}" with content "${message.content}". Suppressing embeds for that message...`);
                // Suppress the embeds for the original method so the embedded video player doesn't show up twice and take a ton of space
                message.suppressEmbeds(true)
                    .then(() => console.log(`Suppressed embeds for message "${message.id}".`))
                    .catch((suppressFailReason) => console.log(`Failed to suppress embeds for message "${message.id}". Reason: ${suppressFailReason}`))
            })
            .catch((replyFailReason) => console.log(`Failed to reply to message "${message.id}" with content "${message.content}". Reason: ${replyFailReason}`));
    }
}
