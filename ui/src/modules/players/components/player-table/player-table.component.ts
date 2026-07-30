import {
    Component,
    Input,
    OnInit,
} from '@angular/core';
import { SortEvent } from '../../directives/sortable.directive';
import { MergedPlayer, PlayersService } from '../..//services/players.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MetricTypeEnum, MetricWrapper, ServerState, SystemReport } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';

@Component({
    selector: 'sb-player-table',
    templateUrl: './player-table.component.html',
    styleUrls: ['player-table.component.scss'],
})
export class PlayerTableComponent implements OnInit {

    public readonly MAX_ITEMS = 9999999;

    @Input() public players$!: Observable<MergedPlayer[]>;
    @Input() public total$!: Observable<number>;

    /** Placeholder rows for the first load; a field so *ngFor keeps its DOM. */
    public readonly skeletonRows = [0, 1, 2];

    public constructor(
        public playerService: PlayersService,
        public commonService: AppCommonService,
    ) {}

    public ngOnInit(): void {
        // ignore
    }

    /** Drives the wording of the empty state: stopped server vs quiet server. */
    public get serverStopped(): Observable<boolean> {
        return this.commonService.getApiFetcher<
            MetricTypeEnum.SYSTEM,
            MetricWrapper<SystemReport>
        >(MetricTypeEnum.SYSTEM).latestData.pipe(
            map((x) => !!x && x.value?.serverState !== ServerState.STARTED),
        );
    }

    public onSort({ column, direction }: SortEvent): void {
        this.playerService.updateState({
            sortColumn: column as keyof MergedPlayer,
            sortDirection: direction,
        });
    }

}
