import { Component, OnDestroy, OnInit } from '@angular/core';
import { MapActionResult, MapStatus, MapsService } from '../../services/maps.service';

@Component({
    selector: 'sb-maps',
    templateUrl: './maps.component.html',
    styleUrls: ['maps.component.scss'],
})
export class MapsComponent implements OnInit, OnDestroy {

    public maps: MapStatus[] = [];
    public fileError?: string;
    public filePath?: string;
    public loaded = false;
    public lastPoll?: number;
    public panelDown = false;

    /** Map ids whose button was just pressed (until the reply comes back). */
    public busy = new Set<string>();
    public messages = new Map<string, MapActionResult>();

    private timer?: any;
    private destroyed = false;

    public constructor(private mapsService: MapsService) {}

    public ngOnInit(): void {
        void this.poll();
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
        clearTimeout(this.timer);
    }

    private async poll(): Promise<void> {
        await this.refresh();
        if (this.destroyed) return;
        // faster while something is changing
        const changing = this.maps.some((m) => m.state === 'starting' || m.state === 'stopping');
        this.timer = setTimeout(() => void this.poll(), changing ? 2500 : 5000);
    }

    public async refresh(): Promise<void> {
        const reply = await this.mapsService.getMaps();
        this.loaded = true;
        this.panelDown = !reply;
        if (!reply) return;
        this.maps = reply.maps ?? [];
        this.fileError = reply.fileError;
        this.filePath = reply.filePath;
        this.lastPoll = Date.now();
    }

    public trackById(_: number, m: MapStatus): string {
        return m.id;
    }

    public get testMapsRunning(): MapStatus[] {
        return this.maps.filter((m) => m.kind === 'local' && m.canStop);
    }

    public stateLabel(m: MapStatus): string {
        switch (m.state) {
            case 'running': return 'Running';
            case 'starting': return 'Starting…';
            case 'stopping': return 'Stopping…';
            case 'offline': return 'Offline';
            default: return 'Stopped';
        }
    }

    public stateClass(m: MapStatus): string {
        if (m.state === 'running') return 'ok';
        if (m.state === 'starting' || m.state === 'stopping') return 'pending';
        return 'off';
    }

    public async start(m: MapStatus): Promise<void> {
        await this.act(m, () => this.mapsService.start(m.id));
    }

    public async stop(m: MapStatus): Promise<void> {
        const who = m.players ? `\n\n${m.players} player(s) on it get kicked.` : '';
        // eslint-disable-next-line no-alert, no-undef
        if (!confirm(`Stop ${m.name}?${who}`)) return;
        await this.act(m, () => this.mapsService.stop(m.id));
    }

    public async stopAllTestMaps(): Promise<void> {
        const list = this.testMapsRunning;
        if (!list.length) return;
        // eslint-disable-next-line no-alert, no-undef
        if (!confirm(`Stop ${list.map((m) => m.name).join(', ')}?\n\nThe main server keeps running.`)) return;
        await Promise.all(list.map((m) => this.act(m, () => this.mapsService.stop(m.id))));
    }

    private async act(m: MapStatus, call: () => Promise<MapActionResult>): Promise<void> {
        if (this.busy.has(m.id)) return;
        this.busy.add(m.id);
        this.messages.delete(m.id);
        try {
            const res = await call();
            this.messages.set(m.id, res);
            if (res.ok) {
                // the card's light says the rest; keep only problems on screen
                setTimeout(() => {
                    if (this.messages.get(m.id) === res) this.messages.delete(m.id);
                }, 20000);
            }
        } finally {
            await this.refresh();
            this.busy.delete(m.id);
        }
    }

}
