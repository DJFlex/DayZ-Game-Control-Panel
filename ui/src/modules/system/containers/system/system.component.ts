import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { MetricType, MetricWrapper, MetricTypeEnum, ServerState, SystemReport } from '../../../app-common/models';
import { ApiFetcher, AppCommonService } from '../../../app-common/services/app-common.service';
import { Observable } from 'rxjs';

@Component({
    selector: 'sb-system',
    // kept OnPush: chart() hands back a new Observable per call, so every change
    // detection pass would otherwise resubscribe all six charts
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './system.component.html',
    styleUrls: ['system.component.scss'],
})
export class SystemComponent implements OnInit {

    public constructor(
        public commonService: AppCommonService,
    ) {}

    public ngOnInit(): void {
        // ignore
    }

    private getFetcher(type: MetricType): ApiFetcher<MetricType, MetricWrapper<any>> {
        return this.commonService.getApiFetcher<MetricType, MetricWrapper<any>>(type);
    }

    public getSystemFetcher(): ApiFetcher<MetricType, MetricWrapper<any>> {
        return this.getFetcher(MetricTypeEnum.SYSTEM);
    }

    /** Latest system report; every "now" figure on this page comes from it. */
    public get latest(): Observable<MetricWrapper<SystemReport> | null> {
        return this.commonService.getApiFetcher<
            MetricTypeEnum.SYSTEM,
            MetricWrapper<SystemReport>
        >(MetricTypeEnum.SYSTEM).latestData;
    }

    public serverRunning(report?: SystemReport | null): boolean {
        return report?.serverState === ServerState.STARTED;
    }

    /** MB -> "1.9 GB" / "180 MB", so the unit matches the magnitude. */
    public mem(mb?: number | null): string {
        if (mb === undefined || mb === null || mb < 0) {
            return '—';
        }
        return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
    }

    public pct(value?: number | null): string {
        if (value === undefined || value === null || value < 0) {
            return '—';
        }
        return `${Math.round(value)}%`;
    }

    /** Seconds -> "11h 24m", the shape the designer's card header uses. */
    public uptime(seconds?: number | null): string {
        if (!seconds || seconds < 0) {
            return '';
        }
        const total = Math.floor(seconds);
        const days = Math.floor(total / 86400);
        const hours = Math.floor((total % 86400) / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        if (days) {
            return `${days}d ${hours}h`;
        }
        if (hours) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * "4 cores · 15.8 GB". The designer also shows the OS name and process PIDs,
     * but the report carries neither, so they are left out rather than faked.
     */
    public hostSummary(report?: SystemReport | null): string {
        if (!report?.system) {
            return '';
        }
        const parts: string[] = [];
        const cores = report.system.cpuEach?.length;
        if (cores) {
            parts.push(`${cores} ${cores === 1 ? 'core' : 'cores'}`);
        }
        if (report.system.memTotal && report.system.memTotal > 0) {
            parts.push(this.mem(report.system.memTotal));
        }
        return parts.join(' · ');
    }

}
