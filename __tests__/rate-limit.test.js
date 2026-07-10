import { jest } from '@jest/globals';
import { rateLimit, getClientIp, _resetForTests } from '../lib/rate-limit.js';

function makeReq(ip = '1.2.3.4') {
    return { headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: '10.0.0.1' } };
}

const OPTS = { name: 'test-bucket', limit: 2, windowMs: 60 * 1000 };

describe('getClientIp', () => {
    test('takes the first x-forwarded-for segment', () => {
        expect(getClientIp(makeReq('9.9.9.9, 8.8.8.8'))).toBe('9.9.9.9');
    });

    test('falls back to socket address, then "unknown"', () => {
        expect(getClientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } })).toBe('10.0.0.1');
        expect(getClientIp({ headers: {} })).toBe('unknown');
    });
});

describe('in-memory fallback', () => {
    beforeEach(() => {
        _resetForTests();
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    test('allows up to the limit, then blocks with retryAfter', async () => {
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
        const third = await rateLimit(makeReq(), OPTS);
        expect(third.limited).toBe(true);
        expect(third.retryAfter).toBeGreaterThanOrEqual(1);
        expect(third.retryAfter).toBeLessThanOrEqual(60);
    });

    test('separate IPs and buckets have independent windows', async () => {
        await rateLimit(makeReq('1.1.1.1'), OPTS);
        await rateLimit(makeReq('1.1.1.1'), OPTS);
        expect((await rateLimit(makeReq('1.1.1.1'), OPTS)).limited).toBe(true);
        expect((await rateLimit(makeReq('2.2.2.2'), OPTS)).limited).toBe(false);
        expect((await rateLimit(makeReq('1.1.1.1'), { ...OPTS, name: 'other' })).limited).toBe(false);
    });

    test('window expiry resets the count', async () => {
        const nowSpy = jest.spyOn(Date, 'now');
        const base = 1_700_000_000_000;
        nowSpy.mockReturnValue(base);
        await rateLimit(makeReq(), OPTS);
        await rateLimit(makeReq(), OPTS);
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(true);
        nowSpy.mockReturnValue(base + 61 * 1000);
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
        nowSpy.mockRestore();
    });
});

describe('Upstash mode', () => {
    beforeEach(() => {
        _resetForTests();
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    });

    afterEach(() => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        delete global.fetch;
    });

    test('uses INCR pipeline and blocks past the limit', async () => {
        let count = 0;
        global.fetch = jest.fn(async (url, init) => {
            expect(url).toBe('https://fake.upstash.io/pipeline');
            expect(init.headers.Authorization).toBe('Bearer token');
            const body = JSON.parse(init.body);
            expect(body[0][0]).toBe('INCR');
            expect(body[1][0]).toBe('EXPIRE');
            count++;
            return { ok: true, json: async () => [{ result: count }, { result: 1 }] };
        });
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
        const third = await rateLimit(makeReq(), OPTS);
        expect(third.limited).toBe(true);
        expect(third.retryAfter).toBeGreaterThanOrEqual(1);
    });

    test('fails open when Upstash is unreachable', async () => {
        global.fetch = jest.fn(async () => { throw new Error('network down'); });
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
    });

    test('fails open on non-OK responses', async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
        expect((await rateLimit(makeReq(), OPTS)).limited).toBe(false);
    });
});
