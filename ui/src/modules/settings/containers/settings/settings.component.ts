import { Component, OnInit } from '@angular/core';
import { Config, DiscordChannelType, WorkshopMod } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import * as commentJson from 'comment-json';

import configschema from '../../../../../../src/config/config.schema.json';

type ServerCfgKey = keyof typeof configschema.definitions.ServerCfg.properties;

interface Property {
    name: string;
    description: string;
    enum?: (string | number)[];
    type: 'number' | 'string' | 'boolean';
    default: any;
    custom?: boolean;
}

/**
 * Boolean startup flags, as a literal union so the template can index Config
 * with it under strictTemplates.
 */
type StartFlagKey =
    'doLogs' | 'adminLog' | 'netLog' | 'freezeCheck'
    | 'filePatching' | 'scriptDebug' | 'scrAllowFileWrite';

type StartNumberKey = 'limitFPS' | 'cpuCount';

/**
 * The schema's descriptions for these are just "Server Startup Param doLogs",
 * so the wording here is written for the panel (designer's Startup Flags card).
 */
const START_FLAGS: { key: StartFlagKey; desc: string }[] = [
    { key: 'doLogs', desc: 'Write server log files (.RPT)' },
    { key: 'adminLog', desc: 'Log admin actions to the ADM log' },
    { key: 'netLog', desc: 'Log network traffic' },
    { key: 'freezeCheck', desc: 'Detect and report server freezes' },
    { key: 'filePatching', desc: 'Load unpacked mod files instead of PBOs' },
    { key: 'scriptDebug', desc: 'Print script debug messages' },
    { key: 'scrAllowFileWrite', desc: 'Let scripts write files to disk' },
];

const START_NUMBERS: { key: StartNumberKey; label: string; desc: string }[] = [
    { key: 'limitFPS', label: 'limitFPS', desc: 'Cap the server frame rate' },
    { key: 'cpuCount', label: 'cpuCount', desc: 'CPU cores the server may use' },
];

/**
 * Config keys reachable in each section, so the search box can find a setting
 * and not just a section name. Harvested from this component's own template -
 * if you add a field, add its key here. Server.cfg is filled in at runtime from
 * serverCfgProps, which is itself derived from the schema.
 */
const SECTION_KEYS: { [section: string]: string[] } = {
    General: ['instanceId', 'loglevel'],
    Admins: ['admins', 'userId', 'userLevel', 'password'],
    Discord: ['discordBotToken', 'discordChannels'],
    DayZ: [
        'rconPassword', 'serverPath', 'serverPort', 'serverExe',
        'experimentalServer', 'battleyePath', 'profilesPath', 'serverCfgPath',
    ],
    Mods: ['steamWsMods', 'localMods', 'serverMods', 'workshopId'],
    'DayZ StartFlags': [
        'doLogs', 'adminLog', 'netLog', 'freezeCheck', 'filePatching',
        'scriptDebug', 'scrAllowFileWrite', 'limitFPS', 'cpuCount',
    ],
    Backups: ['backupPath', 'backupMaxAge'],
    Steam: [
        'steamUsername', 'steamPassword', 'steamCmdPath', 'steamWorkshopPath',
        'steamMetaPath', 'updateServerOnStartup', 'updateServerBeforeServerStart',
        'validateServerAfterUpdate', 'updateModsOnStartup', 'updateModsBeforeServerStart',
        'validateModsAfterUpdate', 'linkModDirs', 'copyModDeepCompare',
        'updateModsMaxBatchSize', 'updateModsMaxBatchFileSize',
    ],
    'Server.cfg': [],
};

/** Keys whose camelCase name does not read well on its own. */
const KEY_LABELS: { [key: string]: string } = {
    instanceId: 'Instance ID',
    loglevel: 'Log Level',
    steamWsMods: 'Workshop Mods',
    localMods: 'Local Mods',
    serverMods: 'Server Mods',
    serverCfg: 'Server.cfg',
    discordChannels: 'Discord Channels',
    serverCfgPath: 'Server.cfg Path',
    serverPath: 'Server Path',
    serverExe: 'Server Executable',
    rconPassword: 'RCON Password',
    steamCmdPath: 'SteamCMD Path',
    steamUsername: 'Steam Username',
    steamPassword: 'Steam Password',
};

