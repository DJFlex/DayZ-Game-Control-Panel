import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../auth/services/auth.service';

/**
 * Reads and writes files under the active mission folder via the manager's
 * mission-file endpoints (path-safe server-side: traversal is rejected).
 */
@Injectable({ providedIn: 'root' })
export class MissionFilesService {

    public constructor(
        private http: HttpClient,
        private auth: AuthService,
    ) {}

    /** List a directory relative to the mission root. Directory names end with '/'. */
    public async readDir(dir: string): Promise<string[]> {
        const res = await this.http.get<string[]>(
            '/api/readmissiondir',
            {
                params: { dir: dir || '' },
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
            },
        ).pipe(
            catchError((e) => { console.log(e); return of([]); }),
        ).toPromise();
        return res ?? [];
    }

    /** Read a text file relative to the mission root. Null on error / empty / non-text. */
    public async readFile(file: string): Promise<string | null> {
        const res = await this.http.get(
            '/api/readmissionfile',
            {
                params: { file },
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
                responseType: 'text',
            },
        ).pipe(
            catchError((e) => { console.log(e); return of(null); }),
        ).toPromise();
        return res ?? null;
    }

    /** Write a text file relative to the mission root, optionally backing up mpmissions first. */
    public async writeFile(file: string, content: string, createBackup: boolean): Promise<boolean> {
        return this.http.post(
            '/api/writemissionfile',
            { file, content, createBackup },
            {
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
                observe: 'response',
                responseType: 'text',
            },
        ).pipe(
            map((r: HttpResponse<any>) => !!r?.ok),
            catchError((e) => { console.log(e); return of(false); }),
        ).toPromise();
    }

}
