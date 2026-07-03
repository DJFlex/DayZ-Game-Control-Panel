import { Manager } from '../control/manager';
import { LogLevel } from '../util/logger';
import * as path from 'path';
import { Paths } from '../services/paths';
import { FileDescriptor } from '../types/log-reader';
import { IService } from '../types/service';
import { LoggerFactory } from './loggerfactory';
import { FSAPI, InjectionTokens } from '../util/apis';
import { inject, injectable, singleton } from 'tsyringe';

@singleton()
@injectable()
export class Backups extends IService {

    public constructor(
        loggerFactory: LoggerFactory,
        private manager: Manager,
        private paths: Paths,
        @inject(InjectionTokens.fs) private fs: FSAPI,
    ) {
        super(loggerFactory.createLogger('Backups'));
    }

    public async createBackup(): Promise<void> {
        const backups = this.getBackupDir();

        await this.fs.promises.mkdir(backups, { recursive: true });

        const mpmissions = path.join(this.manager.getServerPath(), 'mpmissions');
        if (!this.fs.existsSync(mpmissions)) {
            this.log.log(LogLevel.WARN, 'Skipping backup because mpmissions folder does not exist');
            return;
        }

        const now = new Date();
        const curMarker = `mpmissions_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

        this.log.log(LogLevel.IMPORTANT, `Creating backup ${curMarker}`);

        const curBackup = path.join(backups, curMarker);
        await this.paths.copyDirFromTo(mpmissions, curBackup);

        void this.cleanup();
    }

    private getBackupDir(): string {
        if (this.paths.isAbsolute(this.manager.config.backupPath)) {
            return this.manager.config.backupPath;
        }
        return path.join(this.paths.cwd(), this.manager.config.backupPath);
    }

    public async getBackups(): Promise<FileDescriptor[]> {
        const backups = this.getBackupDir();
        const files = await this.fs.promises.readdir(backups);
        const foundBackups: FileDescriptor[] = [];
        for (const file of files) {
            const fullPath = path.join(backups, file);
            const stats = await this.fs.promises.stat(fullPath);
            if (file.startsWith('mpmissions_') && stats.isDirectory()) {
                foundBackups.push({
                    file,
                    mtime: stats.mtime.getTime(),
                });
            }
        }
        return foundBackups;
    }

    public async cleanup(): Promise<void> {
        const now = new Date().valueOf();
        const backupDir = this.getBackupDir();
        const backups = await this.getBackups();
        for (const backup of backups) {
            if ((now - backup.mtime) > (this.manager.config.backupMaxAge * 24 * 60 * 60 * 1000)) {
                // getBackups() returns bare folder names; removeLink needs the
                // full path or rmdir runs against the wrong (cwd-relative) dir
                // and silently no-ops, so old backups never get pruned.
                this.paths.removeLink(path.join(backupDir, backup.file));
            }
        }
    }

    /**
     * Restore the mpmissions folder from a named backup.
     *
     * The name is validated against the known backups (which also blocks path
     * traversal). A fresh backup of the CURRENT mpmissions is taken first so the
     * restore is itself reversible. The caller is responsible for ensuring the
     * server is stopped — copyDirFromTo removes the target first, which would
     * fail/partially-delete against files a running server holds open.
     */
    public async restoreBackup(name: string): Promise<{ ok: boolean; reason?: string; safetyBackup?: string }> {
        const backups = await this.getBackups();
        if (!backups.some((b) => b.file === name)) {
            this.log.log(LogLevel.WARN, `Refusing to restore unknown backup '${name}'`);
            return { ok: false, reason: 'not-found' };
        }

        const mpmissions = path.join(this.manager.getServerPath(), 'mpmissions');
        if (!this.fs.existsSync(mpmissions)) {
            return { ok: false, reason: 'no-mpmissions' };
        }

        // Safety snapshot of the current state before we overwrite it.
        const safetyBackup = `mpmissions_pre-restore_${this.marker()}`;
        this.log.log(LogLevel.IMPORTANT, `Backing up current mpmissions as ${safetyBackup} before restore`);
        await this.paths.copyDirFromTo(mpmissions, path.join(this.getBackupDir(), safetyBackup));

        this.log.log(LogLevel.IMPORTANT, `Restoring mpmissions from backup ${name}`);
        const ok = await this.paths.copyDirFromTo(path.join(this.getBackupDir(), name), mpmissions);
        return { ok, safetyBackup };
    }

    private marker(): string {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    }

}
