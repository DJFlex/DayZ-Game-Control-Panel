import { Injectable } from '@angular/core';
import { AuditEvent, MetricTypeEnum } from '../../app-common/models';
import { AppCommonService } from '../../app-common/services/app-common.service';
import { SortDirection } from '../../players/directives/sortable.directive';
import { BehaviorSubject, Observable, of, Subject, Subscription } from 'rxjs';
import { debounceTime, delay, switchMap, tap } from 'rxjs/operators';

interface SearchResult {
    audits: AuditEvent[];
    total: number;
}

interface State {
    page: number;
    pageSize: number;
    searchTerm: string;
    /** Exact `value.resource` to keep; '' means every action. */
    actionFilter: string;
    sortColumn: 'timestamp';
    sortDirection: SortDirection;
}

const compare = (v1: number | string, v2: number | string): -1 | 1 | 0 => {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
};

const sort = (audits: AuditEvent[], column: 'timestamp', direction: string): AuditEvent[] => {
    if (direction === '') {
        return audits;
    }
    return [...audits].sort((a, b) => {
        const res = compare(a[column], b[column]);
        return direction === 'asc' ? res : -res;
    });
};

const matches = (audit: AuditEvent, term: string): boolean => {
    return (
        audit.user?.toLowerCase()?.includes(term.toLowerCase())
        || audit.value?.resource?.toLowerCase()?.includes(term.toLowerCase())
    );
};

@Injectable({ providedIn: 'root' })
export class AuditService {

    protected _loading$ = new BehaviorSubject<boolean>(true);
    protected _search$ = new Subject<void>();
    protected _audits$ = new BehaviorSubject<AuditEvent[]>([]);
    protected _total$ = new BehaviorSubject<number>(0);
    /** Every action seen in the log, for the filter dropdown. */
    protected _actions$ = new BehaviorSubject<string[]>([]);

    protected _state: State = {
        page: 1,
        pageSize: 4,
        searchTerm: '',
        actionFilter: '',
        sortColumn: 'timestamp',
        sortDirection: '',
    };

    protected currentAudits: AuditEvent[] = [];
    protected sub!: Subscription;

    public constructor(
        protected appCommon: AppCommonService,
    ) {

        this.listenToPlayerChanges();

        this._search$
            .pipe(
                tap(() => this._loading$.next(true)),
                debounceTime(120),
                switchMap(() => this._search()),
                delay(120),
                tap(() => this._loading$.next(false)),
            )
            .subscribe((result) => {
                this._audits$.next(result.audits);
                this._total$.next(result.total);
            });

        this._search$.next();
    }

    protected listenToPlayerChanges(): void {
        this.sub = this.appCommon.getApiFetcher<
        MetricTypeEnum.AUDIT,
        AuditEvent
        >(MetricTypeEnum.AUDIT).data.subscribe(
            (audits) => {
                if (audits?.length) {
                    this.currentAudits = audits;
                    this._actions$.next(
                        Array.from(new Set(
                            audits
                                .map((x) => x.value?.resource)
                                .filter((x): x is string => !!x),
                        )).sort(),
                    );
                    this._search$.next();
                }
            },
        );
    }

    public get actions$(): Observable<string[]> {
        return this._actions$.asObservable();
    }

    public get audits$(): Observable<AuditEvent[]> {
        return this._audits$.asObservable();
    }

    public get total$(): Observable<number> {
        return this._total$.asObservable();
    }

    public get loading$(): Observable<boolean> {
        return this._loading$.asObservable();
    }

    public get page(): number {
        return this._state.page;
    }

    public set page(page: number) {
        this._set({ page });
    }

    public get pageSize(): number {
        return this._state.pageSize;
    }

    public set pageSize(pageSize: number) {
        this._set({ pageSize });
    }

    public get searchTerm(): string {
        return this._state.searchTerm;
    }

    public set searchTerm(searchTerm: string) {
        // back to page 1: the old page number is usually out of range now
        this._set({ searchTerm, page: 1 });
    }

    public get actionFilter(): string {
        return this._state.actionFilter;
    }

    public set actionFilter(actionFilter: string) {
        this._set({ actionFilter, page: 1 });
    }

    // eslint-disable-next-line accessor-pairs
    public set sortColumn(sortColumn: 'timestamp') {
        this._set({ sortColumn });
    }

    // eslint-disable-next-line accessor-pairs
    public set sortDirection(sortDirection: SortDirection) {
        this._set({ sortDirection });
    }

    protected _set(patch: Partial<State>): void {
        Object.assign(this._state, patch);
        this._search$.next();
    }

    protected _search(): Observable<SearchResult> {
        const { sortColumn, sortDirection, pageSize, page, searchTerm, actionFilter } = this._state;

        // 1. sort
        let audits = sort(this.currentAudits, sortColumn, sortDirection);

        // 2. filter
        audits = audits.filter((audit) => {
            if (actionFilter && audit.value?.resource !== actionFilter) {
                return false;
            }
            return matches(audit, searchTerm);
        });
        const total = audits.length;

        // 3. paginate
        audits = audits.slice((page - 1) * pageSize, ((page - 1) * pageSize) + pageSize);
        return of({ audits, total });
    }

}
