import { AfterViewInit, Component, HostListener, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { LogMessage, LogType } from '../../../app-common/models';
import { Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ApiFetcher, AppCommonService } from '../../../../modules/app-common/services/app-common.service';

@Component({
    selector: 'sb-log-monitor',
    templateUrl: './log-monitor.component.html',
    styleUrls: ['./log-monitor.component.scss'],
})
export class LogMonitorComponent implements OnInit, OnDestroy, AfterViewInit {

    public title: string = 'Logs';
    @ViewChild('scrollView') public container!: any;
    public itemSize = 1;
    public lockToEnd: boolean = true;

    /** Everything we hold; `messages` is the filtered view the list renders. */
    public allMessages: LogMessage[] = [];
    public messages: LogMessage[] = [];
    public sub?: Subscription;

    public filterText: string = '';
    public errorsOnly: boolean = false;

    public errorCount: number = 0;
    public warnCount: number = 0;

    private logType?: LogType;

    public constructor(
        private zone: NgZone,
        private appCommon: AppCommonService,
        private route: ActivatedRoute,
    ) {}

    private getFetcher(type: LogType): ApiFetcher<LogType, LogMessage> {
        return this.appCommon.getApiFetcher<LogType, LogMessage>(type);
    }

    public ngOnInit(): void {

        const logType = this.route.snapshot.data['logType'] as LogType;
        if (!logType) return;

        this.logType = logType;
        this.title = this.route.snapshot.data['title'];
        const logFetcher = this.getFetcher(logType);

        this.allMessages = [...(logFetcher.snapshot ?? [])];
        this.allMessages.forEach((x) => this.countSeverity(x));
        this.applyFilter();
        this.scrollToBottom();
        this.sub = logFetcher.dataInserted.subscribe(
            (x) => {
                this.allMessages = [...this.allMessages, x];
                this.countSeverity(x);
                // append instead of re-filtering the whole buffer per line
                if (this.passesFilter(x)) {
                    this.messages = [...this.messages, x];
                }
                this.scrollToBottom();
            },
            console.error,
        );
    }

    public ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
            this.sub = undefined;
        }
    }

    public ngAfterViewInit(): void {
        this.scrollToBottom();
    }

    private scrollToBottom(force?: boolean): void {
        if (!this.container?.elementRef?.nativeElement || (!this.lockToEnd && !force)) return;
        const { scrollHeight } = this.container.elementRef.nativeElement;
        this.container.elementRef.nativeElement.scrollTop = scrollHeight;
        this.zone.run(() => {
            setTimeout(() => {
                if (this.container.elementRef.nativeElement.scrollHeight !== scrollHeight) {
                    this.scrollToBottom();
                }
            }, 1000);
        });
    }

    public toggleLock(): void {
        this.lockToEnd = !this.lockToEnd;
        if (this.lockToEnd) {
            this.scrollToBottom();
        }
    }

    /** Follow again and jump, whatever the switch was set to. */
    public jumpToLatest(): void {
        this.lockToEnd = true;
        this.scrollToBottom(true);
    }

    // ---- filtering ----------------------------------------------------------

    private passesFilter(log: LogMessage): boolean {
        if (this.errorsOnly && this.severityClass(log.message) !== 'msg-err') {
            return false;
        }
        const term = this.filterText.trim().toLowerCase();
        return !term || (log.message || '').toLowerCase().includes(term);
    }

    public applyFilter(): void {
        if (!this.filterText.trim() && !this.errorsOnly) {
            // no copy needed - nothing is filtered out
            this.messages = this.allMessages;
        } else {
            this.messages = this.allMessages.filter((x) => this.passesFilter(x));
        }
        this.scrollToBottom(true);
    }

    public toggleErrorsOnly(): void {
        this.errorsOnly = !this.errorsOnly;
        this.applyFilter();
    }

    public clearFilter(): void {
        this.filterText = '';
        this.errorsOnly = false;
        this.applyFilter();
    }

    public get filtered(): boolean {
        return !!this.filterText.trim() || this.errorsOnly;
    }

    // ---- download -----------------------------------------------------------

    /**
     * Saves the lines currently held in the browser (the whole fetched history,
     * narrowed by the filter if one is set) - not the file on the server's disk.
     */
    public download(): void {
        const body = this.messages.map((x) => x.message).join('\r\n');
        const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(this.logType || 'log').toLowerCase()}-log.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    @HostListener('window:resize')
    public onResize(): void {
        // console.warn('test', this.container);
    }

    /** Severity CSS class from a log line's content (existing dark-theme colours). */
    public severityClass(msg?: string): string {
        const m = msg || '';
        if (/\(E\)|ERROR|Error:|error:|Exception/.test(m)) { return 'msg-err'; }
        if (/!!!|\(W\)|[Ww]arning|WARN/.test(m)) { return 'msg-warn'; }
        if (/successfully|Mission read|Connected/.test(m)) { return 'msg-success'; }
        return '';
    }

    private countSeverity(log: LogMessage): void {
        const cls = this.severityClass(log.message);
        if (cls === 'msg-err') { this.errorCount++; }
        if (cls === 'msg-warn') { this.warnCount++; }
    }

    /** Leading `HH:MM:SS.mmm` of a DayZ log line, so it can be dimmed. */
    public leadTime(msg?: string): string {
        return /^\s*(\d{1,2}:\d{2}:\d{2}(\.\d+)?)/.exec(msg || '')?.[1] ?? '';
    }

    public restOfLine(msg?: string): string {
        const lead = this.leadTime(msg);
        return lead ? (msg || '').replace(lead, '') : (msg || '');
    }

}
