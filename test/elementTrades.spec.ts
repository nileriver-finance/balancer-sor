/*
npx mocha -r ts-node/register test/elementTrades.spec.ts

Uses Element trade test vectors which they use to test Solidity over a wide range of settings.
File saved at: ./testData/elementPools/testTrades.json
Code to generate test vectors:
https://github.com/element-fi/elf-contracts/blob/main/scripts/load-sim-data.sh
*/
require('dotenv').config();
import { expect, assert } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SOR, SwapInfo, SwapTypes } from '../src';
import { bnum } from '../src/utils/bignumber';
import { calcRelativeDiffBn } from './lib/testHelpers';
import { PoolFilter, SubgraphPoolBase } from '../src/types';

import testTrades from './testData/elementPools/testTrades.json';

const gasPrice = bnum('30000000000');
const maxPools = 4;
const chainId = 1;
const provider = new JsonRpcProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURA}`
);

interface TradeData {
    input: {
        amount_in: number;
        x_reserves: number;
        y_reserves: number;
        total_supply: number;
        time: number;
        token_in: string;
        token_out: string;
        direction: string;
    };
    output: {
        amount_out: number;
    };
}

describe(`Tests against Element generated test trade file.`, () => {
    testTrades.trades.forEach(function (trade: TradeData) {
        const description = `correctly trades ${trade.input.amount_in.toString()} ${
            trade.input.token_in
        } for ${trade.input.token_out}. direction: ${trade.input.direction}`;

        it(description, async () => {
            // Parse trade info to pool format
            const poolsFromFile: SubgraphPoolBase[] = [
                {
                    id: 'n/a',
                    address: 'n/a',
                    poolType: 'Element',
                    swapFee: testTrades.init.percent_fee.toString(),
                    totalShares: trade.input.total_supply.toString(),
                    unitSeconds: 1,
                    expiryTime: trade.input.time,
                    principalToken:
                        '0x0000000000000000000000000000000000000001',
                    baseToken: '0x000000000000000000000000000000000000000b',
                    tokens: [
                        {
                            address:
                                '0x0000000000000000000000000000000000000001',
                            balance: trade.input.y_reserves.toString(),
                            priceRate: '1',
                            decimals: 18,
                            weight: null,
                        },
                        {
                            address:
                                '0x000000000000000000000000000000000000000b',
                            balance: trade.input.x_reserves.toString(),
                            priceRate: '1',
                            decimals: 18,
                            weight: null,
                        },
                    ],
                    tokensList: [
                        '0x0000000000000000000000000000000000000001',
                        '0x000000000000000000000000000000000000000b',
                    ],
                },
            ];

            const swapType =
                trade.input.direction === 'out'
                    ? SwapTypes.SwapExactIn
                    : SwapTypes.SwapExactOut;
            const tokenIn =
                trade.input.token_in === 'base'
                    ? '0x000000000000000000000000000000000000000b'
                    : '0x0000000000000000000000000000000000000001';
            const tokenOut =
                trade.input.token_out === 'base'
                    ? '0x000000000000000000000000000000000000000b'
                    : '0x0000000000000000000000000000000000000001';
            const swapAmt = bnum(trade.input.amount_in);

            const sor = new SOR(provider, chainId, null, poolsFromFile);
            // Both tokens use 18 decimals
            sor.swapCostCalculator.setTokenDecimals(tokenIn, 18);
            sor.swapCostCalculator.setTokenDecimals(tokenOut, 18);

            const fetchSuccess = await sor.fetchPools([], false);
            expect(fetchSuccess).to.be.true;

            const swapInfo: SwapInfo = await sor.getSwaps(
                tokenIn,
                tokenOut,
                swapType,
                swapAmt,
                {
                    gasPrice,
                    maxPools,
                    poolTypeFilter: PoolFilter.All,
                    timestamp: 0,
                }
            );

            const amountNormalised = bnum(trade.output.amount_out).times(
                bnum(10 ** 18)
            );

            const relDiffBn = calcRelativeDiffBn(
                swapInfo.returnAmount,
                amountNormalised
            );

            expect(swapInfo.returnAmount.gt(0)).to.be.true;
            const errorDelta = 10 ** -6;
            assert.isAtMost(relDiffBn.toNumber(), errorDelta);
        });
    });
});
