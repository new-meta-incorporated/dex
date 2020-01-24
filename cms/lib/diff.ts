
// TODO: do a better job typescripting this

// @ts-ignore
import {SequenceMatcher} from 'difflib';

// Fix weird Python indexed opcode
// [[tag, olo, ohi, nlo, nhi]] -> [{tag, oTokens, nTokens, tokens}]
//
// tokens is a convienence field that indicates the primary source of tokens;
// for replace this is null, for delete its the same as oTokens, for insert its
// the same as nTokens. if equal, all fields are the same.
//
// Consider these immutable.
function resolveOpcodes(oTokens : any, nTokens : any, opcodes : any) {
    let result = []
    for (let [tag, olo, ohi, nlo, nhi] of opcodes) {
        if (tag === 'equal') {
            let tokens = oTokens.slice(olo, ohi)
            result.push({tag, oTokens: tokens, nTokens: tokens, tokens})
        }
        else if (tag === 'replace') {
            result.push({tag, oTokens: oTokens.slice(olo, ohi), nTokens: nTokens.slice(nlo, nhi), tokens: null})
        }
        else if (tag === 'delete') {
            let tokens = oTokens.slice(olo, ohi)
            result.push({tag, oTokens: tokens, nTokens: [], tokens})
        }
        else if (tag === 'insert') {
            let tokens = nTokens.slice(nlo, nhi)
            result.push({tag, oTokens: [], nTokens: tokens, tokens})
        }
    }
    return result
}

// [{tag, oTokens, nTokens, tokens}] -> [{tag, tokens}]
function eliminateReplaces(opcodes : any) {
    let result = []
    for (let {tag, oTokens, nTokens, tokens} of opcodes) {
        if (tag === 'replace') {
            result.push({tag: 'delete', tokens: oTokens})
            result.push({tag: 'insert', tokens: nTokens})
        } else {
            result.push({tag, tokens})
        }
    }
    return result
}

// [{tag, tokens}] -> [{tag, token}]
// (doesn't make sense unless you eliminate replaces)
function ungroupOpcodes(opcodes : any) {
    let result = []
    for (let {tag, tokens} of opcodes) {
        for (let token of tokens) {
            result.push({tag, token})
        }
    }
    return result;
}

// If context is -1 we don't technically use getGroupedOpcodes, but instead wrap
// getOpcodes in a single list. It's convenient to preserve types here.
export function diffGrouped(oTokens : any, nTokens : any, {context=-1, replace=false} : any={}) {
    let sm = new SequenceMatcher(null, oTokens, nTokens)
    let opgroups = context < 0 ? [sm.getOpcodes()] : sm.getGroupedOpcodes(context)

    opgroups = opgroups.map((opcodes : any) => resolveOpcodes(oTokens, nTokens, opcodes))

    if (!replace) {
        opgroups = opgroups.map((opcodes : any) => eliminateReplaces(opcodes))
    }
    return opgroups
}

// Always returns the first group. This works as expected if context=-1
export function diff(oTokens : any, nTokens : any, options? : any) {
    return diffGrouped(oTokens, nTokens, options)[0]
}

////////////////////////////////////////////////////////////////////////////////
// Diff3
////////////////////////////////////////////////////////////////////////////////

// For more info on diff3, see
// http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf
//
// (tokens, tokens, tokens) -> [{syncToken, aOpcodes, bOpcodes}]
//
// Last chunk always has a null syncToken.
export function diff3(baseTokens : any, aTokens : any, bTokens : any) {
    let aDiff = ungroupOpcodes(diff(baseTokens, aTokens))
    let bDiff = ungroupOpcodes(diff(baseTokens, bTokens))

    let chunks = []
    let aOpcodes = []
    let bOpcodes = []

    // bDiff search needs to be stateful so we can "resume" at each new
    // synchronization point. Take iterator explicitly.
    let bDiffIter = bDiff[Symbol.iterator]()

    for (let aOpcode of aDiff) {
        if (aOpcode.tag == 'insert') {
            // Not a synchronizable opcode, add it to the current chunk.
            aOpcodes.push(aOpcode)
        } else {
            // Found a synchronization point! Scan bDiff until the next synchronization point.
            for (let bOpcode of bDiffIter) {
                if (bOpcode.tag === 'insert') {
                    // Not a synchronizable opcode, add it to the current chunk.
                    bOpcodes.push(bOpcode)
                } else {
                    // Found synchronization point. Handle it and break search.
                    //
                    // Note that aOpcode.token === bOpcode.token
                    if (aOpcode.tag === 'equal' && bOpcode.tag === 'equal') {
                        // Synchronization was successful! Flush chunk.
                        chunks.push({syncToken: bOpcode.token, aOpcodes, bOpcodes})
                        aOpcodes = []
                        bOpcodes = []
                    } else {
                        // Synchronization failed, add to current chunk.
                        aOpcodes.push(aOpcode)
                        bOpcodes.push(bOpcode)
                    }
                    break
                }
            }
        }
    }

    // If there is stuff in bDiffIter after the last synchronization point, we
    // will never reach it. Add it to the last chunk.
    //
    // This never happens for aDiff, it is always iterated until completion.
    bOpcodes.push(...bDiffIter)

    // Add final chunk which contains inserts at the end of the file.
    chunks.push({syncToken: null, aOpcodes, bOpcodes})
    return chunks
}

// FIXME only works on ungrouped variety?
function restore(opcodes : any, which : any) {
    let result = []
    for (let {tag, token} of opcodes) {
        if (tag === 'equal' ||
            tag === 'delete' && which === 'old' ||
            tag === 'insert' && which === 'new')
            result.push(token)
    }
    return result
}

// XXX should this be a general utility method?
function arraysEqual(a : any, b : any) {
    if (a === b) return true
    if (a.length !== b.length) return false

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false
    }

    return true
}

// (baseTokens, aTokens, bTokens) -> [{baseTokens, aTokens, bTokens} | {tokens}]
//
// They alternate!
export function merge(baseTokens : any, aTokens : any, bTokens : any) {
    let chunks = diff3(baseTokens, aTokens, bTokens)
    let stableTokens : any[] = []
    let result = []

    function pushStable() {
        if (stableTokens.length) {
            result.push({tokens: stableTokens})
            stableTokens = []
        }
    }

    for (let {syncToken, aOpcodes, bOpcodes} of chunks) {
        let base = restore(aOpcodes, 'old')
        let a = restore(aOpcodes, 'new')
        let b = restore(bOpcodes, 'new')
        if (arraysEqual(a, b)) {
            stableTokens.push(...a)
        } else if (arraysEqual(base, a)) {
            // Changed in b
            stableTokens.push(...b)
        } else if (arraysEqual(base, b)) {
            // Changed in a
            stableTokens.push(...a)
        } else {
            pushStable()
            result.push({baseTokens: base,
                         aTokens: a,
                         bTokens: b})
        }
        if (syncToken !== null)
            stableTokens.push(syncToken)
    }
    pushStable()
    return result
}
