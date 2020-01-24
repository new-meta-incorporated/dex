
// @ts-ignore
import style from './revision.css.js';
import * as React from 'preact';

import * as rpc from '@smogon/rpc-client';

// @ts-ignore
import ms from '@esm/ms';
import { titleFromArgs } from './util.js';

function RevisionRow(revision: any) {
    return (
        <div className={style.row}>
            <div className={style.summary}><a href=".">{revision.reason}</a> ({titleFromArgs(revision.args)})</div>
            <div className={style.author}>
                by <UserLink user_id={revision.author.id}>{revision.author.name}</UserLink>,
        {" "}<Timestamp time={revision.time} />
            </div>
        </div>
    );
}

function UserLink({ user_id, children }: any) {
    return <a href={`/forums/members/${user_id}`}>{children}</a>;
}

function Timestamp({time}: any) {
    let now = Date.now();
    let then = Date.parse(time);
    return (
        <span title={(new Date(then)).toString()}>{ms(now - then, { long: true })} ago</span>
    );
}


export default class extends React.Component<{}, { revisions: any }> {
    constructor() {
        super();
        this.state = { revisions: undefined };
    }

    async componentDidMount() {
        const revisions = await rpc.rpc('/_rpc', 'list-active-revisions');
        this.setState({ revisions });
    }

    render() {
        if (!this.state.revisions)
            return <div>Loading</div>;

        let rows = [];
        for (let revision of this.state.revisions) {
            rows.push(<RevisionRow {...revision} />);
        }

        return <div>{rows}</div>;
    }
}
