
// TODO: put in own module so we dont have a dependency on js-yaml peek out?
// TODO: validation that integrates w/ typescript

import yaml from 'js-yaml'
import Unit from '../unit.js';

module.exports = function(unit : Unit, args : Record<string, unknown>, text : string | null) {
    if (text === null) return;
    let input = yaml.safeLoad(text);
    for (let {argspec : argspecs, users, alertOn} of input) {
        if (!Array.isArray(argspecs)) {
            argspecs = [argspecs];
        }

        if (!alertOn || !Array.isArray(alertOn)) {
            throw new Error('alertOn needs to be array');
        }

        for (let argspec of argspecs) {
            let args = JSON.stringify(argspec);
            let on_submission = false;
            let on_write = false;
            for (let ao of alertOn) {
                if (ao === 'submission')
                    on_submission = true;
                else if (ao === 'write')
                    on_write = true;
                else
                    throw new Error(`unknown alertOn value ${JSON.stringify(ao)}`);
            }
            unit.add({alerts: users.map((user_id : any) => ({args, user_id, on_submission, on_write}))});
        }
    }
}
