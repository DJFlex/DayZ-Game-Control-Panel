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

    public cpuLabel(pct?: number | null): string {
        if (pct === undefined || pct === null) { return '—'; }
        if (pct < 40) { return 'Low'; }
        if (pct < 75) { return 'Medium'; }
        return 'High';
    }

    /** Conic-gradient background for a ring gauge at the given percent. */
    public ring(pct?: number | null): string {
        const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
        return `conic-gradient(#57a6ff 0 ${p}%, #2d333d ${p}% 100%)`;
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
