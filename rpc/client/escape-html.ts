// Adapted from https://github.com/plexis-js/plexis/blob/master/packages/escapeHTML/src/index.js

const map = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#039;']
]);

export default function (text : string) {
    return text.replace(/[&<>"']/g, function(m : string) {
        return map.get(m) as string;
    });
};

