'use strict'
const fs = require('fs')
const path = require('path')
const https = require('https')
const castv2 = require('castv2-client')
const request = require('supertest')
const { app } = require('../app')

describe('POST /:deviceAddress', () => {
    it('無効なデバイスアドレスは400を返す', async () => {
        const res = await request(app).post('/_invalid').send({ text: 'テスト' })
        expect(res.status).toBe(400)
        expect(res.text).toMatch(/Invalid device address/)
    })
    it('textパラメータがない場合は400を返す', async () => {
        const res = await request(app).post('/192.168.1.1').send({})
        expect(res.status).toBe(400)
        expect(res.text).toMatch(/Required String parameter 'text'/)
    })
    it('malformed JSONは400を返す', async () => {
        const res = await request(app)
            .post('/192.168.1.1')
            .set('Content-Type', 'application/json')
            .send('{"invalid json}')
        expect(res.status).toBe(400)
    })
})

describe('GET /:deviceAddress', () => {
    it('無効なデバイスアドレスは400を返す', async () => {
        const res = await request(app).get('/_invalid')
        expect(res.status).toBe(400)
        expect(res.text).toMatch(/Invalid device address/)
    })
    it('存在しないファイルは404を返す', async () => {
        const res = await request(app).get('/192.168.1.100')
        expect(res.status).toBe(404)
    })
})

describe('GET /:deviceAddress (ファイルあり)', () => {
    const voicedir = path.join(__dirname, '..', 'voice')
    const testAddr = '192.168.1.' + (process.pid % 200 + 50)
    const testFile = path.join(voicedir, testAddr + '.ogg')

    beforeAll(() => {
        fs.mkdirSync(voicedir, { recursive: true })
        fs.writeFileSync(testFile, Buffer.from('OggS dummy'))
    })
    afterAll(() => {
        try { fs.unlinkSync(testFile) } catch {}
    })

    it('ファイルが存在すれば200を返す', async () => {
        const res = await request(app).get('/' + testAddr)
        expect(res.status).toBe(200)
    })
})

describe('GET /:deviceAddress (statSync エラー)', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('EPERMは403を返す', async () => {
        const err = Object.assign(new Error('EPERM'), { code: 'EPERM' })
        vi.spyOn(fs, 'statSync').mockImplementationOnce(() => { throw err })
        const res = await request(app).get('/192.168.1.1')
        expect(res.status).toBe(403)
    })
    it('未知のエラーは500を返す', async () => {
        const err = Object.assign(new Error('EIO'), { code: 'EIO' })
        vi.spyOn(fs, 'statSync').mockImplementationOnce(() => { throw err })
        const res = await request(app).get('/192.168.1.1')
        expect(res.status).toBe(500)
    })
})

describe('POST /:deviceAddress (vi.spyOn)', () => {
    const deviceAddr = '192.168.1.1'
    const voicefile = path.join(__dirname, '..', 'voice', deviceAddr + '.ogg')

    beforeAll(() => {
        process.env.LISTEN_ADDRESS = '127.0.0.1'
        vi.spyOn(https, 'request').mockImplementation((opts, cb) => {
            const mockRes = {
                statusCode: 200,
                on: vi.fn((e, h) => {
                    if (e === 'data') h(Buffer.from('OggS mock'))
                    if (e === 'end') h()
                })
            }
            cb(mockRes)
            return { on: vi.fn(), write: vi.fn(), end: vi.fn() }
        })
        vi.spyOn(castv2.Client.prototype, 'connect').mockImplementation(function(host, cb) { cb() })
        vi.spyOn(castv2.Client.prototype, 'on').mockImplementation(function() {})
        vi.spyOn(castv2.Client.prototype, 'close').mockImplementation(function() {})
        vi.spyOn(castv2.Client.prototype, 'launch').mockImplementation(function(App, cb) {
            cb(null, { load: (m, o, cb) => cb(null, {}) })
        })
    })
    afterAll(() => {
        delete process.env.LISTEN_ADDRESS
        vi.restoreAllMocks()
        try { fs.unlinkSync(voicefile) } catch {}
    })

    it('有効なリクエストで200を返す', async () => {
        const res = await request(app).post('/' + deviceAddr).send({ text: 'テスト音声' })
        expect(res.status).toBe(200)
        expect(res.text).toBe('OK\n')
    })

    it('VoiceText APIが非200を返すと400になる', async () => {
        vi.spyOn(https, 'request').mockImplementationOnce((opts, cb) => {
            const mockRes = {
                statusCode: 503,
                on: vi.fn((e, h) => {
                    if (e === 'data') h(Buffer.from('Service Unavailable'))
                    if (e === 'end') h()
                })
            }
            cb(mockRes)
            return { on: vi.fn(), write: vi.fn(), end: vi.fn() }
        })
        const res = await request(app).post('/' + deviceAddr).send({ text: 'テスト' })
        expect(res.status).toBe(400)
    })

    it('Cast接続エラーで400になる', async () => {
        vi.spyOn(castv2.Client.prototype, 'connect').mockImplementationOnce(function() {
            throw new Error('connection refused')
        })
        const res = await request(app).post('/' + deviceAddr).send({ text: 'テスト' })
        expect(res.status).toBe(400)
    })
})
