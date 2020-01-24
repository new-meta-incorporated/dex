
import * as errors from './errors.js';
export * from './errors.js';

export class PassthroughJSON {
    constructor(public string : string) {}
}

function parseJSON(body : string) {
    try {
        return JSON.parse(body);
    } catch (e) {
        if (e instanceof SyntaxError)
            throw new errors.NetworkError(`Unparseable JSON from server: ${body}`);
        throw e;
    }
}

// TODO: look at fetch?
function remoteCall(path : string, contentType : string, body : string) {
    return new Promise<{status: number, contentType: string, body: string}>
        ((resolve, reject) => {
        let xhr = new XMLHttpRequest();
        xhr.open("POST", path);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.onload = () => {
            const contentType = xhr.getResponseHeader("Content-Type");
            if (contentType === null) {
                reject(new Error("No content-type."));
            } else {
                resolve({status: xhr.status,
                         contentType,
                         body: xhr.responseText});
            }
        }
        xhr.onerror = () => {
            reject(new Error("Network error."));
        }
        xhr.send(body);
    });
}

export function rpcFor(path : string) {
    return function<T>(name : string, args? : any) {
        return rpc<T>(path, name, args);
    }
}

export async function rpc<T>(path : string,
                             fn : string,
                             args : any = new PassthroughJSON('{}')) : Promise<T> {
    let rawArgs : string;
    if (args instanceof PassthroughJSON)
        rawArgs = `{"fn": ${JSON.stringify(fn)}, "args": ${args.string}}`;
    else
        rawArgs = JSON.stringify({fn, args});

    let result;
    try {
        result = await remoteCall(path,
                                  'application/json; charset=utf-8',
                                  rawArgs);
    } catch(e) {
        throw new errors.NetworkError(e.message);
    }

    const {status, contentType, body} = result;

    function abortType() : never {
        throw new errors.NetworkError(`Unexpected response format for error code ${status}: ${JSON.stringify(body)}`);
    }

    if (status === 200) {
        if (contentType.startsWith("application/json")) {
            return parseJSON(body);
        } else if (contentType.startsWith("text/plain")) {
            return body as unknown as T;
        } else {
            abortType();
        }
    } else if (status === 409) {
        if (contentType.startsWith("application/json")) {
            let parsedBody = parseJSON(body);
            if (!Array.isArray(parsedBody) || parsedBody.length !== 2)
                abortType();
            throw new errors.Error(parsedBody[0], parsedBody[1]);
        } else {
            abortType();
        }
    } else {
        if (contentType.startsWith("text/plain")) {
            throw new errors.InternalError(body, false);
        } else if (contentType.startsWith("text/html")) {
            throw new errors.InternalError(body, true);
        } else {
            abortType();
        }
    }
}
