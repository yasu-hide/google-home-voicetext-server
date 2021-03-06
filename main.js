'use strict'
require('date-utils');
const Castv2Client = require("castv2-client").Client;
const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
const express = require('express');
const bodyParser = require('body-parser');
const fs = require("fs");
const os = require('os');
const url = require("url");
const path = require('path');
const crypto = require('crypto');
const VoiceText = require("voicetext");

const VOICETEXT_API_KEY = process.env["VOICETEXT_API_KEY"];
const VOICETEXT_VOLUME = process.env["VOICETEXT_VOLUME"] || 150;
const LISTEN_PORT = process.env["LISTEN_PORT"] || 8080;
const voicedir = path.join(__dirname, 'voice');

if(!VOICETEXT_API_KEY) {
    throw new Error("VOICETEXT_API_KEY is required.");
}

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
const voice = new VoiceText(VOICETEXT_API_KEY);

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

app.post('/:deviceAddress', (req, res) => {
    const deviceAddress = req.params.deviceAddress;
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
            const filepath = path.join(voicedir, deviceAddress + '.ogg');
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
                    resolve("OK");
                });
            });
        });
    }).then((success) => res.status(200).send(success + " Say:" + speak.text + "\n")
    ).catch((err) => res.status(400).send(err.toString()));
});

app.get('/:deviceAddress', (req, res) => {
    const deviceAddress = req.params.deviceAddress;
    console.log(new Date().toFormat("YYYY-MM-DD HH24:MI:SS") + " GET " + deviceAddress);

    const filepath = path.join(voicedir, deviceAddress + ".ogg");
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
    switch(speaker.toUpperCase()) {
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
    switch(emotion.toUpperCase()) {
        case 'HAPPINESS':
            return voice.EMOTION.HAPPINESS;
        case 'ANGER':
            return voice.EMOTION.ANGER;
        case 'SADNESS':
            return voice.EMOTION.SADNESS;
        default:
            return voice.EMOTION.HAPPINESS;
    }
};

const getEmotionLevel = (emotion_level=process.env["VOICETEXT_EMOTION_LEVEL"]) => {
    switch(emotion_level) {
        case 'NORMAL':
        case 1:
            return voice.EMOTION_LEVEL.NORMAL;
        case 'HIGH':
        case 2:
            return voice.EMOTION_LEVEL.HIGH;
        case 'SUPER':
        case 3:
            return voice.EMOTION_LEVEL.SUPER;
        case 'EXTREME':
        case 4:
            return voice.EMOTION_LEVEL.EXTREME;
        default:
            return voice.EMOTION_LEVEL.NORMAL;
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
        voice
        .speaker(getSpeaker(speak.speaker))
        .emotion(getEmotion(speak.emotion))
        .emotion_level(getEmotionLevel(speak.emotion_level))
        .volume(VOICETEXT_VOLUME)
        .format(voice.FORMAT.OGG)
        .speak(speak.text, (err, voicebuf) => {
            if(err) {
                return reject(err);
            }
            return resolve(voicebuf);
        });
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

app.listen(LISTEN_PORT, () => {
    console.log('Start server', getListenAddress() + ':' + LISTEN_PORT);
});