#!/usr/bin/env node

const Listr = require( 'listr' );
const program = require( 'commander' );
const pa11y = require( 'pa11y' );
const filenameify = require( 'filenamify' );
const fs = require( 'fs' );
const util = require( 'util' );
const validUrl = require( 'check-valid-url' );

const writeFile = util.promisify( fs.writeFile );

// Handle CLI
program
    .version( '0.1.1' )
    .option( '-a --address [address]', 'Addresses to check. Multiple addresses can be passed as a space-separated string.' )
    .parse( process.argv );


// Escape if everything is terrible.
function checkAddress(address) {
    if (!program.address || program.address.length === 0) {
        throw new Error('No address passed')
    }
}

async function auditAddress(address) {
    return await pa11y( address );
}

function formatResults(audit) {
    return {
        issues: audit.issues.sort((issueA, issueB) => {
            if (issueA.code < issueB.code) {
                return -1;
            }

            if (issueA.code > issueB.code) {
                return 1;
            }

            return 0;
        }),
        ...audit
    }
}

async function writeAudit(audit, address) {
    await writeFile( `${filenameify( address )}.json`, JSON.stringify( audit, null, 2 ) );
}

const tasks = program.address.split( ' ' )
    .map((address) => {
        if (!validUrl.isUrl(address)) {
            throw new Error(`${address} is not a valid url`)
        }
        return address;
    })
    .map( address => {
        return {
            title: `Auditing ${address}`,
            task: async () => {
                let audit = undefined;
                const pipeline = [
                    {
                        title: `Checking ${address}`,
                        task: async () => {
                            audit = await auditAddress(address);
                        }
                    },
                    {
                        title: `Formatting audit`,
                        skip: () => audit === undefined,
                        task: () => {
                            audit = formatResults(audit);
                        }
                    },
                    {
                        title: `Writing file`,
                        skip: () => audit === undefined,
                        task: async () => await writeAudit(audit, address)
                    }
                ]

                return new Listr( pipeline );
            }
        }
    } );

(
    async () => {
        try {
            const lists = new Listr( tasks );
            await lists.run();
        } catch ( error ) {
            console.log( `Something went wrong: ${error.message}` );
        }
    }
)();
