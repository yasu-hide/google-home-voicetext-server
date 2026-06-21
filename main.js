'use strict'
const { app, getListenAddress } = require('./app');

const VOICETEXT_API_KEY = process.env["VOICETEXT_API_KEY"];
const LISTEN_PORT = process.env["LISTEN_PORT"] || 8080;

if (!VOICETEXT_API_KEY) {
    throw new Error("VOICETEXT_API_KEY is required.");
}

app.listen(LISTEN_PORT, () => {
    console.log('Start server', getListenAddress() + ':' + LISTEN_PORT);
});
