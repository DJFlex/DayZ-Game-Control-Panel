import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../auth/services/auth.service';

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

export interface MapsReply {
    maps: MapStatus[];
    fileError?: string;
    filePath: string;
}

export interface MapActionResult {
    ok: boolean;
    message: string;
}

@Injectable({ providedIn: 'root' })
export class MapsService {

    public constructor(
        private httpClient: HttpClient,
        private auth: AuthService,
    ) {}

    public async getMaps(): Promise<MapsReply | null> {
        const res = await this.httpClient.get<MapsReply>(
            '/api/maps',
            { headers: this.auth.getAuthHeaders(), withCredentials: true },
        ).pipe(
            catchError(() => of(null)),
        ).toPromise();
        return res ?? null;
    }

    public async start(id: string): Promise<MapActionResult> {
        return this.post('mapstart', id);
    }

    public async stop(id: string): Promise<MapActionResult> {
        return this.post('mapstop', id);
    }

    private async post(action: string, id: string): Promise<MapActionResult> {
        const res = await this.httpClient.post<MapActionResult>(
            `/api/${action}`,
            { id },
            { headers: this.auth.getAuthHeaders(), withCredentials: true },
        ).pipe(
            catchError((e) => of({
                ok: false,
                message: e?.status === 401 || e?.status === 403
                    ? 'Your login is not allowed to start or stop maps.'
                    : 'The panel did not answer.',
            } as MapActionResult)),
        ).toPromise();
        return res ?? { ok: false, message: 'The panel did not answer.' };
    }

}
