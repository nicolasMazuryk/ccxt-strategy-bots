import { test } from 'node:test'
import assert from 'node:assert/strict'
import ccxt from 'ccxt'
import { retry } from '../src/utils/retry.js'
import { chunkArray, getDecimals, padNumber, formatNumberWithPrecision } from '../src/utils/utils.js'

test('retry returns the result once a retryable ccxt error clears', async () => {
    let calls = 0
    const result = await retry(async () => {
        calls++
        if (calls < 3) throw new ccxt.NetworkError('boom')
        return 'ok'
    }, { retries: 5, delay: 1 })
    assert.equal(result, 'ok')
    assert.equal(calls, 3)
})

test('retry rethrows non-retryable errors immediately', async () => {
    let calls = 0
    await assert.rejects(
        retry(async () => {
            calls++
            throw new Error('fatal')
        }, { retries: 5, delay: 1 }),
        /fatal/
    )
    assert.equal(calls, 1)
})

test('chunkArray splits an array into fixed-size chunks', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

test('getDecimals counts decimal places', () => {
    assert.equal(getDecimals(0.0001), 4)
    assert.equal(getDecimals(1e-7), 7)
    assert.equal(getDecimals(5), 0)
})

test('formatNumberWithPrecision rounds to the given precision', () => {
    assert.equal(formatNumberWithPrecision(2)(1.23456), 1.23)
    assert.equal(formatNumberWithPrecision(0)(1.6), 2)
})

test('padNumber left-pads to two digits', () => {
    assert.equal(padNumber(7), '07')
})
