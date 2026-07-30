import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MetricTypeEnum, MetricWrapper, ServerState, SystemReport } from '../../models';
import { ApiFetcher, AppCommonService, ConnectionState } from '../../services/app-common.service';

/**
 * Degraded-state banner (designer frames 2b + 3b).
 *
 *  - manager unreachable -> amber "Connection lost - reconnecting..." banner,
 *    naming how old the data still on screen is
 *  - manager fine but the DayZ process is down -> red "Server process is
 *    stopped" banner pointing at Maintenance
 *
 * Renders nothing when everything is healthy.
 */
@Component({
    selector: 'sb-status-banner',
    templateUrl: './status-banner.component.html',
    styleUrls: ['status-banner.component.scss'],
})
export class StatusBannerComponent {

    public constructor(
        public commonService: AppCommonService,
    ) {}

    public get connection(): Observable<ConnectionState> {
        return this.commonService.connectionState;
    }

    public get lastSuccessAt(): Observable<number> {
        return this.commonService.lastSuccessAt;
    }

    /** True once we actually have a reading and it says the server is down. */
    public get serverStopped(): Observable<boolean> {
        return this.systemFetcher.latestData.pipe(
            map((x) => !!x && x.value?.serverState === ServerState.STOPPED),
        );
    }

    /**
     * When the current stopped stretch began, read off the metric history: the
     * timestamp of the earliest sample in the unbroken tail of STOPPED
     * readings. 0 when every sample we hold is stopped, i.e. we never saw it
     * running and so cannot honestly date the stop.
     */
    public get stoppedSince(): Observable<number> {
        return this.systemFetcher.data.pipe(
            map((all) => {
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

    public retry(): void {
        this.commonService.triggerUpdate();
    }

    private get systemFetcher(): ApiFetcher<MetricTypeEnum.SYSTEM, MetricWrapper<SystemReport>> {
        return this.commonService.getApiFetcher<
            MetricTypeEnum.SYSTEM,
            MetricWrapper<SystemReport>
        >(MetricTypeEnum.SYSTEM);
    }

}
