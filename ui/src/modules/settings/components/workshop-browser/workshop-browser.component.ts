import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WorkshopQueryType, WorkshopSearchItem, WorkshopSearchResult } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';

/**
 * Steam Workshop search for the Mods page.
 *
 * Adding is deliberately not installing: this emits the chosen mod and the
 * Settings page puts it in the list, where it still needs a save and an
 * Update Mods run. A button that claimed to install would be lying.
 */
@Component({
    selector: 'sb-workshop-browser',
    templateUrl: './workshop-browser.component.html',
    styleUrls: ['workshop-browser.component.scss'],
})
export class WorkshopBrowserComponent {

    /** Workshop ids already in the mod list, so cards can say so. */
    @Input() public addedIds: string[] = [];

    @Output() public add = new EventEmitter<WorkshopSearchItem>();

    public search = '';
    public sort: number = WorkshopQueryType.RankedByTrend;
    public days = 7;
    public page = 1;
    public busy = false;
    public result?: WorkshopSearchResult;

    public readonly sortOptions = [
        { value: WorkshopQueryType.RankedByTrend, label: 'Most popular' },
        { value: WorkshopQueryType.RankedByVote, label: 'Top rated' },
        { value: WorkshopQueryType.RankedByPublicationDate, label: 'Newest' },
    ];

    public readonly dayOptions = [
        { value: 1, label: 'Today' },
        { value: 7, label: 'One week' },
        { value: 90, label: 'Three months' },
        { value: 365, label: 'One year' },
    ];

    public constructor(
        private appCommon: AppCommonService,
    ) {}

    public async runSearch(page = 1): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.page = Math.max(1, page);
        try {
            this.result = await this.appCommon.searchWorkshop({
                search: this.search.trim() || undefined,
                // a text search is ranked by relevance; sorting only applies to browsing
                queryType: this.search.trim() ? undefined : this.sort,
                days: this.sort === WorkshopQueryType.RankedByTrend ? this.days : undefined,
                page: this.page,
            }).toPromise();
        } finally {
            this.busy = false;
        }
    }

    public get showDays(): boolean {
        return !this.search.trim() && this.sort === WorkshopQueryType.RankedByTrend;
    }

    public get noApiKey(): boolean {
        return this.result?.error === 'no-api-key';
    }

    public get failed(): boolean {
        return this.result?.error === 'request-failed';
    }

    public isAdded(id: string): boolean {
        return this.addedIds.includes(id);
    }

    public totalPages(perPage = 30): number {
        return Math.max(1, Math.ceil((this.result?.total || 0) / perPage));
    }

    public workshopUrl(id: string): string {
        return `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
    }

}
