'use strict';
require('date-utils')
const Castv2Client = require("castv2-client").Client;
const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
const express = require('express');
const bodyParser = require('body-parser');
const fs = require("fs");
const os = require('os');
const url = require("url");
const path = require('path');
const VoiceText = require("voicetext");

const VOICETEXT_API_KEY = process.env["VOICETEXT_API_KEY"];
const VOICETEXT_VOLUME = 150;
const LISTEN_PORT = 8080;

if(!VOICETEXT_API_KEY) {
    throw new Error("VOICETEXT_API_KEY is required.");
}
const app = express();
const urlencodedParser = bodyParser.urlencoded({extended: false});
const voice = new VoiceText(VOICETEXT_API_KEY);

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

app.post('/:deviceAddress', urlencodedParser, (req, res) => {
    const deviceAddress = req.params.deviceAddress;
    console.log(new Date().toFormat("YYYY-MM-DD HH24:MI:SS") + " POST " + deviceAddress);
    if (!req.body) {
        return res.sendStatus(400);
    }
    const text = req.body.text;
    if(text) {
        try {
            getSpeechUrl(text, deviceAddress, (notifyRes) => {
                console.log(notifyRes);
                res.send("Say:" + text + "\n");
            })
        }
        catch (err) {
            console.error(err);
            res.sendStatus(500);
            res.send(err);
        }
    }
});
app.get('/:deviceAddress', (req, res) => {
    const deviceAddress = req.params.deviceAddress;
    console.log(new Date().toFormat("YYYY-MM-DD HH24:MI:SS") + " GET " + deviceAddress);
    if(!deviceAddress) {
        res.status(400).send("Invalid Parameters.");
    }
    const filepath = path.join(__dirname, deviceAddress + ".wav");
    const speechfile = fs.readFileSync(filepath, "binary");
    res.setHeader("Content-Length", speechfile.length);
    res.write(speechfile, "binary");
    res.end();
});

const getListenAddress = () => {
    let listen_address;
    if(process.env["LISTEN_ADDRESS"]) {
        listen_address = process.env["LISTEN_ADDRESS"];
    }
    else if(process.env["LISTEN_INTERFACE"]) {
        const interfaces = os.networkInterfaces();
        const LISTEN_INTERFACE = process.env["LISTEN_INTERFACE"];
        listen_address = interfaces[LISTEN_INTERFACE].find(ifmodule => ifmodule.family === 'IPv4').address;
    }
    if(listen_address) {
        return listen_address;
    }
    throw new Error("LISTEN_ADDRESS or LISTEN_INTERFACE required.")
};

const getSpeaker = (speaker=process.env["VOICETEXT_SPEAKER"]) => {
    switch(speaker) {
        case 'SHOW':
            return voice.SPEAKER.SHOW;
        case 'BEAR':
            return voice.SPEAKER.BEAR;
        case 'HIKARI':
            return voice.SPEAKER.HIKARI;
        case 'HARUKA':
            return voice.SPEAKER.HARUKA;
        case 'SANTA':
            return voice.SPEAKER.SANTA;
        case 'TAKERU':
            return voice.SPEAKER.TAKERU;
        default:
            return voice.SPEAKER.HIKARI;
    }   
};

const getEmotion = (emotion=process.env["VOICETEXT_EMOTION"]) => {
    switch(emotion) {
        case 'HAPINESS':
            return voice.EMOTION.HAPINESS;
        case 'ANGER':
            return voice.EMOTION.ANGER;
        case 'SADNESS':
            return voice.EMOTION.SADNESS;
        default:
            return voice.EMOTION.NONE;
    }
};

const getEmotionLevel = (emotion_level=process.env["VOICETEXT_EMOTION_LEVEL"]) => {
    switch(emotion_level) {
        case 'NORMAL':
            return voice.EMOTION_LEVEL.NORMAL;
        case 'HIGH':
            return voice.EMOTION_LEVEL.HIGH;
        case 'SUPER':
            return voice.EMOTION_LEVEL.SUPER;
        case 'EXTREME':
            return voice.EMOTION_LEVEL.EXTREME;
        default:
            return voice.EMOTION_LEVEL.NONE;
    }
};

const convertToText = (text, host) => {
    return new Promise((resolve, reject) => {
        voice
            .speaker(getSpeaker())
            .emotion(getEmotion())
            .emotion_level(getEmotionLevel())
            .volume(VOICETEXT_VOLUME)
            .speak(text, (e, buf) => {
                if(e) {
                    console.error(e);
                    reject(e);
                }
                else {
                    const filepath = path.join(__dirname, host + ".wav");
                    fs.writeFileSync(filepath, buf, 'binary');
                    const endpointUrl = url.format({
                        protocol: 'http',
                        port: LISTEN_PORT,
                        hostname: getListenAddress(),
                        pathname: host
                    });
                    resolve(endpointUrl.toString());
                }
            });
    });
};

const getSpeechUrl = (text, host, callback) => {
    convertToText(text, host).then((result, reject) => {
        onDeviceUp(result, host, (res) => {
            callback(res);
        });
    }).catch(function onRejected(error) {
        console.error(error);
    });
};

const onDeviceUp = (speechurl, host, callback) => {
    const client = new Castv2Client;
    client.connect(host, () => {
        client.launch(DefaultMediaReceiver, (err, player) => {
            const media = {
                contentId: speechurl,
                contentType: 'audio/mp3',
                streamType: 'BUFFERED'
            };
            if(speechurl.endsWith('wav')) {
                media.contentType = 'audio/wav';
            }
            else if (speechurl.endsWith('ogg')) {
                media.contentType = 'audio/ogg';
            }
            player.load(media, {autoplay: true}, (err, status) => {
                client.close();
                callback('Device notified.', speechurl);
            });
        });
    });
    client.on('error', (err) => {
        console.error("Error: %s", err.message);
        client.close();
        callback("error");
    });
};

app.listen(LISTEN_PORT, () => {
    console.log('Start server', getListenAddress() + ':' + LISTEN_PORT);
})