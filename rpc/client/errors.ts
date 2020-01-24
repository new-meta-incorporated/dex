
import escape from './escape-html.js';

export class BaseError extends Error {}
export class NetworkError extends BaseError {}
export class InternalError extends BaseError {
    public htmlMessage : string;
    constructor(data : string, isHtml : boolean) {
        super();
        if (isHtml) {
            // From http://stackoverflow.com/a/822464/228394
            // Doesn't have to be super secure
            let text = data.replace(/<[^>]*>?/g, "");
            // Collapse whitespace
            text = text.replace(/\s+/g, " ");
            text = text.trim();
            super(text);
            this.htmlMessage = data;
        } else {
            super(data);
            this.htmlMessage = escape(data);
        }

    }
}

class RemoteError extends BaseError {
    type : string;
    args : unknown;

    constructor(type : string, args : unknown = null) {
        super(type + (args !== null ? ": " + JSON.stringify(args, null, 4) : ""));
        this.type = type;
        this.args = args;
    }

    static is(e : Error, type : unknown) {
        return e instanceof RemoteError && e.type === type;
    }
}

export {RemoteError as Error};
