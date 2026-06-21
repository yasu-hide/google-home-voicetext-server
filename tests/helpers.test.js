'use strict'
const os = require('os')
const { validateDeviceAddress, safeFilePath, getSpeaker, getEmotion, getEmotionLevel, getListenAddress } = require('../app')

describe('validateDeviceAddress', () => {
    it('有効なIPアドレスを返す', () => {
        expect(validateDeviceAddress('192.168.1.1')).toBe('192.168.1.1')
    })
    it('有効なホスト名を返す', () => {
        expect(validateDeviceAddress('my-device.local')).toBe('my-device.local')
    })
    it('空文字列はnullを返す', () => {
        expect(validateDeviceAddress('')).toBeNull()
    })
    it('nullはnullを返す', () => {
        expect(validateDeviceAddress(null)).toBeNull()
    })
    it('アンダースコア始まりはnullを返す', () => {
        expect(validateDeviceAddress('_invalid')).toBeNull()
    })
    it('スラッシュを含む文字列はnullを返す', () => {
        expect(validateDeviceAddress('a/b')).toBeNull()
    })
})

describe('safeFilePath', () => {
    it('有効なファイル名のパスを返す', () => {
        const result = safeFilePath('192.168.1.1.ogg')
        expect(result).toMatch(/192\.168\.1\.1\.ogg$/)
    })
    it('ディレクトリトラバーサルはnullを返す', () => {
        expect(safeFilePath('../../etc/passwd')).toBeNull()
    })
    it('../を含むファイル名はnullを返す', () => {
        expect(safeFilePath('../outside.ogg')).toBeNull()
    })
})

describe('getSpeaker', () => {
    it('SHOWはshowを返す', () => {
        expect(getSpeaker('SHOW')).toBe('show')
    })
    it('BEARはbearを返す', () => {
        expect(getSpeaker('BEAR')).toBe('bear')
    })
    it('HARUKAはharukaを返す', () => {
        expect(getSpeaker('HARUKA')).toBe('haruka')
    })
    it('SANTAはsantaを返す', () => {
        expect(getSpeaker('SANTA')).toBe('santa')
    })
    it('TAKERUはtakeruを返す', () => {
        expect(getSpeaker('TAKERU')).toBe('takeru')
    })
    it('未知の値はhikariを返す', () => {
        expect(getSpeaker('UNKNOWN')).toBe('hikari')
    })
    it('空文字列はhikariを返す', () => {
        expect(getSpeaker('')).toBe('hikari')
    })
})

describe('getEmotion', () => {
    it('ANGERはangerを返す', () => {
        expect(getEmotion('ANGER')).toBe('anger')
    })
    it('SADNESSはsadnessを返す', () => {
        expect(getEmotion('SADNESS')).toBe('sadness')
    })
    it('未知の値はhappinessを返す', () => {
        expect(getEmotion('UNKNOWN')).toBe('happiness')
    })
    it('空文字列はhappinessを返す', () => {
        expect(getEmotion('')).toBe('happiness')
    })
})

describe('getEmotionLevel', () => {
    it('HIGHは2を返す', () => {
        expect(getEmotionLevel('HIGH')).toBe(2)
    })
    it('SUPERは3を返す', () => {
        expect(getEmotionLevel('SUPER')).toBe(3)
    })
    it('EXTREMEは4を返す', () => {
        expect(getEmotionLevel('EXTREME')).toBe(4)
    })
    it('数値2は2を返す', () => {
        expect(getEmotionLevel(2)).toBe(2)
    })
    it('文字列"2"のHTTP経由ケース（実装バグの確認）', () => {
        // HTTP経由では文字列が来るが、実装は case 2 (数値) にのみマッチする
        // このテストで実装の現状（文字列"2"はdefault=1を返す）を明文化する
        expect(getEmotionLevel('2')).toBe(1)
    })
    it('未知の値は1を返す', () => {
        expect(getEmotionLevel('NORMAL')).toBe(1)
    })
    it('undefinedは1を返す', () => {
        expect(getEmotionLevel(undefined)).toBe(1)
    })
})

describe('getListenAddress', () => {
    const origListenAddress = process.env.LISTEN_ADDRESS
    afterEach(() => {
        if (origListenAddress === undefined) delete process.env.LISTEN_ADDRESS
        else process.env.LISTEN_ADDRESS = origListenAddress
        delete process.env.LISTEN_INTERFACE
        vi.restoreAllMocks()
    })
    it('LISTEN_ADDRESSが設定されていれば返す', () => {
        process.env.LISTEN_ADDRESS = '192.168.1.50'
        expect(getListenAddress()).toBe('192.168.1.50')
    })
    it('どちらも未設定の場合はthrowする', () => {
        delete process.env.LISTEN_ADDRESS
        expect(() => getListenAddress()).toThrow('LISTEN_ADDRESS or LISTEN_INTERFACE required')
    })
    it('有効なLISTEN_INTERFACEはIPv4アドレスを返す', () => {
        delete process.env.LISTEN_ADDRESS
        process.env.LISTEN_INTERFACE = 'eth0'
        vi.spyOn(os, 'networkInterfaces').mockReturnValueOnce({
            eth0: [{ family: 'IPv4', address: '10.0.0.1' }]
        })
        expect(getListenAddress()).toBe('10.0.0.1')
    })
    it('存在しないLISTEN_INTERFACEはTypeErrorで落ちる（本番バグ再現）', () => {
        delete process.env.LISTEN_ADDRESS
        process.env.LISTEN_INTERFACE = 'nonexistent'
        vi.spyOn(os, 'networkInterfaces').mockReturnValueOnce({})
        expect(() => getListenAddress()).toThrow(TypeError)
    })
})
