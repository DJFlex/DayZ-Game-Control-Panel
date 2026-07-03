import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthService } from '../../auth/services/auth.service';

import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';


@Injectable({ providedIn: 'root' })
export class MaintenanceService {

    public constructor(
        private httpClient: HttpClient,
        private auth: AuthService,
    ) {
    }

    public execute(action: string, body?: any): Promise<boolean> {
        return this.httpClient.post(
            `/api/${action}`,
            body,
            {
                headers: this.auth.getAuthHeaders(),
                observe: 'response',
                responseType: 'text',
                withCredentials: true,
            },
        ).pipe(
            map((x: HttpResponse<any>) => {
                return !!x?.ok;
            }),
            catchError((e) => {console.log(e); return of(false)}),
        ).toPromise();
    }

    public async updateServer(validate?: boolean): Promise<boolean> {
        return this.execute('updateserver', { validate });
    }

    public async updateMods(validate?: boolean, force?: boolean): Promise<boolean> {
        return this.execute('updatemods', { validate, force });
    }

    public async createBackup(): Promise<boolean> {
        return this.execute('backup');
    }

    public async lockServer(): Promise<boolean> {
        return this.execute('lock');
    }

    public async unlockServer(): Promise<boolean> {
        return this.execute('unlock');
    }

    public async lockRestarts(): Promise<boolean> {
        return this.execute('lockrestart');
    }

    public async unlockRestarts(): Promise<boolean> {
        return this.execute('unlockrestart');
    }

    public async restartServer(force?: boolean): Promise<boolean> {
        return this.execute('restart', { force });
    }

    public async shutdown(): Promise<boolean> {
        return this.execute('shutdown');
    }

    public async kickAll(): Promise<boolean> {
        return this.execute('kickall');
    }

    public async sendMessage(message: string): Promise<boolean> {
        return this.execute('global', { message });
    }

    /**
     * Send a raw RCON/BattlEye command and return its response text.
     * Unlike execute(), this keeps the response body (the command output).
     * Resolves null on a transport/permission error; `connected` is false
     * when the manager's RCON link to the server is down.
     */
    public async rconCommand(command: string): Promise<{ result: string; connected: boolean } | null> {
        const res = await this.httpClient.post<{ result: string; connected: boolean }>(
            '/api/rconcommand',
            { command },
            {
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
            },
        ).pipe(
            catchError((e) => { console.log(e); return of(null); }),
        ).toPromise();
        return res ?? null;
    }

    /** List available mpmissions backups (name + mtime). */
    public async getBackups(): Promise<{ file: string; mtime: number }[]> {
        const res = await this.httpClient.get<{ file: string; mtime: number }[]>(
            '/api/getbackups',
            {
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
            },
        ).pipe(
            catchError((e) => { console.log(e); return of([]); }),
        ).toPromise();
        return res ?? [];
    }

    /**
     * Restore mpmissions from a named backup. Resolves null on transport error.
     * `ok:false` with reason 'server-running' means the server must be stopped
     * first; 'not-found' means the backup name was rejected server-side.
     */
    public async restoreBackup(name: string): Promise<{ ok: boolean; reason?: string; safetyBackup?: string } | null> {
        const res = await this.httpClient.post<{ ok: boolean; reason?: string; safetyBackup?: string }>(
            '/api/restorebackup',
            { name },
            {
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
            },
        ).pipe(
            catchError((e) => { console.log(e); return of(null); }),
        ).toPromise();
        return res ?? null;
    }

}
