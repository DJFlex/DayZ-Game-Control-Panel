import { inject, injectable, singleton } from 'tsyringe';
import { Manager } from '../control/manager';
import { LoggerFactory } from './loggerfactory';
import { IService } from '../types/service';
import { LogLevel } from '../util/logger';
import { HTTPSAPI, InjectionTokens } from '../util/apis';
import { request } from '../util/request';

/**
 * Turns SteamID64s into Steam persona names.
 *
 * WHY THIS EXISTS
 * ---------------
 * The player list shows the name BattlEye was given at connect, and some clients
 * send nothing - so those players appear as "Survivor", DayZ's default. Two of
 * this server's testers had done so on every single sample ever recorded, which
 * makes the admin tools nearly useless for telling people apart.
 *
 * Steam knows the answer, and the server already has an API key configured (it
 * was added for the Workshop search on the Mods page). One call resolves up to
 * 100 ids at a time.
 *
 * Cached, because persona names change about once a year and the player list is
 * polled every few seconds.
 */
@singleton()
@injectable()
export class SteamPersonas extends IService {

    /** Steam allows 100 ids per call. */
    private static readonly BATCH = 100;

    /** Persona names barely ever change; the list is polled constantly. */
    private static readonly TTL_MS = 60 * 60 * 1000;

    private cache = new Map<string, { name: string; at: number }>();

    public constructor(
        loggerFactory: LoggerFactory,
        private manager: Manager,
        @inject(InjectionTokens.https) private https: HTTPSAPI,
    ) {
        super(loggerFactory.createLogger('SteamPersonas'));
    }

    /**
     * SteamID64 -> persona name, for whatever could be resolved.
     *
     * Never throws and never blocks a caller: no API key, a Steam outage or a
     * malformed reply all just mean an empty map, and the caller keeps whatever
     * name it already had. A missing persona must never cost anyone their
     * player list.
     */
    public async resolve(steamIds: string[]): Promise<Map<string, string>> {
        const out = new Map<string, string>();
        const key = this.manager.config?.steamApiKey;
        if (!key || !steamIds?.length) return out;

        const now = Date.now();
        const missing: string[] = [];

        for (const id of new Set(steamIds.filter((x) => !!x))) {
            const hit = this.cache.get(id);
            if (hit && (now - hit.at) < SteamPersonas.TTL_MS) {
                if (hit.name) out.set(id, hit.name);
            } else {
                missing.push(id);
            }
        }
        if (!missing.length) return out;

        for (let i = 0; i < missing.length; i += SteamPersonas.BATCH) {
            const batch = missing.slice(i, i + SteamPersonas.BATCH);
            try {
                const url = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/'
                    + `?key=${encodeURIComponent(key)}`
                    + `&steamids=${batch.join(',')}`;

                const res = await request(this.https, url, { method: 'GET' });
                if (res.statusCode !== 200) {
                    this.log.log(LogLevel.WARN, `Steam persona lookup failed: HTTP ${res.statusCode}`);
                    continue;
                }

                const players = JSON.parse(res.body)?.response?.players ?? [];
                for (const p of players) {
                    if (!p?.steamid) continue;
                    const name = String(p.personaname || '').trim();
                    this.cache.set(p.steamid, { name, at: now });
                    if (name) out.set(p.steamid, name);
                }

                // Anything Steam did not answer for gets a negative cache entry, so a
                // private or deleted account is not re-queried every few seconds.
                for (const id of batch) {
                    if (!this.cache.has(id)) this.cache.set(id, { name: '', at: now });
                }
            } catch (e: any) {
                this.log.log(LogLevel.WARN, `Steam persona lookup threw: ${e?.message}`);
            }
        }

        return out;
    }
}
