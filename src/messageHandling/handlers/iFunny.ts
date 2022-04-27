import {Client, Message, MessageAttachment} from "discord.js";
import cheerio from 'cheerio';
import got from 'got';
import {CheerioAPI} from "cheerio/lib/load";

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
                .then(() => console.log(`Replied to message "${message.id}" with content "${message.content}". Suppressing embeds for that message...`))
                .catch((replyFailReason) => console.log(`Failed to reply to message "${message.id}" with content "${message.content}". Reason: ${replyFailReason}`));
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
    switch (mediaType) {
        case 'video':
            return scrapeIFunnyForVideo(pageBody$);
        default:
            console.log(`Couldn't process iFunny link '${pageUrl} with unknown media type '${mediaType}'.`);
            return {mediaUrl: "", mediaFileName: "INVALID MEDIA TYPE"};
    }
}

const scrapeIFunnyForVideo = (pageBody$: CheerioAPI): { mediaUrl: string; mediaFileName: string } => {
// Look for CSS selector for the video pane
    const selector = pageBody$('#App > div.v9ev > div.xbey > div > div > div._3ZEF > div > video');
    if (selector.length !== 1) {
        throw new Error(`Expected to find 1 video pane on the iFunny video page but found ${selector.length}`);
    }
    const meme = selector[0];
    const videoUrl = meme.attribs["data-src"];
    // const thumbnailUrl = meme.attribs["data-poster"];
    // const title = pageBody$('#App > div.v9ev > div.xbey > div > div > h1').text();
    return {mediaUrl: videoUrl, mediaFileName: videoUrl.substring(videoUrl.lastIndexOf("/") + 1)};
}

// const createEmbedForIFunny=(pageUrl:string,title:string, thumbnailUrl:string, videoUrl:string): MessageEmbed => {
//     return new MessageEmbed()
//         .setTitle(title??'iFunny')
//         .setThumbnail(thumbnailUrl)
//         // .setDescription(videoUrl)
//         .setURL(pageUrl);
// }
