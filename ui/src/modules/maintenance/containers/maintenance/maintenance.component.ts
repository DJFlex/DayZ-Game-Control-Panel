import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MaintenanceService } from '../../services/maintenance.service';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import { MetricTypeEnum, MetricWrapper, RconPlayer, ServerState, SystemReport } from '../../../app-common/models';

@Component({
    selector: 'sb-maintenance',
    templateUrl: './maintenance.component.html',
    styleUrls: ['maintenance.component.scss'],
})
export class MaintenanceComponent implements OnInit, OnDestroy {

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

    // Live status bar.
    public serverState?: ServerState;
    public playerCount?: number;

    // DZSM has no "is locked" query, so these reflect the last action taken from
    // this page: they start Off and flip when toggled.
    public serverLocked = false;
    public restartLocked = false;

    // Set true immediately on "Stop for Maintenance" for instant feedback; the
    // getter below also derives it from live server state so it survives leaving
    // and re-opening the page.
    public inMaintenance = false;
    public maintenanceBusy = false;

    public get showResume(): boolean {
        return this.inMaintenance
            || this.serverState === ServerState.STOPPED
            || this.serverState === ServerState.STOPPING;
    }

    private destroy$ = new Subject<void>();

    // RCON console: newest entry first.
    public consoleHistory: {
        command: string;
        output: string;
        success: boolean;
    }[] = [];

    public consoleBusy = false;

    // Available mpmissions backups (newest first) for the restore dropdown.
    public backups: { file: string; mtime: number }[] = [];

    public restoreBusy = false;

    public constructor(
        private maintenance: MaintenanceService,
        private common: AppCommonService,
    ) {}

    /** When the server state on screen was last confirmed by a report. */
    public stateAt?: number;

    /** Set while we are polling hard for a state we just asked for. */
    public awaiting?: 'stop' | 'start' | 'restart';
    private watchUntil = 0;
    private watchTimer?: any;

    public ngOnInit(): void {
        void this.loadBackups();
        void this.refreshLocks();

        this.common.getApiFetcher<MetricTypeEnum.SYSTEM, MetricWrapper<SystemReport>>(MetricTypeEnum.SYSTEM)
            .latestData.pipe(takeUntil(this.destroy$))
            .subscribe((x) => {
                this.serverState = x?.value?.serverState;
                this.stateAt = x?.timestamp;
                this.checkAwaited();
            });

        this.common.getApiFetcher<MetricTypeEnum.PLAYERS, MetricWrapper<RconPlayer[]>>(MetricTypeEnum.PLAYERS)
            .latestData.pipe(takeUntil(this.destroy$))
            .subscribe((x) => { this.playerCount = x?.value?.length; });
    }