@Component({
    selector: 'sb-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['settings.component.scss'],
})
export class SettingsComponent implements OnInit {

    public schema = configschema;

    public config!: Config;
    public loading = true;

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

    public serverCfgProps?: Property[];

    // Left-nav sections; only the active one is shown.
    public readonly sections = [
        'General', 'Admins', 'Discord', 'DayZ', 'Mods', 'DayZ StartFlags',
        'Backups', 'Steam', 'Server.cfg',
    ];

    /**
     * Sections the manager only reads from the config file - they had nav items
     * that rendered the words "currently only in file" and nothing else. Now
     * named once under the nav, pointing at the File Editor.
     */
    public readonly fileOnlySections = ['Web', 'Events', 'Hooks', 'Metrics'];
    public readonly fileOnlyLabel = this.fileOnlySections.join(' · ');
    public readonly fileEditorLink = '/dashboard/files/editor';

    public active = 'General';
    public settingFilter = '';

    public readonly startFlags = START_FLAGS;
    public readonly startNumbers = START_NUMBERS;

    /** Mods sub-tab. */
    public modTab: 'workshop' | 'local' | 'server' = 'workshop';
    public modIdInput = '';

    /**
     * The config exactly as the server last gave it to us, so the save bar can
     * say what changed. A deep clone, NOT a reference into `config`.
     *
     * The array editors (mods, admins, discord channels) bind with
     * `standalone: true`, so they never register with `configForm` and its
     * dirty flags cannot see them - hence comparing values rather than asking
     * the form.
     */
    private pristineConfig?: { [key: string]: any };

    public get filteredSections(): string[] {
        const f = this.settingFilter.trim().toLowerCase();
        if (!f) {
            return this.sections.slice();
        }
        return this.sections.filter(
            (s) => s.toLowerCase().includes(f) || this.matchingKeys(s).length > 0,
        );
    }

    /** Fields in a section matching the filter, so the nav can name the hit. */
    public matchingKeys(section: string): string[] {
        const f = this.settingFilter.trim().toLowerCase();
        if (!f) {
            return [];
        }
        return this.keysFor(section)
            .filter((k) => k.toLowerCase().includes(f) || this.labelFor(k).toLowerCase().includes(f))
            .slice(0, 3);
    }

    private keysFor(section: string): string[] {
        if (section === 'Server.cfg') {
            return (this.serverCfgProps || []).map((p) => p.name);
        }
        return SECTION_KEYS[section] ?? [];
    }

    public get noSearchHits(): boolean {
        return !!this.settingFilter.trim() && this.filteredSections.length === 0;
    }

    public constructor(
        public appCommon: AppCommonService,
    ) {}

    // ---- workshop mods ------------------------------------------------------
    //
    // A steamWsMods entry is either a bare id string ("123456") or a descriptor
    // ({ workshopId, name?, disabled? }) - the schema allows both and configs in
    // the wild use both, so every accessor below copes with either and only
    // promotes a string to a descriptor when it has to store something extra.

    public modId(mod: WorkshopMod | string): string {
        return typeof mod === 'string' ? mod : (mod?.workshopId ?? '');
    }

    public modName(mod: WorkshopMod | string): string {
        return typeof mod === 'string' ? '' : (mod?.name ?? '');
    }

    public modEnabled(mod: WorkshopMod | string): boolean {
        return typeof mod === 'string' ? true : !mod?.disabled;
    }

    /** Promote entry `idx` to a descriptor so extra fields can be stored. */
    private modAsDescriptor(idx: number): WorkshopMod {
        const current = this.config.steamWsMods[idx];
        if (typeof current === 'string') {
            const promoted: WorkshopMod = { workshopId: current };
            this.config.steamWsMods[idx] = promoted;
            return promoted;
        }
        return current;
    }

    public setModId(idx: number, value: string): void {
        const current = this.config.steamWsMods[idx];
        if (typeof current === 'string') {
            // keep the plain-string shape when that is all it ever was
            this.config.steamWsMods[idx] = value;
            return;
        }
        current.workshopId = value;
    }

