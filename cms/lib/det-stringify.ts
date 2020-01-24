
// From smogon/util, may want to move this to a monorepo-wide util

export default function detStringify(obj : any) : string {
    // String, number, null
    if (typeof obj !== 'object' || obj === null) {
        return JSON.stringify(obj);
    } else if (Array.isArray(obj)) {
        let s = '[';
        for (let i = 0; i < obj.length; i++) {
            if (i > 0)
                s += ",";
            s += detStringify(obj[i]);
        }
        s += ']';
        return s;
    } else {
        // The non-deterministic part: maps.
        let keys = Object.keys(obj);
        keys.sort();
        let s = '{';
        for (let i = 0; i < keys.length; i++) {
            if (i > 0)
                s += ",";
            s += JSON.stringify(keys[i]) + ":" + detStringify(obj[keys[i]]);
        }
        s += '}';
        return s;
    }
}
