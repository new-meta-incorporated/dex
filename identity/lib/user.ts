
import mysql from 'mysql2/promise';
import SQL from 'sql-template-strings';

export type Group =
    'badgeholder'
    | 'tournament_director'
    | 'site_staff'
    | 'wifi_staff'
    | 'banned'
    | 'wifi_blacklist'
    | 'master_key'
    | 'tier_leader';


export type User = {
    user_id : number,
    username : string,
    groups : Set<Group>
};

const GROUPS : Map<number, Group>= new Map([
    [12, 'badgeholder'],
    [20, 'tournament_director'],
    [21, 'site_staff'],
    [166, 'wifi_staff'],
    [172, 'banned'],
    [206, 'wifi_blacklist'],
    [332, 'master_key'],
    [435, 'tier_leader']
]);

export async function lookup(conn : mysql.Connection, user_id : number) : Promise<User | null> {
    // secondary_group_ids is varbinary for some reason...
    const q = SQL`
    SELECT username, user_group_id, CAST(secondary_group_ids AS char) as secondary_group_ids
    FROM xf_user
    WHERE user_id = ${user_id}`;
    const [rows] = await conn.query(q) as [mysql.RowDataPacket[], unknown];
    if (rows.length !== 1)
        return null;

    const {username, user_group_id, secondary_group_ids} = rows[0];

    const groups = new Set<Group>();
    for (const group of [user_group_id, ...secondary_group_ids.split(",")]) {
        let groupName = GROUPS.get(parseInt(group, 10));
        if (groupName !== undefined) {
            groups.add(groupName);
        }
    }
    return {user_id, username, groups};
}
