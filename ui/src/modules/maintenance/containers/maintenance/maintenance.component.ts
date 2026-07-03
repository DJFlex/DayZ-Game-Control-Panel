import { Component, OnInit } from '@angular/core';
import { MaintenanceService } from '../../services/maintenance.service';

@Component({
    selector: 'sb-maintenance',
    templateUrl: './maintenance.component.html',
    styleUrls: ['maintenance.component.scss'],
})
export class MaintenanceComponent implements OnInit {

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

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
    ) {}

    public ngOnInit(): void {
        void this.loadBackups();
    }

    public async loadBackups(): Promise<void> {
        const list = await this.maintenance.getBackups();
        this.backups = (list || []).sort((a, b) => b.mtime - a.mtime);
    }

    private exactBooleanParse(val?: string): boolean | undefined {
        val = val + '';
        if (val === 'true') {
            return true;
        } else if (val === 'false') {
            return false;
        } else {
            return undefined;
        }
    }

    public async updateServer(validate?: string): Promise<void> {
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

    public async updateMods(validate?: string, force?: string): Promise<void> {
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
        const success = await this.maintenance.restartServer(force);
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully killed the server',
                success: true,
            };
        } else {
            this.outcomeBadge = {
                message: 'Failed to kill the server',
                success: false,
            };
        }
    }

    public async kickAll(): Promise<void> {
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
        const success = await this.maintenance.shutdown();
        if (success) {
            this.outcomeBadge = {
                message: 'Successfully executed RCON shutdown',
                success: true,
            };
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