    public setModName(idx: number, value: string): void {
        const descriptor = this.modAsDescriptor(idx);
        if (value) {
            descriptor.name = value;
        } else {
            delete descriptor.name;
        }
    }

    public setModEnabled(idx: number, enabled: boolean): void {
        if (enabled) {
            const current = this.config.steamWsMods[idx];
            if (typeof current !== 'string') {
                delete current.disabled;
            }
            return;
        }
        this.modAsDescriptor(idx).disabled = true;
    }

    public removeMod(idx: number): void {
        this.config.steamWsMods.splice(idx, 1);
    }

    /**
     * These lists hold primitives, so the default identity tracking treats an
     * edited entry as a brand new one and rebuilds the row - which steals focus
     * after every keystroke. Track by position instead.
     */
    public trackByIndex(index: number): number {
        return index;
    }

    public addLocalMod(): void {
        if (!this.config.localMods) {
            this.config.localMods = [];
        }
        this.config.localMods.push('');
    }

    public addServerMod(): void {
        if (!this.config.serverMods) {
            this.config.serverMods = [];
        }
        this.config.serverMods.push('');
    }

    /** Accepts a bare workshop id or a full Steam Workshop URL. */
    public addWorkshopMod(raw: string): void {
        const id = this.parseWorkshopId(raw);
        if (!id) {
            this.outcomeBadge = {
                success: false,
                message: 'Enter a numeric Workshop ID, or paste a Steam Workshop URL',
            };
            return;
        }
        if (!this.config.steamWsMods) {
            this.config.steamWsMods = [];
        }
        if (this.config.steamWsMods.some((m) => this.modId(m) === id)) {
            this.outcomeBadge = {
                success: false,
                message: `Workshop ID ${id} is already in the list`,
            };
            return;
        }
        this.config.steamWsMods.push({ workshopId: id });
        this.modIdInput = '';
        this.outcomeBadge = undefined;
    }

    private parseWorkshopId(raw: string): string | undefined {
        const value = (raw || '').trim();
        if (/^\d+$/.test(value)) {
            return value;
        }
        return /[?&]id=(\d+)/.exec(value)?.[1];
    }

    // ---- unsaved-change tracking -------------------------------------------

    /** Top-level config keys whose value differs from the loaded config. */
    public get changedKeys(): string[] {
        const before = this.pristineConfig;
        const after = this.config as any;
        if (!before || !after) {
            return [];
        }
        return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
            .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
            .sort();
    }

    /** Changed keys as readable labels, arrays annotated with a count. */
    public get changeLabels(): string[] {
        const before = this.pristineConfig || {};
        const after = (this.config || {}) as any;
        return this.changedKeys.map((k) => {
            const label = this.labelFor(k);
            if (Array.isArray(before[k]) || Array.isArray(after[k])) {
                const n = this.countArrayChanges(before[k], after[k]);
                return n > 1 ? `${label} (${n})` : label;
            }
            return label;
        });
    }

    /** "Instance ID · Mods (2)", trimmed so the bar cannot run away. */
    public summarise(labels: string[]): string {
        if (labels.length <= 3) {
            return labels.join(' · ');
        }
        return `${labels.slice(0, 3).join(' · ')} and ${labels.length - 3} more`;
    }

