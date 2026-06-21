'use strict'
require('date-utils');
const Castv2Client = require("castv2-client").Client;
const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
const express = require('express');
const bodyParser = require('body-parser');
const fs = require("fs");
const https = require('https');
const os = require('os');
const url = require("url");
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');
const rateLimit = require('express-rate-limit');

const VOICETEXT_VOLUME = parseInt(process.env["VOICETEXT_VOLUME"] || '150', 10);
const LISTEN_PORT = process.env["LISTEN_PORT"] || 8080;
const voicedir = path.join(__dirname, 'voice');

const voiceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
});

const VALID_DEVICE_ADDRESS = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}$/;

const validateDeviceAddress = (deviceAddress) => {
    if (!deviceAddress || !VALID_DEVICE_ADDRESS.test(deviceAddress)) {
        return null;
    }
    return deviceAddress;
};

const safeFilePath = (filename) => {
    const resolved = path.resolve(voicedir, filename);
    if (!resolved.startsWith(path.resolve(voicedir) + path.sep)) {
        return null;
    }
    return resolved;
};

const app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use((req, res, next) => {
    bodyParser.json()(req, res, (err) => {
        if(err) {
            return res.status(400).send(err.toString());
        }
        next();
    });
});

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

app.post('/:deviceAddress', (req, res) => {
    const deviceAddress = validateDeviceAddress(req.params.deviceAddress);
    if (!deviceAddress) {
        return res.status(400).send("Invalid device address.");
    }
    console.log(new Date().toFormat("YYYY-MM-DD HH24:MI:SS") + " POST " + deviceAddress);
    if (!req.body) {
        return res.status(400).send("Invalid Parameters.");
    }
    const speak = {
        text: req.body.text,
        speaker: req.body.speaker,
        emotion: req.body.emotion,
        emotion_level: req.body.emotion_level
    };
    if(!speak.text) {
        return res.status(400).send("Required String parameter 'text' is not present.");
    }
    Promise.all([connectToCast(deviceAddress), receiveVoicetext(speak), prepareDir(voicedir)]).then((resolves) => {
        return new Promise((resolve, reject) => {
            const client = resolves[0];
            const voicebuf = resolves[1];
            const tmppath = path.join(voicedir, 'tmp-' + crypto.randomBytes(4).readUInt32LE(0) + '.ogg');
            const filepath = safeFilePath(deviceAddress + '.ogg');
            try {
                fs.writeFileSync(tmppath, voicebuf, 'binary');
                fs.renameSync(tmppath, filepath);
            }
            catch(err) {
                return fs.unlink(tmppath, () => {
                    return reject(err);
                });
            }
            const endpointUrl = url.format({
                protocol: 'http',
                port: LISTEN_PORT,
                hostname: getListenAddress(),
                pathname: deviceAddress
            }).toString();
            client.launch(DefaultMediaReceiver, (err, player) => {
                if(err) {
                    return reject(err);
                }
                const media = {
                    contentId: endpointUrl,
                    contentType: 'audio/ogg',
                    streamType: 'BUFFERED'
                };
                player.load(media, {autoplay: true}, (err, status) => {
                    client.close();
                    if(err) {
                        return reject(err);
                    }
                    console.log("Device notified. " + deviceAddress);
                    resolve();
                });
            });
        });
    }).then(() => res.status(200).type('text/plain').send("OK\n")
    ).catch((err) => res.status(400).send(err.toString()));
});

app.get('/:deviceAddress', voiceLimiter, (req, res) => {
    const deviceAddress = validateDeviceAddress(req.params.deviceAddress);
    if (!deviceAddress) {
        return res.status(400).send("Invalid device address.");
    }
    console.log(new Date().toFormat("YYYY-MM-DD HH24:MI:SS") + " GET " + deviceAddress);

    const filepath = safeFilePath(deviceAddress + ".ogg");
    const httperror = (errcode) => {
        switch(errcode) {
            case "EPERM":
                return res.status(403);
            case "ENOENT":
                return res.status(404);
            default:
                return res.status(500);
        }
    }
    try {
        res.setHeader("Content-Length", fs.statSync(filepath).size);
    }
    catch (err) {
        return httperror(err.code).send();
    }
    const filestream = fs.createReadStream(filepath, "binary");
    filestream.on('data', (chunk) => res.write(chunk, "binary"));
    filestream.on('end', () => res.end());
    filestream.on('error', (err) => {
        return httperror(err.code).send();
    });
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
    switch((speaker || '').toUpperCase()) {
        case 'SHOW':   return 'show';
        case 'BEAR':   return 'bear';
        case 'HARUKA': return 'haruka';
        case 'SANTA':  return 'santa';
        case 'TAKERU': return 'takeru';
        default:       return 'hikari';
    }
};

const getEmotion = (emotion=process.env["VOICETEXT_EMOTION"]) => {
    switch((emotion || '').toUpperCase()) {
        case 'ANGER':   return 'anger';
        case 'SADNESS': return 'sadness';
        default:        return 'happiness';
    }
};

const getEmotionLevel = (emotion_level=process.env["VOICETEXT_EMOTION_LEVEL"]) => {
    switch(emotion_level) {
        case 'HIGH':    case 2: return 2;
        case 'SUPER':   case 3: return 3;
        case 'EXTREME': case 4: return 4;
        default:                return 1;
    }
};

const connectToCast = (host) => {
    return new Promise((resolve, reject) => {
        const client = new Castv2Client;
        client.connect(host, () => resolve(client));
        client.on('error', (err) => {
            client.close();
            return reject(err);
        });
    });
};

const receiveVoicetext = (speak) => {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            text: speak.text,
            speaker: getSpeaker(speak.speaker),
            emotion: getEmotion(speak.emotion),
            emotion_level: getEmotionLevel(speak.emotion_level),
            volume: VOICETEXT_VOLUME,
            format: 'ogg',
        });
        const req = https.request({
            hostname: 'api.voicetext.jp',
            path: '/v1/tts',
            method: 'POST',
            auth: `${process.env["VOICETEXT_API_KEY"]}:`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`VoiceText API error: ${res.statusCode} ${Buffer.concat(chunks).toString()}`));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
};

const prepareDir = (dirpath) => {
    return new Promise((resolve, reject) => {
        return fs.mkdir(dirpath, (err) => {
            if (err && err.code !== 'EEXIST') {
                return reject(err);
            }
            return resolve(dirpath);
        });
    });
};

module.exports = { app, validateDeviceAddress, safeFilePath, getSpeaker, getEmotion, getEmotionLevel, getListenAddress };
