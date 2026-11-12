import * as dgram from 'dgram';
import * as path from 'path';
import * as crypto from 'crypto';
import * as commentJson from 'comment-json';
import { spawn } from 'cross-spawn';
import { delay, inject, injectable, singleton } from 'tsyringe';
import { Manager } from '../control/manager';
import { IService } from '../types/service';
import { ServerState } from '../types/monitor';
import { FSAPI, InjectionTokens } from '../util/apis';
import { LogLevel } from '../util/logger';
import { detectOS } from '../util/detect-os';
import { queryA2SInfo, A2SInfo, dayzClock } from '../util/a2s';
import { LoggerFactory } from './loggerfactory';
import { Monitor } from './monitor';
import { Paths } from './paths';
import { ProcessEntry, Processes, WindowsProcessFetcher } from './processes';
import { RCON, Packet, PacketType, PacketDirection } from './rcon';

/**
 * One map in maps.json (next to server-manager.json).
 * A new map is added by adding one entry; no code change.
 */
export interface MapEntryConfig {
    id: string;
    name: string;

    /** true = the panel's own server (RoZebud). Start/stop go through the panel's monitor. */
    panelServer?: boolean;

    /** Another machine. Status only (A2S query), no start/stop. */
    host?: string;

    /** Server folder. Default: the panel's serverPath. */
    serverPath?: string;
    /** This map's own copy of the server program, e.g. DayZServer_MapLink.exe. */
    exe?: string;
    /** Copied over `exe` before each start, like the old bat did. Default DayZServer_x64.exe. "" = no copy. */
    copyExeFrom?: string;
    config?: string;
    port?: number;
    queryPort?: number;
    /** BattlEye RCON port (local only). Needed for a clean stop. */
    rconPort?: number;
    profiles?: string;
    /** Default: the top-level `mods` list. */
    mods?: string[];
    serverMods?: string[];
    /** Default: the top-level `params` list. */
    params?: string[];
}

export interface MapsFile {
    mods?: string[];
    params?: string[];
    maps: MapEntryConfig[];
}

export type MapRunState = 'running' | 'starting' | 'stopping' | 'stopped' | 'offline';

export interface MapStatus {
    id: string;
    name: string;
    kind: 'panel' | 'local' | 'remote';
    state: MapRunState;
    port?: number;
    queryPort?: number;
    players?: number;
    maxPlayers?: number;
    serverName?: string;
    world?: string;
    pid?: string;
    startedAt?: string;
    problem?: string;
    lastError?: string;
    canStart: boolean;
    canStop: boolean;
}

export interface MapActionResult {
    ok: boolean;
    message: string;
}

const DEFAULT_PARAMS = ['-dologs', '-adminlog', '-freezecheck'];
const STOP_WAIT_MS = 90000;
const START_GIVE_UP_MS = 5 * 60 * 1000;
const STATUS_CACHE_MS = 2000;
const READY_FALLBACK_MS = 3 * 60 * 1000;
const MAPS_LOCK_MARKER = 'stopped from the Maps page';

const isLocalHost = (host?: string): boolean => !host || ['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase());

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one BattlEye RCON command and resolves true once logged in and sent.
 * #shutdown may close the server before it answers, so a reply is not required.
 */
export const rconOneShot = (
    host: string,
    port: number,
    password: string,
    command: string,
    timeoutMs = 6000,
): Promise<boolean> => new Promise((resolve) => {
    let done = false;
    let sentAt = 0;
    const socket = dgram.createSocket('udp4');
    const finish = (ok: boolean): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(sentCheck);
        try {
            socket.close();
        } catch {
            // already closed
        }
        resolve(ok);
    };
    const timer = setTimeout(() => finish(sentAt > 0), timeoutMs);
    // no reply to the command within 1.5 s: it was sent, call it done
    const sentCheck = setInterval(() => {
        if (sentAt && Date.now() - sentAt > 1500) finish(true);
    }, 250);

    const send = (packet: Packet): void => {
        socket.send(packet.serialize(), port, host);
    };

    socket.on('error', () => finish(sentAt > 0));
    socket.on('message', (msg) => {
        let packet: Packet;
        try {
            packet = Packet.fromBuffer(msg);
        } catch {
            return;
        }
        if (packet.type === PacketType.LOGIN) {
            if (!packet.login) {
                finish(false);
                return;
            }
            send(new Packet(PacketType.COMMAND, PacketDirection.REQUEST, { command, sequence: 0 }));
            sentAt = Date.now();
        } else if (packet.type === PacketType.MESSAGE) {
            // BattlEye wants every server message acknowledged
            send(new Packet(PacketType.MESSAGE, PacketDirection.REQUEST, { sequence: packet.sequence }));
        } else if (packet.type === PacketType.COMMAND && sentAt) {
            finish(true);
        }
    });
    try {
        send(new Packet(PacketType.LOGIN, PacketDirection.REQUEST, { password }));
    } catch {
        finish(false);
    }
});