    public labelFor(key: string): string {
        return KEY_LABELS[key]
            ?? key
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/^./, (c) => c.toUpperCase());
    }

    private countArrayChanges(a: any, b: any): number {
        const before: any[] = Array.isArray(a) ? a : [];
        const after: any[] = Array.isArray(b) ? b : [];
        let changes = Math.abs(after.length - before.length);
        for (let i = 0; i < Math.min(before.length, after.length); i++) {
            if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
                changes++;
            }
        }
        return changes;
    }

    public onSubmit(): void {
        this.loading = true;
        this.appCommon.updateManagerConfig(
            commentJson.stringify(this.config),
        ).toPromise().then(
            () => {
                this.loading = false;
                // what we just sent is the new baseline
                this.pristineConfig = JSON.parse(JSON.stringify(this.config));
                this.outcomeBadge = {
                    message: 'Successfully updated config',
                    success: true,
                };
            },
            (err) => {
                console.error(err);
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Failed to update config. See manager logs for details',
                    success: false,
                };
            },
        );
    }

    public ngOnInit(): void {
        this.reset();
    }

    public reset(): void {
        this.loading = true;
        this.appCommon.fetchManagerConfig().toPromise().then(
            (config) => {
                this.config = commentJson.parse(config) as any;
                if (this.config.discordChannels?.length) {
                    this.config.discordChannels = this.config.discordChannels.map((x) => {
                        if (typeof x.mode === 'string') {
                            x.mode = [x.mode];
                        }
                        return x;
                    })
                }

                if (this.config.serverCfg) {
                    this.serverCfgProps = this.getServerCfgProps(this.config);
                } else {
                    this.serverCfgProps = [];
                }

                // baseline for the save bar, taken after the normalising above
                // so those rewrites do not read as unsaved edits
                this.pristineConfig = JSON.parse(JSON.stringify(this.config));

                this.loading = false;
            },
            console.error,
        );
    }

    public getDiscordChannels(): {
        channel: string;
        mode: DiscordChannelType[];
    }[] {
        return this.config.discordChannels as any;
    }

    public addDiscordChannel(): void {
        this.config.discordChannels.push({
            channel: '',
            mode: ['admin'],
        });
    }

    public addAdmin(): void {
        if (!this.config.admins) {
            this.config.admins = [];
        }
        this.config.admins.push({
            userId: '',
            userLevel: 'moderate',
            password: this.randomToken(),
        });
    }

    public removeAdmin(idx: number): void {
        // never allow removing the last admin (would lock everyone out)
        if (this.config.admins && this.config.admins.length > 1) {
            this.config.admins.splice(idx, 1);
            // reveal flags are keyed by row, so they no longer line up
            this.revealed = {};
        }
    }

    /** Which admin passwords are unmasked; reset whenever the rows shift. */
    private revealed: { [idx: number]: boolean } = {};

    public isRevealed(idx: number): boolean {
        return !!this.revealed[idx];
    }

    public toggleReveal(idx: number): void {
        this.revealed[idx] = !this.revealed[idx];
    }

    public generateAdminPassword(admin: { password: string }): void {
        admin.password = this.randomToken();
    }

    private randomToken(): string {
        const cryptoObj = (typeof window !== 'undefined' ? window.crypto : undefined) as Crypto | undefined;
        if (cryptoObj?.randomUUID) {
            return cryptoObj.randomUUID();
        }
        if (cryptoObj?.getRandomValues) {
            const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
            return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        }
        return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    }

    private getServerCfgProps(config: Config): Property[] {
        const fixedKeys = ['motd', 'motdInterval', 'Missions'] as ServerCfgKey[];

        const known = (this.schema.definitions.ServerCfg.propertyOrder as ServerCfgKey[])
            .filter((x) => {
                const { type } = this.schema.definitions.ServerCfg.properties[x];

                const included = ['string', 'number'].includes(type)
                    && !fixedKeys.includes(x);

                console.log(`${x}: ${included}`);

                return included;
            })
            .map((x) => ({
                ...(this.schema.definitions.ServerCfg.properties[x] as Property),
                name: x,
            }));

        const unknown = Object.keys(config.serverCfg || {})
            .filter((key) => !known.some((knownKey) => knownKey.name === key) && !fixedKeys.includes(key as ServerCfgKey) && ['string', 'number'].includes(typeof config.serverCfg[key]))
            .map((key) => {
                return {
                    name: key as ServerCfgKey,
                    description: '',
                    type: typeof config.serverCfg[key] as 'string' | 'number',
                    default: typeof config.serverCfg[key] === 'string' ? '' : 0,
                    custom: true,
                }
            });

        return [...known, ...unknown];
    }

    public addCustomServerCfgEntry(name: string, type: 'string' | 'number'): void {
        if (!name || name.length < 3) {
            this.outcomeBadge = {
                message: 'Custom field names must be at least 3 characters long',
                success: false,
            };
            return;
        }

        this.serverCfgProps?.push({
            name: name as ServerCfgKey,
            description: '',
            type,
            default: type === 'string' ? '' : 0,
            custom: true,
        });
    }

}
