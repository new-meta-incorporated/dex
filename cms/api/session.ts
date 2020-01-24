
import {Session as IdentitySession} from "@smogon/identity";
import {Session as CmsSession} from "@smogon/cms";

export let identity : IdentitySession;
export let cms : CmsSession;

export function init(i : IdentitySession, c : CmsSession) {
    identity = i;
    cms = c;
}
