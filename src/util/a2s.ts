import * as dgram from 'dgram';

export interface A2SInfo {
    name: string;
    map: string;
    players: number;
    maxPlayers: number;
    /** Server tags. DayZ puts its in-game clock last, e.g. "...,mod,12:01". */
    keywords?: string;
}

/** DayZ's in-game time from the tags ("12:01"), or undefined. It stands still while the world loads. */
export const dayzClock = (info?: A2SInfo | null): string | undefined => {
    const tags = info?.keywords?.split(',') ?? [];
    for (let i = tags.length - 1; i >= 0; i--) {
        if (/^\d{1,2}:\d{2}$/.test(tags[i].trim())) return tags[i].trim();
    }
    return undefined;
};

const A2S_INFO_REQUEST = Buffer.concat([
    Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54]),
    Buffer.from('Source Engine Query\0', 'latin1'),
]);

const readCString = (buf: Buffer, offset: number): [string, number] => {
    let end = buf.indexOf(0, offset);
    if (end < 0) end = buf.length;
    return [buf.toString('utf8', offset, end), end + 1];
};

/**
 * Parses an A2S_INFO reply (header FF FF FF FF 'I').
 * Exported for tests.
 */
export const parseA2SInfo = (msg: Buffer): A2SInfo | null => {
    if (msg.length < 6 || msg.readInt32LE(0) !== -1 || msg[4] !== 0x49) {
        return null;
    }
    let off = 6; // header + type + protocol
    let name: string;
    let map: string;
    [name, off] = readCString(msg, off);
    [map, off] = readCString(msg, off);
    [, off] = readCString(msg, off); // folder
    [, off] = readCString(msg, off); // game
    off += 2; // app id
    if (off + 2 > msg.length) {
        return null;
    }
    const players = msg[off];
    const maxPlayers = msg[off + 1];
    off += 3; // players, max, bots
    off += 4; // server type, environment, visibility, VAC
    let keywords: string | undefined;
    try {
        [, off] = readCString(msg, off); // version
        const edf = off < msg.length ? msg[off++] : 0;
        if (edf & 0x80) off += 2; // game port
        if (edf & 0x10) off += 8; // steam id
        if (edf & 0x40) { off += 2; [, off] = readCString(msg, off); } // spectator port + name
        if (edf & 0x20) [keywords] = readCString(msg, off);
    } catch {
        // tags are optional
    }
    return {
        name,
        map,
        players,
        maxPlayers,
        keywords,
    };
};

/**
 * Minimal Steam A2S_INFO query (with the 2020 challenge step).
 * Resolves null when the server does not answer in time.
 */
export const queryA2SInfo = (host: string, port: number, timeoutMs = 1500): Promise<A2SInfo | null> => {
    return new Promise((resolve) => {
        let done = false;
        const socket = dgram.createSocket('udp4');
        const finish = (result: A2SInfo | null): void => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try {
                socket.close();
            } catch {
                // already closed
            }
            resolve(result);
        };
        const timer = setTimeout(() => finish(null), timeoutMs);

        socket.on('error', () => finish(null));
        socket.on('message', (msg) => {
            if (msg.length >= 9 && msg.readInt32LE(0) === -1 && msg[4] === 0x41) {
                // challenge: repeat the request with the 4 challenge bytes appended
                socket.send(Buffer.concat([A2S_INFO_REQUEST, msg.slice(5, 9)]), port, host);
                return;
            }
            finish(parseA2SInfo(msg));
        });
        try {
            socket.send(A2S_INFO_REQUEST, port, host, (err) => {
                if (err) finish(null);
            });
        } catch {
            finish(null);
        }
    });
};
