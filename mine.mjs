// A tool to explore caves, adventure, and find riches.
// https://github.com/dmptrluke/ramen

import { BigNumber } from "@ethersproject/bignumber"
import { Contract } from "@ethersproject/contracts"
import { JsonRpcProvider } from "@ethersproject/providers";
import { keccak256 } from "@ethersproject/solidity";
import { parseUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet"
import { randomBytes } from "crypto";

import config from './config.json'
import ABI_FANTOM_GEM from "./abi/gem.json";

const value = process.argv[2];

process.stdout.write('Process ' + value + ' beginning.');

let wallet;

const provider = new JsonRpcProvider(config.network.rpc);

// if auto-claim is enabled, load the users private key
if ('claim' in config) {
    wallet = new Wallet(config.claim.private_key, provider);
}

const provably = new Contract(config.network.gem_address, ABI_FANTOM_GEM, wallet);
const mining_target = config.address;
let nonce = await provably.nonce(mining_target);

/**
 * Take a salt and calls the mine() function the the gem contract.
 * @param {BN} salt A previously-verified salt to process.
 */
async function mine(salt) {
    try {
        const estimated_gas = await provably.estimateGas.mine(config.gem_type, salt.toString())

        process.stdout.write(`Estimated gas required to claim is ${estimated_gas.toString()}.`);
    } catch (error) {
        // if the required gas is over 100k, this gem is probably unminable
        process.stdout.write('The gas required to claim this gem is too high, it is invalid or has already been mined.');
        nonce = nonce.add(1);
        return;
    }

    if ('claim' in config) {
        let max_price;
        const gas_price = await provider.getGasPrice();

        if ('maximum_gas_price' in config.claim) {
            max_price = parseUnits(config.claim.maximum_gas_price.toString(), "gwei")
        } else {
            max_price = parseUnits("1", "gwei")
        }

        if (gas_price.gt(max_price)) {
            process.stdout.write(`Current network gas price is ${parseUnits(gas_price.toString(), "gwei")} GWEI, above your price limit of ${parseUnits(max_price.toString(), "Gwei")} GWEI. Not claiming.`);
            return;
        }

        try {

            const transaction = await provably.mine(config.gem_type, salt, {
                from: config.address,
                gasPrice: gas_price,
                gasLimit: 120000
            })

            process.stdout.write('Claim transaction submitted...')
            process.stdout.write(`https://ftmscan.com/tx/${transaction.hash}`)

            await transaction.wait();

            nonce = nonce.add(1);

            process.stdout.write(`Done!`)
        } catch (error) {
            process.stdout.write('Error', error)
        }
    }
}

/**
 * Calls the gems() function on the gem contract to get the current
 * entropy, difficult, and nonce.
 */
async function getState() {
    const { entropy, difficulty } = await provably.gems(config.gem_type);
    const calulated_difficulty = (BigNumber.from(2)).pow(BigNumber.from(256)).div(BigNumber.from(difficulty));
    return { entropy, difficulty, calulated_difficulty, nonce };
};

function hash(state) {
    const salt = BigNumber.from(`0x${(randomBytes(32)).toString("hex")}`);
    const result = BigNumber.from(`0x${keccak256(["uint256",
        "bytes32", "address",
        "address",
        "uint",
        "uint",
        "uint"], [config.network.chain_id, state.entropy, config.network.gem_address, mining_target, config.gem_type, state.nonce, salt]
    ).slice(2)}`);

    return { salt, result }
}

let cancel = false;

async function loop() {
    process.stdout.write('You find a new branch of the cave to mine and head in.');

    // get the inital contract state
    const state = await getState();

    let i = 0;
    while (!cancel) {
        let iteration = hash(state);

        i += 1;
        if (state.calulated_difficulty.gte(iteration.result)) {
            process.stdout.write(`You stumble upon a vein of type "${config.gem_type}" gems!`);
            process.stdout.write(`KIND: ${config.gem_type} SALT: ${iteration.salt}`);

            await mine(iteration.salt);

            if (config.ding) {
                process.stdout.write('\u0007');
            }
            cancel = true;
        }

        if (i % 2000000 == 0) {
            getState().then((x) => { state = x });
            process.stdout.write(`Iteration: ${i}, Difficulty: ${state.difficulty}`);
        }

        if (i % 2000 == 0) {
            // pause every 2000 iterations to allow other async operations to process
            await new Promise(r => setTimeout(r, 1));
        }
    }
    cancel = false;
};

async function main() {
    process.stdout.write(`You venture into the mines in search of gem type "${config.gem_type}"...`);
    if (config.loop) {
        while (true) {
            await loop();
        }
    } else {
        await loop();
    }
};

main();
