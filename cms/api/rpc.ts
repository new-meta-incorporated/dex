
import {Handlers} from "@smogon/rpc-server";
import * as session from './session.js';
import * as identity from '@smogon/identity'

async function getLogin({xf_user} : {xf_user : string | null}, require? : identity.Group) {
    if (xf_user === null) {
        throw new Error(`No login cookie`);
    }

    let remember = identity.parse(xf_user);
    if (remember === null) {
        throw new Error(`Can't parse login cookie`);
    }

    let user = await session.identity.validateLookup(remember);

    if (user === null) {
        throw new Error(`Invalid login credentials`);
    }

    if (require !== undefined) {
        if (!user.groups.has('master_key') && !user.groups.has(require)) {
            throw new Error(`Invalid permissions, required: ${require}`);
        }
    }

    return user;
}

export const HANDLERS : Handlers = {
    // TODO: fill these in when porting frontend
    'list-active-revisions': {
        async fn(args : any) {
            return await session.cms.with(async transaction => {
                return await transaction.revisions.listActive({limit: 1});
            })
        }
    }
};
