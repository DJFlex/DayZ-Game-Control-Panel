import {
    ChangeDetectorRef,
    Component,
    Input,
    OnInit,
    QueryList,
    ViewChildren,
} from '@angular/core';
import { AuditEvent } from '../../../app-common/models';
import { AuditService } from '../../services/audit.service';
import { SBSortableHeaderDirective, SortEvent } from '../../../players/directives/sortable.directive';
import { Observable } from 'rxjs';

@Component({
    selector: 'sb-audit-table',
    templateUrl: './audit-table.component.html',
    styleUrls: ['audit-table.component.scss'],
})
export class AuditTableComponent implements OnInit {

    public readonly MAX_ITEMS = 9999999;

    @Input() public pageSize = this.MAX_ITEMS;

    public audits$!: Observable<AuditEvent[]>;
    public total$!: Observable<number>;
    public sortedColumn!: string;
    public sortedDirection!: string;

    @ViewChildren(SBSortableHeaderDirective) public headers!: QueryList<SBSortableHeaderDirective>;

    public constructor(
        public auditService: AuditService,
        private changeDetectorRef: ChangeDetectorRef,
    ) {}

    public ngOnInit(): void {
        this.auditService.pageSize = this.pageSize;
        this.audits$ = this.auditService.audits$;
        this.total$ = this.auditService.total$;
    }

    public onSort({ column, direction }: any): void {
        if (column === 'timestamp') {
            this.sortedColumn = column;
            this.sortedDirection = direction;
            this.auditService.sortColumn = column;
            this.auditService.sortDirection = direction;
            this.changeDetectorRef.detectChanges();
        }
    }

    public mapTrigger(accept?: string): string {
        if (accept?.includes('json')) {
            return 'API/Web';
        } else if (accept?.includes('text')) {
            return 'Discord';
        }
        return 'Unknown';
    }

    /** Colour class for the action badge, by action type. */
    public actionClass(resource?: string): string {
        const r = (resource || '').toLowerCase();
        if (/(restart|shutdown|kick|ban|lock)/.test(r)) { return 'a-bad'; }
        if (r.includes('backup')) { return 'a-ok'; }
        if (/(global|message|rcon|command|write)/.test(r)) { return 'a-blue'; }
        return 'a-neutral';
    }

    /** "readprofilefiles" -> "READ PROFILE FILES" is left to the data; just upper-case + spaced camelCase. */
    public actionLabel(resource?: string): string {
        return (resource || '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    }

}