@singleton()
@injectable()
export class MapServers extends IService {

    private pending = new Map<string, { action: 'starting' | 'stopping'; since: number }>();
    /** Per map: how far the newest .RPT has been read looking for the "ready" line. */
    private rptScan = new Map<string, { file: string; offset: number; ready: boolean }>();
    /** Per map run: the first in-game clock the query showed, and when the query first answered. */
    private clockWatch = new Map<string, { run: string; firstClock?: string; since: number; ready: boolean }>();
    private lastError = new Map<string, string>();
    private rconPasswords = new Map<string, string>();
    private statusCache?: { ts: number; result: MapStatus[] };
    /** Bumped by every start/stop so a status check that began before it is not cached. */
    private generation = 0;

    public constructor(
        loggerFactory: LoggerFactory,
        private manager: Manager,
        private paths: Paths,
        private processes: Processes,
        private windowsProcessFetcher: WindowsProcessFetcher,
        @inject(delay(() => Monitor)) private monitor: Monitor,
        @inject(delay(() => RCON)) private rcon: RCON,
        @inject(InjectionTokens.fs) private fs: FSAPI,
    ) {
        super(loggerFactory.createLogger('Maps'));
    }

    public getMapsFilePath(): string {
        return path.join(this.paths.cwd(), 'maps.json');
    }

    /** Read fresh each time, so a new map shows up without restarting the panel. */
    public readMapsFile(): { file: MapsFile; error?: string } {
        const filePath = this.getMapsFilePath();
        const fallback: MapsFile = {
            maps: [{ id: 'main', name: 'Main server', panelServer: true }],
        };
        if (!this.fs.existsSync(filePath)) {
            return { file: fallback, error: `No maps.json yet (${filePath}). Showing the panel's own server only.` };
        }
        try {
            const parsed = commentJson.parse(
                this.fs.readFileSync(filePath, { encoding: 'utf-8' }) as string,
                undefined,
                true,
            ) as any;
            if (!parsed || !Array.isArray(parsed.maps)) {
                return { file: fallback, error: 'maps.json has no "maps" list.' };
            }
            return { file: parsed as MapsFile };
        } catch (e) {
            return { file: fallback, error: `maps.json could not be read: ${e?.message ?? e}` };
        }
    }

    private serverPathOf(entry: MapEntryConfig): string {
        const base = this.manager.getServerPath();
        if (!entry.serverPath) return base;
        return this.paths.isAbsolute(entry.serverPath) ? entry.serverPath : path.join(base, entry.serverPath);
    }

    private exePathOf(entry: MapEntryConfig): string {
        return path.join(this.serverPathOf(entry), entry.exe ?? '');
    }

    private profilesPathOf(entry: MapEntryConfig): string {
        const profiles = entry.profiles ?? '';
        return this.paths.isAbsolute(profiles) ? profiles : path.join(this.serverPathOf(entry), profiles);
    }

    private kindOf(entry: MapEntryConfig): 'panel' | 'local' | 'remote' {
        if (entry.panelServer) return 'panel';
        return isLocalHost(entry.host) ? 'local' : 'remote';
    }

