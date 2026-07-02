export interface RconPlayer {
    id: string;
    name: string;
    beguid: string;
    ip: string;
    port: string;
    ping: string;
    lobby: boolean;
    /**
     * whether BattlEye has verified the GUID.
     * Stays false forever on servers where BE GUID verification
     * is unavailable/disabled (players show as `guid(?)`).
     */
    verified: boolean;
}

export interface RconBan {
    type: string; // 'ip' | 'guid',
    id: string;
    ban: string;
    time: string;
    reason: string;
}
