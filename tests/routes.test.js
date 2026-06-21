'use strict'
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