    /** Returns why this entry cannot be started/stopped, or undefined when it is fine. */
    private validate(entry: MapEntryConfig, all: MapEntryConfig[]): string | undefined {
        if (!entry.id || !entry.name) {
            return 'Needs an "id" and a "name".';
        }
        if (all.filter((x) => x.id === entry.id).length > 1) {
            return `Two maps use the id "${entry.id}".`;
        }
        const kind = this.kindOf(entry);
        if (kind === 'panel') {
            if (all.filter((x) => x.panelServer).length > 1) {
                return 'Only one map can be the panel server.';
            }
            return undefined;
        }
        if (kind === 'remote') {
            return entry.queryPort ? undefined : 'Needs a "queryPort" to show its status.';
        }
        const missing = ['exe', 'config', 'port', 'profiles'].filter((k) => !(entry as any)[k]);
        if (missing.length) {
            return `Missing: ${missing.join(', ')}.`;
        }
        if (this.paths.samePath(this.exePathOf(entry), this.manager.getServerExePath())) {
            return `"${entry.exe}" is the panel server's own program. Give this map its own exe name.`;
        }
        const sameExe = all.filter(
            (x) => this.kindOf(x) === 'local' && x.exe && this.paths.samePath(this.exePathOf(x), this.exePathOf(entry)),
        );
        if (sameExe.length > 1) {
            return `Another map also uses "${entry.exe}". Each map needs its own exe name.`;
        }
        return undefined;
    }

    private async getLocalProcesses(exePaths: string[]): Promise<ProcessEntry[]> {
        if (!exePaths.length) return [];
        if (detectOS() === 'windows') {
            return this.windowsProcessFetcher.getProcessListMatching(
                (p) => exePaths.some((x) => this.paths.samePath(p, x)),
            );
        }
        return (await Promise.all(exePaths.map((x) => this.processes.getProcessList(x)))).flat();
    }

