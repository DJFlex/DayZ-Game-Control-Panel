import { Component, OnInit } from '@angular/core';
import { MetricType, MetricTypeEnum, MetricWrapper, RconPlayer, ServerState, SystemReport } from '../../app-common/models';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiFetcher, AppCommonService } from '../../app-common/services/app-common.service';

@Component({
    selector: 'sb-dashboard-cards',
    templateUrl: './dashboard-cards.component.html',
    styleUrls: ['dashboard-cards.component.scss'],
})
export class DashboardCardsComponent implements OnInit {

    /** Placeholder tiles rendered while the first report is in flight. Held as a
     *  field so *ngFor is not handed a fresh array on every change detection. */
    public readonly skeletonTiles = [0, 1, 2, 3];

    public constructor(
        public commonService: AppCommonService,
    ) {}

    public ngOnInit(): void {
        // ignore
    }

    public serverStateToStyle(s?: ServerState): string {
        switch (s) {
            case ServerState.STARTED: {
                return 'bg-success';
            }
            case ServerState.STARTING: {
                return 'bg-warning';
            }
            default: {
                return 'bg-danger';
            }
        }
    }

    public serverOnline(s?: ServerState): boolean {
        return s === ServerState.STARTED;
    }

    public serverStateLabel(s?: ServerState): string {
        switch (s) {
            case ServerState.STARTED: return 'Online';
            case ServerState.STARTING: return 'Starting';
            case ServerState.STOPPING: return 'Stopping';
            default: return 'Stopped';
        }
    }

    public serverStatePending(s?: ServerState): boolean {
        return s === ServerState.STARTING || s === ServerState.STOPPING;
    }

    /** ok = online (green), warn = starting/stopping (amber), bad = stopped (red). */
    public serverStateClass(s?: ServerState): string {
        if (this.serverOnline(s)) { return 'ok'; }
        if (this.serverStatePending(s)) { return 'warn'; }
        return 'bad';
    }

    public cpuLabel(pct?: number | null): string {
        if (pct === undefined || pct === null) { return '—'; }
        if (pct < 40) { return 'Low'; }
        if (pct < 75) { return 'Medium'; }
        return 'High';
    }

    /**
     * Conic-gradient background for a ring gauge. Colours come from custom
     * properties so the same gauge works on the light theme; hardcoding them
     * here made the track dark whatever the theme was.
     */
    public ring(pct?: number | null): string {
        const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
        return `conic-gradient(var(--dz-ring-fill) 0 ${p}%, var(--dz-ring-track) ${p}% 100%)`;
    }

    /**
     * When the current stopped stretch began: the earliest sample in the
     * unbroken tail of STOPPED readings. 0 when every sample we hold is
     * stopped, i.e. we never saw it running and so cannot date the stop.
     */
    public get stoppedSince(): Observable<number> {
        return this.getFetcher(MetricTypeEnum.SYSTEM).data.pipe(
            map((all: MetricWrapper<SystemReport>[] | null) => {
                if (!all?.length) {
                    return 0;
                }
                let since = 0;
                for (let i = all.length - 1; i >= 0; i--) {
                    if (all[i].value?.serverState !== ServerState.STOPPED) {
                        break;
                    }
                    since = all[i].timestamp;
                }
                return since === all[0].timestamp ? 0 : since;
            }),
        );
    }

    /** Core count for the CPU tile sub-line; blank when not reported. */
    public cores(sys?: { cpuEach?: number[] } | null): string {
        const n = sys?.cpuEach?.length;
        return n ? `${n} ${n === 1 ? 'core' : 'cores'}` : '';
    }

    public get playerStream(): Observable<MetricWrapper<RconPlayer[]> | null> {
        return this.getFetcher(MetricTypeEnum.PLAYERS).latestData;
    }

    public get systemStream(): Observable<MetricWrapper<SystemReport> | null> {
        return this.getFetcher(MetricTypeEnum.SYSTEM).latestData;
    }

    public get memStream(): Observable<number> {
        return this.systemStream.pipe(
            map((x) => {
                if (x?.value?.system) {
                    const sys = x?.value?.system;
                    if (sys.mem && sys.memTotal) {
                        return (sys.mem / sys.memTotal) * 100;
                    }
                }
                return 0;
            }),
        );
    }

    private getFetcher(type: MetricType): ApiFetcher<MetricType, MetricWrapper<any>> {
        return this.commonService.getApiFetcher<MetricType, MetricWrapper<any>>(type);
    }

}
