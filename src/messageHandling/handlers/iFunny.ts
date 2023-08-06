import {Client, DiscordAPIError, Message, MessageAttachment, Snowflake} from "discord.js";
import cheerio from 'cheerio';
import got, {HTTPError} from 'got';
import fluentFfmpeg from 'fluent-ffmpeg';
import {MessageHandler} from "../MessageHandling.js";
import {spawn} from "child_process";
import {unlink} from "fs/promises";
import Jimp from "jimp";

const {ffprobe} = fluentFfmpeg;

/**
 * The height of the iFunny watermark. Unfortuantely, due to JPEG compression, artifacts from the watermark will still
 * show up above the 20 pixel line and bleed over onto the image. The best we can do for now is to remove the bottom
 * 20 pixels that contain the watermark and hope it's not too noticeable. In the future, this could be improved by
 * implementing https://github.com/IncPlusPlus/link-lonk/issues/38.
 */
const IFUNNY_WATERMARK_HEIGHT_PIXELS = 20;

export class iFunny implements MessageHandler {
    canHandle(client: Client, message: Message): boolean {
        const matches = [...message.content.matchAll(iFunnyVideoRegEx)];
        return matches.length !== 0;
    }

    async handle(client: Client, message: Message): Promise<any> {
        const matches = [...message.content.matchAll(iFunnyVideoRegEx)];
        let attachmentsShouldBeMarkedAsSpoiler = false;
        if (message.content.startsWith("Spoiler") || message.content.startsWith("spoiler")) {
            attachmentsShouldBeMarkedAsSpoiler = true;
        }
        // For all applicable iFunny links
        let linkDetailsList = await Promise.all(matches.map(match => ({pageUrl: match[0], mediaType: match[1]}))
            // Scrape the page for page details including the URL to the video
            .map(iFunnyLink => scrapeIFunny(iFunnyLink.pageUrl, iFunnyLink.mediaType)));

        /*
         Repopulate the list after checking if any videos need to be converted from HEVC (which Discord doesn't display)
         and then converting them if necessary.
         See https://www.reddit.com/r/discordapp/comments/oazcgw/psa_you_cannot_embed_mp4_hevc_files_they_have_to/ for more info
        */
        linkDetailsList = await Promise.all(linkDetailsList.map(value => encodeToAVCIfNecessary(value, message.id)));
        // Crop watermark if necessary
        linkDetailsList = await Promise.all(linkDetailsList.map(value => cropWatermarkIfNecessary(value,message.id)));

        // Of the returned video file URLs
        const files = linkDetailsList
            // Filter out any that are empty (meaning there was a problem finding it)
            .filter(meme => meme.mediaUrl.length > 0)
            // Upload the videos as attachments for the reply we're going to send
            .map(meme => new MessageAttachment(meme.mediaUrl, meme.mediaFileName));
        let errorsFromFetchOperation = '';
        linkDetailsList
            // Find all links for which we failed to find the media content for
            .filter(meme => meme.mediaUrl.length < 1)
            // We store the error string in the mediaFileName
            .forEach(meme => {
                errorsFromFetchOperation += `"${meme.mediaFileName}" `
            });

        // Mark the attachments as spoilers if that was requested
        if (attachmentsShouldBeMarkedAsSpoiler) {
            files.forEach(attachment => attachment.setSpoiler(true));
        }
        let errorsFetchingFiles: string;
        if (files.length > 0) {
            errorsFetchingFiles = 'Additionally, the following errors occurred when fetching one or more your links: ';
        } else {
            errorsFetchingFiles = 'The following errors occurred when fetching one or more your links: '
        }
        errorsFetchingFiles += errorsFromFetchOperation;
        // Reply to the original poster with the MP4 files of the video they linked to
        return message.reply({
            files: files,
            // Discord really hates it if you reply with an empty string, so we have to set this to undefined if we've got nothing to say.
            // We check errorsFromFetchOperation to see if there were any errors, and we use errorsFetchingFiles to specify what went wrong.
            content: errorsFromFetchOperation.length > 0 ? errorsFetchingFiles : undefined,
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
    }
}
const iFunnyVideoRegEx = new RegExp('https:\\/\\/ifunny.co\\/(video|picture|gif)\\/[\\w-]+', 'g');

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
        let errorText = "Unknown error fetching webpage"
        if (e instanceof HTTPError) {
            if (e.response.statusCode === 404) {
                errorText = "404. Wrong URL or the post got banned/deleted."
            }
        }
        return {mediaUrl: "", mediaFileName: errorText};
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

const encodeToAVCIfNecessary = async (meme: { mediaUrl: string; mediaFileName: string }, sourceMessageId: Snowflake): Promise<{ mediaUrl: string; mediaFileName: string }> => {
    // Don't touch the attachment unless it's an MP4 which may use a codec unsupported by iFunny
    if (!meme.mediaUrl.endsWith(".mp4")) {
        return meme;
    }
    const codec = await getCodec(meme.mediaUrl);
    if (codec === 'hevc') {
        return new Promise<{ mediaUrl: string; mediaFileName: string }>(function (resolve, reject) {
            let process = spawn('ffmpeg', ['-i', meme.mediaUrl, '-vcodec', 'libx264', '-acodec', 'aac', meme.mediaFileName, "-y"])
            process.on('close', function (code) {
                resolve({mediaUrl: meme.mediaFileName, mediaFileName: meme.mediaFileName});
                // Set a timer to delete the file that was created. 5 minutes should be a safe bet for upload time
                setTimeout(() => {
                    unlink(meme.mediaFileName)
                        .then(() => console.log(`Cleaned up attachment ${meme.mediaFileName} created for message ${sourceMessageId}`))
                        .catch((reason) => console.log(`Failed to clean up attachment ${meme.mediaFileName} created for message ${sourceMessageId}. Reason: ${reason}`));
                }, 300000);
            })
            process.on('error', function (err) {
                reject(err);
            })
        });
    } else {
        return meme;
    }
}

const cropWatermarkIfNecessary = async (meme: {
    mediaUrl: string;
    mediaFileName: string
}, sourceMessageId: Snowflake): Promise<{ mediaUrl: string; mediaFileName: string }> => {
    // Don't touch the attachment unless it's a JPEG which may use a codec unsupported by iFunny
    // TODO: Might need to catch "jpeg" here too, not just "jpg"
    if (!meme.mediaUrl.endsWith(".jpg")) {
        return meme;
    }
    return new Promise<{ mediaUrl: string; mediaFileName: string }>(async function (resolve, reject) {
        Jimp.read(meme.mediaUrl)
            .then((image) => {
                const height = image.bitmap.height;
                const width = image.bitmap.width;
                image.crop(0, 0, width, height - IFUNNY_WATERMARK_HEIGHT_PIXELS);
                image.write(meme.mediaFileName, (err, value) => {
                    if (err) {
                        console.log("Failed to save '" + meme.mediaFileName + "' from message " + sourceMessageId);
                        reject(err)
                    } else {
                        console.log("Cropped " + meme.mediaFileName)
                        resolve({mediaUrl: meme.mediaFileName, mediaFileName: meme.mediaFileName});
                        // Set a timer to delete the file that was created. 5 minutes should be a safe bet for upload time
                        setTimeout(() => {
                            unlink(meme.mediaFileName)
                                .then(() => console.log(`Cleaned up attachment ${meme.mediaFileName} created for message ${sourceMessageId}`))
                                .catch((reason) => console.log(`Failed to clean up attachment ${meme.mediaFileName} created for message ${sourceMessageId}. Reason: ${reason}`));
                        }, 300000);
                    }
                });

            })
            .catch((err) => {
                console.log("Failed to handle '" + meme.mediaFileName + "' from message " + sourceMessageId);
                reject(err);
            });
    });
}

const getCodec = (filePath: string) => {
    return new Promise((resolve, reject) => {
        try {
            ffprobe(filePath, function (err, probeData) {
                if (err) return reject(err);
                else {
                    return resolve(probeData.streams[0].codec_name);
                }
            });
        } catch (error) {
            return reject(error);
        }
    });
}
