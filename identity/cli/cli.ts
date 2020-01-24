
import "make-promises-safe";
import "source-map-support/register.js";

import program from "commander";
import {Session, parse} from "@smogon/identity";

program.option('--db <connection string>', 'Database connection string');

program
    .command('verify <xf_user>')
    .action(async (xf_user) => {
        let session = new Session(JSON.parse(program.db));

        xf_user = decodeURIComponent(xf_user);

        let remember = parse(xf_user);

        if (remember === null) {
            console.log(`Can't parse remember token.`)
            process.exit(1);
        } else {
            let result = await session.validateLookup(remember);
            if (result === null) {
                console.log(`Invalid remember token.`);
                process.exit(1);
            } else {
                console.log(result);
                process.exit(0);
            }
        }
    });

program
    .command('lookup <user_id>')
    .action(async (user_id_str) => {
        const session = new Session(JSON.parse(program.db));
        const user_id = parseInt(user_id_str);
        const user = await session.lookup(user_id);

        if (user === null) {
            console.log(`User id ${user_id} doesn't exist.`);
            process.exit(1);
        } else {
            console.log(user);
            process.exit(0);
        }
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}
