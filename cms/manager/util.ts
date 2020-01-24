
export function titleFromArgs(args : any) {
    const builder = args.builder;
    args = {...args};
    delete args.builder;
    const values = Object.entries(args).map(([k, v]) => v);
    if (values.length) {
        return `${builder}: ${values.join("/")}`;
    } else {
        return builder;
    }
}