    public ngOnDestroy(): void {
        this.stopWatching();
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * The status bar used to move only on the next metric poll - 30s by
     * default - so a stop or resume looked like it had done nothing. After an
     * action we pull the state straight away and then keep pulling every couple
     * of seconds until it settles or the watch times out.
     */
    private watchState(awaiting: 'stop' | 'start' | 'restart', seconds = 90): void {
        this.awaiting = awaiting;
        this.watchUntil = new Date().valueOf() + (seconds * 1000);
        this.common.triggerUpdate();

        this.stopWatching();
        this.watchTimer = setInterval(
            () => {
                if (new Date().valueOf() > this.watchUntil) {
                    // give up quietly; the banner text explains what we saw
                    this.stopWatching();
                    this.awaiting = undefined;
                    return;
                }
                this.common.triggerUpdate();
            },
            2000,
        );
    }

    private stopWatching(): void {
        if (this.watchTimer) {
            clearInterval(this.watchTimer);
            this.watchTimer = undefined;
        }
    }

    /** Stop watching once the state we asked for actually arrives. */
    private checkAwaited(): void {
        if (!this.awaiting) {
            return;
        }
        const settled =
            (this.awaiting === 'stop' && this.serverState === ServerState.STOPPED)
            || (this.awaiting === 'start' && this.serverState === ServerState.STARTED)
            || (this.awaiting === 'restart' && this.serverState === ServerState.STARTED);

        if (settled) {
            this.awaiting = undefined;
            this.stopWatching();
        }
    }

    /** Read the real restart-lock state instead of assuming it. */
    public async refreshLocks(): Promise<void> {
        const locked = await this.maintenance.isRestartLocked();
        if (locked === null) {
            return;
        }
        this.restartLocked = locked;

        // Never derive this mid-action. Straight after a stop request the
        // server is still Online, so this would flip the card back to
        // "Stop for Maintenance" while it was busy stopping.
        if (!this.awaiting) {
            this.inMaintenance = locked && !this.serverOnline;
        }
    }

    /** True while a stop or resume is still playing out. */
    public get maintenancePending(): boolean {
        return this.maintenanceBusy || this.awaiting === 'stop' || this.awaiting === 'start';
    }

    /**
     * Which action the button offers. During a stop it stays the stop button
     * (reading "Stopping…") rather than flipping to Resume before the server
     * has actually gone.
     */
    public get showResumeButton(): boolean {
        if (this.awaiting === 'stop') {
            return false;
        }
        if (this.awaiting === 'start') {
            return true;
        }
        return this.showResume;
    }

    public get maintenanceButtonLabel(): string {
        if (this.awaiting === 'stop') {
            return 'Stopping…';
        }
        if (this.awaiting === 'start') {
            return 'Resuming…';
        }
        if (this.maintenanceBusy) {
            return this.showResume ? 'Resuming…' : 'Stopping…';
        }
        return this.showResume ? 'Resume Server' : 'Stop for Maintenance';
    }

    public get maintenanceTitle(): string {
        if (this.awaiting === 'stop') {
            return 'Stopping the server…';
        }
        if (this.awaiting === 'start') {
            return 'Starting the server back up…';
        }
        return this.showResume ? 'Server is stopped for maintenance' : 'Making changes?';
    }

    public get maintenanceSub(): string {
        if (this.awaiting) {
            return this.awaitingText;
        }
        return this.showResume
            ? 'It stays off until you resume.'
            : 'Stops the server safely (locks restarts + shuts down) so it stays off while you work.';
    }

    /** What the panel is currently waiting for, in plain words. */
    public get awaitingText(): string {
        switch (this.awaiting) {
            case 'stop': return 'Waiting for the server process to exit…';
            case 'start': return 'Waiting for the server to come back up…';
            case 'restart': return 'Waiting for the server to restart…';
            default: return '';
        }
    }

    public get serverOnline(): boolean {
        return this.serverState === ServerState.STARTED;
    }

    public get serverStateLabel(): string {
        switch (this.serverState) {
            case ServerState.STARTED: return 'Online';
            case ServerState.STARTING: return 'Starting';
            case ServerState.STOPPING: return 'Stopping';
            default: return 'Stopped';
        }
    }

    /** Mid-transition: neither cleanly up nor cleanly down. */
    public get statePending(): boolean {
        return this.serverState === ServerState.STARTING
            || this.serverState === ServerState.STOPPING;
    }

    /** Next 4-hourly restart boundary (matches the current 00/04/08/… schedule). */
    public get nextRestart(): { time: string; inMin: number } {
        const now = new Date();
        const next = new Date(now);
        next.setHours((Math.floor(now.getHours() / 4) + 1) * 4, 0, 0, 0);
        return {
            time: next.toTimeString().slice(0, 5),
            inMin: Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000)),
        };
    }

    public async toggleServerLock(): Promise<void> {
        const ok = this.serverLocked ? await this.maintenance.unlockServer() : await this.maintenance.lockServer();
        if (ok) {
            this.serverLocked = !this.serverLocked;
        }
        this.outcomeBadge = {
            message: ok ? (this.serverLocked ? 'Server locked' : 'Server unlocked') : 'Failed to change server lock',
            success: ok,
        };
    }

    public async toggleRestartLock(): Promise<void> {
        const ok = this.restartLocked ? await this.maintenance.unlockRestarts() : await this.maintenance.lockRestarts();
        if (ok) {
            this.restartLocked = !this.restartLocked;
        }
        this.outcomeBadge = {
            message: ok ? (this.restartLocked ? 'Restarts locked' : 'Restarts unlocked') : 'Failed to change restart lock',
            success: ok,
        };
    }

    /** One click: lock restarts, then shut the server down, so it stays off. */
    public async stopForMaintenance(): Promise<void> {
        if (this.maintenanceBusy) {
            return;
        }
        // eslint-disable-next-line no-alert, no-undef
        if (!confirm('Stop the server for maintenance?\n\nPlayers are disconnected and the server stays OFF until you click Resume.')) {
            return;
        }
        this.maintenanceBusy = true;
        try {
            const locked = await this.maintenance.lockRestarts();
            if (locked) { this.restartLocked = true; }
            const stopped = await this.maintenance.shutdown();
            if (locked && stopped) {
                this.inMaintenance = true;
                this.outcomeBadge = { message: 'Stop requested. The status below updates as it happens.', success: true };
                this.watchState('stop');
            } else {
                this.outcomeBadge = { message: 'Could not fully stop - check Restart lock / Shutdown manually.', success: false };
            }
        } finally {
            this.maintenanceBusy = false;
            void this.refreshLocks();
        }
    }

    /** Unlock restarts so the manager brings the server back up. */
    public async resumeFromMaintenance(): Promise<void> {
        if (this.maintenanceBusy) {
            return;
        }
        this.maintenanceBusy = true;
        try {
            const unlocked = await this.maintenance.unlockRestarts();
            if (unlocked) {
                this.restartLocked = false;
                this.inMaintenance = false;
                this.outcomeBadge = { message: 'Resuming. The status below updates as it happens.', success: true };
                // the monitor only starts it on its next poll, so allow for that
                this.watchState('start', 150);
            } else {
                this.outcomeBadge = { message: 'Could not unlock - try Unlock Server Restart manually.', success: false };
            }
        } finally {
            this.maintenanceBusy = false;
            void this.refreshLocks();
        }
    }

    public async loadBackups(): Promise<void> {
        const list = await this.maintenance.getBackups();
        this.backups = (list || []).sort((a, b) => b.mtime - a.mtime);
    }

    private exactBooleanParse(val?: string | boolean): boolean | undefined {
        val = val + '';
        if (val === 'true') {
            return true;
        } else if (val === 'false') {
            return false;
        } else {
            return undefined;
        }
    }

    public async updateServer(validate?: string | boolean): Promise<void> {
        const success = await this.maintenance.updateServer(this.exactBooleanParse(validate));
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully updated server',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to update server',
                success: false,
            };
        }
    }

    public async updateMods(validate?: string | boolean, force?: string | boolean): Promise<void> {
        const success = await this.maintenance.updateMods(this.exactBooleanParse(validate), this.exactBooleanParse(force));
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully updated mods',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to update mods',
                success: false,
            };
        }
    }

    public async createBackup(): Promise<void> {
        const success = await this.maintenance.createBackup();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully created backup',
                success: true,
            };
            void this.loadBackups();
        } else {
            this.outcomeBadge = {
                message: 'Failed to create backup',
                success: false,
            };
        }
    }

    public async lockServer(): Promise<void> {
        const success = await this.maintenance.lockServer();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully locked the server',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to lock the server',
                success: false,
            };
        }
    }

    public async unlockServer(): Promise<void> {
        const success = await this.maintenance.unlockServer();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully unlocked the server',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to unlock the server',
                success: false,
            };
        }
    }

    public async lockRestarts(): Promise<void> {
        const success = await this.maintenance.lockRestarts();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully locked server restarts',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to lock server restarts',
                success: false,
            };
        }
    }

    public async unlockRestarts(): Promise<void> {
        const success = await this.maintenance.unlockRestarts();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully unlocked server restarts',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to unlock server restarts',
                success: false,
            };
        }
    }

    public async restartServer(force?: boolean): Promise<void> {
        if (force) {
            // eslint-disable-next-line no-alert, no-undef
            if (!confirm('Force-restart the server NOW? Players are dropped with no warning.')) {
                return;
            }
        }
        const success = await this.maintenance.restartServer(force);
        if (success) {
            this.outcomeBadge = {
                // it is a request, not a result - the status below reports the result
                message: 'Restart requested. The status below updates as it happens.',
                success: true,
            };
            this.watchState('restart', 180);
        } else {
            this.outcomeBadge = {
                message: 'Failed to kill the server',
                success: false,
            };
        }
    }

    public async kickAll(): Promise<void> {
        // eslint-disable-next-line no-alert, no-undef
        if (!confirm('Kick ALL players from the server now?')) {
            return;
        }
        const success = await this.maintenance.kickAll();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully kicked all players',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to kick all players',
                success: false,
            };
        }
    }

    public async shutdown(): Promise<void> {
        // eslint-disable-next-line no-alert, no-undef
        if (!confirm('Shut the server down now? All players are disconnected.')) {
            return;
        }
        const success = await this.maintenance.shutdown();
        if (success) {
            this.outcomeBadge = {
                message: 'Shutdown requested. The status below updates as it happens.',
                success: true,
            };
            this.watchState('stop');
        } else {
            this.outcomeBadge = {
                message: 'Failed to execute RCON shutdown',
                success: false,
            };
        }
    }

    public async sendMessage(msg: string): Promise<void> {
        if (!msg?.trim()) {
            return;
        }
        const success = await this.maintenance.sendMessage(msg.trim());
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully sent global message',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to send global message',
                success: false,
            };
        }
    }

    public async runRconCommand(command: string): Promise<void> {
        const cmd = command?.trim();
        if (!cmd || this.consoleBusy) {
            return;
        }
        this.consoleBusy = true;
        try {
            const res = await this.maintenance.rconCommand(cmd);
            if (res === null) {
                this.consoleHistory.unshift({
                    command: cmd,
                    output: 'Request failed (not permitted, or manager unreachable). See browser console.',
                    success: false,
                });
            } else if (!res.connected) {
                this.consoleHistory.unshift({
                    command: cmd,
                    output: 'RCON is not connected - command was not sent to the server.',
                    success: false,
                });
            } else {
                this.consoleHistory.unshift({
                    command: cmd,
                    output: res.result?.length ? res.result : '(command executed - no output returned)',
                    success: true,
                });
            }
        } finally {
            this.consoleBusy = false;
        }
    }

    public async restoreBackup(name: string): Promise<void> {
        if (!name || this.restoreBusy) {
            return;
        }
        // eslint-disable-next-line no-alert, no-undef
        const confirmed = confirm(
            `Restore the server mission from "${name}"?\n\n`
            + 'This OVERWRITES the current mpmissions folder. A safety backup of '
            + 'the current mission is taken first. The server must be STOPPED.',
        );
        if (!confirmed) {
            return;
        }

        this.restoreBusy = true;
        try {
            const res = await this.maintenance.restoreBackup(name);
            if (!res) {
                this.outcomeBadge = { message: 'Restore failed (not permitted or manager unreachable)', success: false };
            } else if (res.reason === 'server-running') {
                this.outcomeBadge = {
                    message: 'Stop the server before restoring (Lock Server Restart, then Shutdown), then try again.',
                    success: false,
                };
            } else if (res.reason === 'not-found') {
                this.outcomeBadge = { message: 'That backup no longer exists - refreshing the list.', success: false };
                void this.loadBackups();
            } else if (res.ok) {
                this.outcomeBadge = {
                    message: `Restored from ${name}. Current mission saved as ${res.safetyBackup}. Start the server to load it.`,
                    success: true,
                };
                void this.loadBackups();
            } else {
                this.outcomeBadge = { message: 'Restore failed - check the server logs.', success: false };
            }
        } finally {
            this.restoreBusy = false;
        }
    }

}
