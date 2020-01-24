
import "make-promises-safe";
import "source-map-support/register.js";

import program from "commander";
import {Session, User, Revision} from "@smogon/cms";
import * as cmsfs from "./fs.js";

program.option('--db <connection string>', 'Database connection string');

program
    .command('list-active-revisions')
    .option('--limit <limit>')
    .option('--args <args>')
    .action(async (opts) => {
        let query = {
            limit : opts.limit,
            args : opts.args === undefined ? undefined : JSON.parse(opts.args)
        };

        await Session.with(JSON.parse(program.db), async transaction => {
            let revisions = await transaction.revisions.listActive(query);
            for (let revision of revisions) {
                console.log(revision);
            }
        });
    });

program
    .command('export <path>')
    .option('--args <args>')
    .action(async (p, opts) => {
        let query = {
            args : opts.args === undefined ? undefined : JSON.parse(opts.args)
        };

        await Session.with(JSON.parse(program.db), async transaction => {
            let revisions = await transaction.revisions.listActive(query);

            await cmsfs.dump(p, revisions);
        });
    });

program
    .command('diff <path>')
    .action(async (p, opts) => {
        let revisions = await cmsfs.load(p);
        for (let revision of revisions) {
            // TODO: port diff code
            console.log(revision.page_id, revision.version, revision.args);
        }
    });

function parseCLIUser(s : string | undefined) : User | null {
    if (s === undefined)
        return null;
    let result = s.match(/^(\d+):(.*?)$/);
    if (!result)
        return null;
    return {id: parseInt(result[1]), name:result[2]};
}

program
    .command('import <path>')
    .option('--reason <reason>')
    .option('--author <author>')
    .option('--merger <merger>')
    .action(async (p, opts) => {
        let reason : string = opts.reason;
        if (!reason) {
            console.error("No reason given");
            process.exit(1);
        }

        let author = parseCLIUser(opts.author);
        let merger = parseCLIUser(opts.merger);

        if (author === null) {
            console.error("No author given");
            process.exit(1);
        }

        let revisions = await cmsfs.load(p);

        await Session.with(JSON.parse(program.db), async transaction => {
            if (revisions.length === 0) {
                console.log("No changes to import.");
                return;
            }

            for (let revision of revisions) {
                console.log(revision.page_id, `${revision.version} -> ${revision.version + 1}`, revision.args);
                let writeRevision = {args : revision.args,
                                     text : revision.text,
                                     page_id : revision.page_id,
                                     version : revision.version + 1,
                                     reason,
                                     author: author as User, // TS bug...
                                     merger,
                                     time: new Date};
                let result = await transaction.revisions.write(writeRevision);
                if (result !== 'Success') {
                    // TODO: port diff conflict logic
                    console.error('Conflict');
                    process.exit(1);
                }
            }

            await transaction.build();
            await transaction.commit();
        });
    });


program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}