    /**
     * The query port answers ~20 s before players can join (the world is still loading),
     * so "ready" also needs the Central Economy's last init line in the server's newest .RPT.
     * Read incrementally. Returns undefined when there is no RPT to read (then the query alone decides).
     */
    private rptSaysReady(id: string, profilesDir: string, exeName: string): boolean | undefined {
        try {
            const prefix = `${path.parse(exeName).name}_`.toLowerCase();
            const newest = this.fs.readdirSync(profilesDir)
                .map((f) => String(f))
                .filter((f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase().endsWith('.rpt'))
                .map((f) => ({ f, t: this.fs.statSync(path.join(profilesDir, f)).mtimeMs }))
                .sort((a, b) => b.t - a.t)[0];
            if (!newest) return undefined;

            let scan = this.rptScan.get(id);
            if (!scan || scan.file !== newest.f) {
                scan = { file: newest.f, offset: 0, ready: false };
                this.rptScan.set(id, scan);
            }
            if (scan.ready) return true;

            const filePath = path.join(profilesDir, newest.f);
            const size = this.fs.statSync(filePath).size;
            if (size <= scan.offset) return false;
            const len = Math.min(size - scan.offset, 64 * 1024 * 1024);
            const buf = Buffer.alloc(len);
            const fd = this.fs.openSync(filePath, 'r');
            try {
                this.fs.readSync(fd, buf, 0, len, scan.offset);
            } finally {
                this.fs.closeSync(fd);
            }
            if (buf.toString('latin1').includes('[CE][Hive] :: Init sequence finished')) {
                scan.ready = true;
            } else {
                // keep a little overlap so a line split across reads is still found
                scan.offset = Math.max(0, scan.offset + len - 100);
            }
            return scan.ready;
        } catch {
            return undefined;
        }
    }

    /**
     * Green = the query answers AND the world is running. The query answers ~20 s before the
     * world has loaded, so one of these must also hold:
     *  - the "Init sequence finished" line is in the .RPT (DayZ writes the RPT late, so it can lag minutes)
     *  - the in-game clock in the query tags has moved (it stands still while the world loads)
     *  - the query has answered for 3 minutes (so a card can never stay amber forever)
     */
    private isReady(id: string, run: string, a2s: A2SInfo | null, rpt: () => boolean | undefined): boolean {
        if (!a2s) {
            this.clockWatch.delete(id);
            return false;
        }
        let w = this.clockWatch.get(id);
        if (!w || w.run !== run) {
            w = { run, firstClock: dayzClock(a2s), since: Date.now(), ready: false };
            this.clockWatch.set(id, w);
        }
        if (w.ready) return true;
        const clock = dayzClock(a2s);
        if (
            (clock && w.firstClock && clock !== w.firstClock)
            || Date.now() - w.since > READY_FALLBACK_MS
            || rpt() === true
        ) {
            w.ready = true;
        }
        return w.ready;
    }

    private formatCreationDate(raw?: string): string | undefined {
        if (!raw || raw.length < 14) return undefined;
        return `${raw.substr(0, 4)}-${raw.substr(4, 2)}-${raw.substr(6, 2)} ${raw.substr(8, 2)}:${raw.substr(10, 2)}:${raw.substr(12, 2)}`;
    }

    public async getStatus(noCache?: boolean): Promise<{ maps: MapStatus[]; fileError?: string; filePath: string }> {
        const { file, error } = this.readMapsFile();
        if (!noCache && this.statusCache && Date.now() - this.statusCache.ts < STATUS_CACHE_MS) {
            return { maps: this.statusCache.result, fileError: error, filePath: this.getMapsFilePath() };
        }

        const gen = this.generation;
        const entries = file.maps;
        const localEntries = entries.filter((x) => this.kindOf(x) === 'local' && x.exe);
        const procs = await this.getLocalProcesses(localEntries.map((x) => this.exePathOf(x)));

        const maps = await Promise.all(entries.map(async (entry): Promise<MapStatus> => {
            const kind = this.kindOf(entry);
            const problem = this.validate(entry, entries);
            const queryPort = entry.queryPort;
            const a2s: A2SInfo | null = queryPort
                ? await queryA2SInfo(isLocalHost(entry.host) ? '127.0.0.1' : entry.host, queryPort)
                : null;

            const status: MapStatus = {
                id: entry.id,
                name: entry.name,
                kind,
                state: 'stopped',
                port: entry.port ?? (kind === 'panel' ? this.manager.config?.serverPort : undefined),
                queryPort,
                players: a2s?.players,
                maxPlayers: a2s?.maxPlayers,
                serverName: a2s?.name,
                world: a2s?.map,
                problem,
                lastError: this.lastError.get(entry.id),
                canStart: false,
                canStop: false,
            };

            if (kind === 'panel') {
                const st = this.monitor.serverState;
                const held = this.monitor.restartLock || this.fs.existsSync(this.serverLockPath());
                if (st === ServerState.STARTED) {
                    const ready = this.isReady(
                        entry.id,
                        'panel',
                        a2s,
                        () => this.rptSaysReady(entry.id, this.manager.getProfilesPath(), this.manager.config?.serverExe ?? 'DayZServer_x64.exe'),
                    );
                    // not answering while held = it is on its way down, not coming up
                    status.state = ready ? 'running' : (held ? 'stopping' : 'starting');
                } else if (st === ServerState.STARTING) {
                    status.state = 'starting';
                } else if (st === ServerState.STOPPING) {
                    status.state = 'stopping';
                } else {
                    this.clockWatch.delete(entry.id);
                    // stopped but not held = the monitor brings it back on its next check
                    status.state = held ? 'stopped' : 'starting';
                }
                status.canStart = held && status.state === 'stopped';
                status.canStop = status.state !== 'stopped' && status.state !== 'stopping';
                return status;
            }

            if (kind === 'remote') {
                status.state = a2s ? 'running' : 'offline';
                return status;
            }

            const mine = entry.exe
                ? procs.filter((p) => this.paths.samePath(p.ExecutablePath, this.exePathOf(entry)))
                : [];
            const pending = this.pending.get(entry.id);
            if (mine.length) {
                status.pid = mine.map((p) => p.ProcessId).join(', ');
                status.startedAt = this.formatCreationDate(mine[0].CreationDate);
                const ready = this.isReady(
                    entry.id,
                    status.pid,
                    a2s,
                    () => this.rptSaysReady(entry.id, this.profilesPathOf(entry), entry.exe),
                );
                status.state = ready ? 'running' : 'starting';
                if (pending?.action === 'starting' && status.state === 'running') {
                    this.pending.delete(entry.id);
                }
                if (pending?.action === 'stopping') {
                    status.state = 'stopping';
                }
            } else if (pending?.action === 'starting') {
                if (Date.now() - pending.since > 60000) {
                    // the process never appeared or died during start
                    this.pending.delete(entry.id);
                    this.lastError.set(entry.id, 'The server closed during start. Check its newest .RPT in the profiles folder.');
                    status.lastError = this.lastError.get(entry.id);
                } else {
                    status.state = 'starting';
                }
            } else if (pending?.action === 'stopping') {
                status.state = 'stopping';
            }
            if (pending?.action === 'starting' && Date.now() - pending.since > START_GIVE_UP_MS) {
                this.pending.delete(entry.id);
            }

            status.canStart = !problem && status.state === 'stopped';
            status.canStop = !problem && (status.state === 'running' || status.state === 'starting') && pending?.action !== 'stopping';
            return status;
        }));

        if (gen === this.generation) {
            this.statusCache = { ts: Date.now(), result: maps };
        }
        return { maps, fileError: error, filePath: this.getMapsFilePath() };
    }

    /** Same file the monitor checks (Monitor.lockPath): while it exists the panel never starts its server. */
    public serverLockPath(): string {
        return path.join(this.paths.cwd(), 'SERVER_LOCK');
    }

    /** Removes SERVER_LOCK only when the Maps page wrote it (a hand-made lock file is left alone). */
    public releaseMapsServerLock(): void {
        const lockFile = this.serverLockPath();
        try {
            if (this.fs.existsSync(lockFile)
                && String(this.fs.readFileSync(lockFile, { encoding: 'utf-8' })).trim() === MAPS_LOCK_MARKER) {
                this.fs.unlinkSync(lockFile);
                this.log.log(LogLevel.IMPORTANT, 'Maps: SERVER_LOCK from the Maps page removed (restart unlocked)');
            }
        } catch (e) {
            this.log.log(LogLevel.WARN, 'Maps: could not remove SERVER_LOCK', e?.message);
        }
    }

    private invalidate(): void {
        this.generation++;
        this.statusCache = undefined;
    }

    private findEntry(id: string): { entry?: MapEntryConfig; file: MapsFile; problem?: string } {
        const { file } = this.readMapsFile();
        const entry = file.maps.find((x) => x.id === id);
        return { entry, file, problem: entry ? this.validate(entry, file.maps) : 'No map with that id.' };
    }

    public async startMap(id: string): Promise<MapActionResult> {
        const { entry, file, problem } = this.findEntry(id);
        if (!entry || problem) {
            return { ok: false, message: problem ?? 'Unknown map.' };
        }
        const kind = this.kindOf(entry);
        if (kind === 'remote') {
            return { ok: false, message: 'This map runs on another machine. It can only be watched here.' };
        }
        this.invalidate();
        this.lastError.delete(entry.id);

        if (kind === 'panel') {
            const lockFile = this.serverLockPath();
            const hasLockFile = this.fs.existsSync(lockFile);
            if (!this.monitor.restartLock && !hasLockFile) {
                return { ok: true, message: `${entry.name} is already set to run. The panel starts it within a minute if it is down.` };
            }
            if (hasLockFile) {
                try {
                    this.fs.unlinkSync(lockFile);
                } catch (e) {
                    return { ok: false, message: `Could not remove the hold file ${lockFile}: ${e?.message ?? e}` };
                }
            }
            this.monitor.restartLock = false;
            this.log.log(LogLevel.IMPORTANT, `Maps: start ${entry.name} (panel server, restart lock released)`);
            return { ok: true, message: `${entry.name} starts within a minute.` };
        }

        if (this.pending.get(entry.id)) {
            return { ok: false, message: `${entry.name} is already ${this.pending.get(entry.id).action}.` };
        }
        const running = await this.getLocalProcesses([this.exePathOf(entry)]);
        if (running.length) {
            return { ok: false, message: `${entry.name} is already running.` };
        }

        const serverPath = this.serverPathOf(entry);
        const exePath = this.exePathOf(entry);

        // own copy of the server program, so the panel never mistakes it for its own server
        const copyFrom = entry.copyExeFrom ?? 'DayZServer_x64.exe';
        if (copyFrom && !this.paths.samePath(path.join(serverPath, copyFrom), exePath)) {
            try {
                this.fs.copyFileSync(path.join(serverPath, copyFrom), exePath);
            } catch (e) {
                if (!this.fs.existsSync(exePath)) {
                    const msg = `Could not make ${entry.exe} from ${copyFrom}: ${e?.message ?? e}`;
                    this.lastError.set(entry.id, msg);
                    return { ok: false, message: msg };
                }
                this.log.log(LogLevel.WARN, `Maps: could not refresh ${entry.exe}, using the existing copy`, e?.message);
            }
        }

        if (entry.rconPort) {
            try {
                this.writeBattleyeConf(entry);
            } catch (e) {
                this.log.log(LogLevel.WARN, `Maps: could not write the BattlEye RCON file for ${entry.name}`, e?.message);
            }
        }

        const mods = (entry.mods ?? file.mods ?? []).filter((x) => !!x);
        const serverMods = (entry.serverMods ?? []).filter((x) => !!x);
        const args = [
            `-config=${entry.config}`,
            `-port=${entry.port}`,
            `-profiles=${entry.profiles}`,
            ...(mods.length ? [`-mod=${mods.join(';')}`] : []),
            ...(serverMods.length ? [`-servermod=${serverMods.join(';')}`] : []),
            ...(entry.params ?? file.params ?? DEFAULT_PARAMS),
        ];

        this.log.log(LogLevel.IMPORTANT, `Maps: start ${entry.name}`, [entry.exe, ...args].join(' '));
        this.pending.set(entry.id, { action: 'starting', since: Date.now() });
        this.invalidate();
        try {
            const ok = await this.spawnDetached(serverPath, entry.exe, args);
            if (!ok) {
                this.pending.delete(entry.id);
                this.lastError.set(entry.id, 'Windows would not start the server program.');
                return { ok: false, message: this.lastError.get(entry.id) };
            }
        } catch (e) {
            this.pending.delete(entry.id);
            this.lastError.set(entry.id, `Start failed: ${e?.message ?? e}`);
            return { ok: false, message: this.lastError.get(entry.id) };
        }
        return { ok: true, message: `${entry.name} is starting. It turns green when players can join.` };
    }

    /** Same launch as the panel uses for its own server: a detached `start`, so it outlives the panel and the browser. */
    private spawnDetached(cwd: string, exe: string, args: string[]): Promise<boolean> {
        const isWin = detectOS() === 'windows';
        const cmd = isWin ? 'cmd' : path.join(cwd, exe);
        const cmdArgs = isWin ? ['/c', 'start', '/D', cwd, exe, ...args] : args;
        return new Promise<boolean>((res) => {
            const sub = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', cwd });
            sub.unref();
            sub.on('error', (e) => {
                this.log.log(LogLevel.ERROR, 'Maps: spawn error', e);
                res(false);
            });
            if (isWin) {
                sub.on('exit', (code) => res(code === 0));
            } else {
                res(true);
            }
        });
    }

    private battleyeDir(entry: MapEntryConfig): string {
        return path.join(this.profilesPathOf(entry), 'battleye');
    }

    private writeBattleyeConf(entry: MapEntryConfig): void {
        const dir = this.battleyeDir(entry);
        this.fs.mkdirSync(dir, { recursive: true });
        for (const f of this.fs.readdirSync(dir)) {
            const lower = String(f).toLowerCase();
            if (lower.startsWith('beserver') && lower.endsWith('.cfg')) {
                this.fs.unlinkSync(path.join(dir, String(f)));
            }
        }
        const password = `MAP${crypto.randomBytes(9).toString('hex')}`;
        this.rconPasswords.set(entry.id, password);
        this.fs.writeFileSync(
            path.join(dir, 'BEServer_x64.cfg'),
            [
                `RConPassword ${password}`,
                'RestrictRCon 0',
                `RConPort ${entry.rconPort}`,
                'RConIP 127.0.0.1',
            ].join('\n'),
        );
    }

    /** RCON details from BattlEye's file (it renames it to BEServer_x64_active_*.cfg while running). */
    private readRconDetails(entry: MapEntryConfig): { port: number; password: string } | undefined {
        const dir = this.battleyeDir(entry);
        let password = this.rconPasswords.get(entry.id);
        let port = entry.rconPort;
        try {
            const files = this.fs.readdirSync(dir)
                .map((f) => String(f))
                .filter((f) => /^beserver_x64.*\.cfg$/i.test(f))
                .map((f) => ({ f, t: this.fs.statSync(path.join(dir, f)).mtimeMs }))
                .sort((a, b) => b.t - a.t);
            if (files.length) {
                const content = this.fs.readFileSync(path.join(dir, files[0].f), { encoding: 'utf-8' }) as string;
                password = /RConPassword\s+(\S+)/i.exec(content)?.[1] ?? password;
                const p = Number(/RConPort\s+(\d+)/i.exec(content)?.[1]);
                port = p || port;
            }
        } catch {
            // no battleye folder: fall back to what this panel wrote
        }
        return password && port ? { port, password } : undefined;
    }

    public async stopMap(id: string): Promise<MapActionResult> {
        const { entry, problem } = this.findEntry(id);
        if (!entry || problem) {
            return { ok: false, message: problem ?? 'Unknown map.' };
        }
        const kind = this.kindOf(entry);
        if (kind === 'remote') {
            return { ok: false, message: 'This map runs on another machine. It can only be watched here.' };
        }
        this.invalidate();
        this.lastError.delete(entry.id);

        if (kind === 'panel') {
            // same as "Stop for Maintenance": hold restarts, then a clean shutdown
            this.monitor.restartLock = true;
            // the in-memory lock is lost on a panel restart, the monitor's SERVER_LOCK file is not
            try {
                this.fs.writeFileSync(this.serverLockPath(), MAPS_LOCK_MARKER);
            } catch (e) {
                this.log.log(LogLevel.WARN, 'Maps: could not write SERVER_LOCK, the stop only lasts until the panel restarts', e?.message);
            }
            this.log.log(LogLevel.IMPORTANT, `Maps: stop ${entry.name} (panel server, restart lock + SERVER_LOCK file set)`);
            if (this.rcon.isConnected()) {
                await this.rcon.shutdown();
            } else {
                await this.monitor.killServer();
            }
            return { ok: true, message: `${entry.name} is stopping. It stays off until you press Start.` };
        }

        if (this.pending.get(entry.id)?.action === 'stopping') {
            return { ok: false, message: `${entry.name} is already stopping.` };
        }
        const running = await this.getLocalProcesses([this.exePathOf(entry)]);
        if (!running.length) {
            this.pending.delete(entry.id);
            return { ok: true, message: `${entry.name} was not running.` };
        }

        this.pending.set(entry.id, { action: 'stopping', since: Date.now() });
        this.invalidate();
        this.log.log(LogLevel.IMPORTANT, `Maps: stop ${entry.name}`);
        void this.stopInBackground(entry);
        return { ok: true, message: `${entry.name} is saving and stopping.` };
    }

    private async stopInBackground(entry: MapEntryConfig): Promise<void> {
        const exePath = this.exePathOf(entry);
        try {
            let asked = false;
            const rcon = this.readRconDetails(entry);
            if (rcon) {
                asked = await rconOneShot('127.0.0.1', rcon.port, rcon.password, '#shutdown');
                this.log.log(
                    asked ? LogLevel.INFO : LogLevel.WARN,
                    asked ? `Maps: ${entry.name} told to shut down (RCON)` : `Maps: RCON shutdown for ${entry.name} got no login`,
                );
            }

            if (asked) {
                const until = Date.now() + STOP_WAIT_MS;
                while (Date.now() < until) {
                    await sleep(3000);
                    if (!(await this.getLocalProcesses([exePath])).length) {
                        this.log.log(LogLevel.IMPORTANT, `Maps: ${entry.name} stopped cleanly`);
                        return;
                    }
                }
            }

            // no RCON, or it did not close in time: force it, this map's process only
            const left = await this.getLocalProcesses([exePath]);
            for (const p of left) {
                if (!this.paths.samePath(p.ExecutablePath, exePath)) continue;
                try {
                    await this.processes.killProcess(p.ProcessId, true);
                } catch (e) {
                    this.log.log(LogLevel.ERROR, `Maps: could not end ${entry.name} (pid ${p.ProcessId})`, e?.stderr ?? e);
                }
            }
            if (left.length) {
                this.lastError.set(
                    entry.id,
                    asked
                        ? 'It did not close within 90 s, so it was forced off.'
                        : 'No RCON answer, so it was forced off (no final save).',
                );
                this.log.log(LogLevel.WARN, `Maps: ${entry.name} forced off`);
            }
        } catch (e) {
            this.lastError.set(entry.id, `Stop failed: ${e?.message ?? e}`);
            this.log.log(LogLevel.ERROR, `Maps: stop ${entry.name} failed`, e);
        } finally {
            this.pending.delete(entry.id);
            this.invalidate();
        }
    }

}
