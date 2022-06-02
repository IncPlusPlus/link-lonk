import {Client, DiscordAPIError, Message, MessageAttachment} from "discord.js";
import cheerio from 'cheerio';
import got from 'got';

const iFunnyVideoRegEx = new RegExp('https:\\/\\/ifunny.co\\/(video|picture|gif)\\/\\w+', 'g');

export const handleIFunnyVideo = (client: Client, message: Message): boolean => {
    const matches = [...message.content.matchAll(iFunnyVideoRegEx)];
    if (matches.length === 0) {
        return false;
    }
    let attachmentsShouldBeMarkedAsSpoiler = false;
    if (message.content.startsWith("Spoiler") || message.content.startsWith("spoiler")) {
        attachmentsShouldBeMarkedAsSpoiler = true;
    }
    // For all applicable iFunny links
    (Promise.all(matches.map(match => ({pageUrl: match[0], mediaType: match[1]}))
        // Scrape the page for page details including the URL to the video
        .map(iFunnyLink => scrapeIFunny(iFunnyLink.pageUrl, iFunnyLink.mediaType))))
        // Then with those details
        .then(linkDetailsList => {
            // Of the returned video file URLs
            const files = linkDetailsList
                // Filter out any that are empty (meaning there was a problem finding it)
                .filter(meme => meme.mediaUrl.length > 0)
                // Upload the videos as attachments for the reply we're going to send
                .map(meme => new MessageAttachment(meme.mediaUrl, meme.mediaFileName));
            // Mark the attachments as spoilers if that was requested
            if (attachmentsShouldBeMarkedAsSpoiler) {
                files.forEach(attachment => attachment.setSpoiler(true));
            }
            // Reply to the original poster with the MP4 files of the video they linked to
            message.reply({
                files: files,
            })
                .then(() => console.log(`Replied to message "${message.id}" with content "${message.content}".`))
                .catch((replyFailReason) => {
                        let explanation = "I'm not quite sure what happened."
                    // Check if this is an error we recognize
                    if (replyFailReason instanceof DiscordAPIError) {
                        // Check if the reason the reply failed is that the file was too large
                        if (replyFailReason.httpStatus === 413) {
                            // Try just linking the file instead of uploading it.
                            console.log(`Failed to reply to message  "${message.id}" with content "${message.content}" because the file(s) were too big. Trying again by just sending the links to the file(s)...`);
                            explanation = 'Reason being, they were too big!'
                        }
                    } else if (replyFailReason.name) {
                        console.log(`Failed to reply to message  "${message.id}" with content "${message.content}". Encountered "${replyFailReason.name}". Trying again by just sending the links to the file(s)...`);
                        explanation = `Encountered error "${replyFailReason.name}".`
                    }
                    let mediaLinks = `Here are the file(s) of the media you linked to as hyperlinks. Seems I couldn't upload them myself. ${explanation}`;
                    files.forEach(file => mediaLinks += " " + file.attachment);
                    message.reply(mediaLinks);
                })
                // Well at least we tried!
                .catch((secondFailReason) => console.log(`Failed to reply to message "${message.id}" with content "${message.content}". Reason: ${secondFailReason}`));
        });

    return true;
}

/**
 * Get the URL of an iFunny video. This will return an empty string if there's an error accessing the web page
 * @param pageUrl the URL of the ifunny.co webpage
 * @param mediaType whether this link is for a video, picture, or gif
 * @return a URL directly to the video file for that page
 */
const scrapeIFunny = async (pageUrl: string, mediaType: string): Promise<{ mediaUrl: string, mediaFileName: string }> => {
    let response;
    try {
        response = await got(pageUrl, {
            headers: {
                // We get denied with a 401 if we send no user agent or if it's Postman
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
            }
        });
    } catch (e) {
        console.log(`Encountered an error trying to access "${pageUrl}". Details: ${e}`);
        return {mediaUrl: "", mediaFileName: "INVALID NAME"};
    }
    const pageBody$ = cheerio.load(response.body);
    const selector = pageBody$(getCSSSelectorForIFunny(mediaType));
    if (selector.length !== 1) {
        throw new Error(`Expected to find 1 ${mediaType} pane on the iFunny ${mediaType} page but found ${selector.length}`);
    }
    const meme = selector[0];
    let mediaUrl;
    switch (mediaType) {
        case 'video':
            // @ts-ignore YES IT DOES HAVE THAT ATTRIBUTE, STUPID!
            mediaUrl = meme.attribs["data-src"];
            break;
        case 'picture':
            // @ts-ignore YES IT DOES HAVE THAT ATTRIBUTE, STUPID!
            mediaUrl = meme.attribs["src"];
            break;
        case 'gif':
            // @ts-ignore YES IT DOES HAVE THAT ATTRIBUTE, STUPID!
            mediaUrl = meme.attribs["data-src"];
            break;
        default:
            console.log(`Couldn't process iFunny link '${pageUrl} with unknown media type '${mediaType}'.`);
            return {mediaUrl: "", mediaFileName: "INVALID MEDIA TYPE"};
    }
    return {mediaUrl, mediaFileName: mediaUrl.substring(mediaUrl.lastIndexOf("/") + 1)};
}

const getCSSSelectorForIFunny = (mediaType: string): string => {
    switch (mediaType) {
        case 'video':
            return '#App > div.v9ev > div.xbey > div > div > div._3ZEF > div > video';
        case 'picture':
            return '#App > div.v9ev > div.xbey > div > div > div._3ZEF > img';
        case 'gif':
            return '#App > div.v9ev > div.xbey > div > div > div._3ZEF > img';
        default:
            console.log(`Unknown iFunny media type '${mediaType}'.`)
            return '';
    }
}

// const createEmbedForIFunny=(pageUrl:string,title:string, thumbnailUrl:string, videoUrl:string): MessageEmbed => {
//     return new MessageEmbed()
//         .setTitle(title??'iFunny')
//         .setThumbnail(thumbnailUrl)
//         // .setDescription(videoUrl)
//         .setURL(pageUrl);
// }
