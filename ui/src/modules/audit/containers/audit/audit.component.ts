import { Component, OnInit } from '@angular/core';
import { AuditService } from '../../services/audit.service';

@Component({
    selector: 'sb-audit',
    templateUrl: './audit.component.html',
    styleUrls: ['audit.component.scss'],
})
export class AuditComponent implements OnInit {

    public constructor(
        public auditService: AuditService,
    ) {}

    public ngOnInit(): void {
        // ignore
    }

    /** "readprofilefiles" -> "READ PROFILE FILES" (same rule as the badges). */
    public actionLabel(resource?: string): string {
        return (resource || '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    }

}
