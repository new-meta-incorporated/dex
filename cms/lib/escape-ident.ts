
export default function escapeIdent(ident : string) {
    ident = ident.replace(/\"/g, '""');
    return `"${ident}"`;
}
