import { Component, OnInit } from '@angular/core';
import { MissionFilesService } from '../../services/mission-files.service';

@Component({
    selector: 'sb-file-editor',
    templateUrl: './file-editor.component.html',
    styleUrls: ['file-editor.component.scss'],
})
export class FileEditorComponent implements OnInit {

    // Current directory relative to the mission root ('' = root).
    public cwd = '';
    public entries: string[] = [];
    public loadingDir = false;

    // Open file (relative path) + its editable content.
    public openFile?: string;
    public content = '';
    public dirty = false;
    public loadingFile = false;
    public saving = false;
    public backupOnSave = false;

    public outcome?: { message: string; success: boolean };

    public constructor(
        private files: MissionFilesService,
    ) {}

    public ngOnInit(): void {
        void this.loadDir('');
    }

    public get breadcrumbs(): string[] {
        return this.cwd ? this.cwd.split('/').filter(Boolean) : [];
    }

    public isDir(entry: string): boolean {
        return entry.endsWith('/');
    }

    public join(...parts: string[]): string {
        return parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/');
    }

    public async loadDir(dir: string): Promise<void> {
        this.loadingDir = true;
        try {
            const list = await this.files.readDir(dir);
            this.entries = list.sort((a, b) => {
                const ad = this.isDir(a);
                const bd = this.isDir(b);
                if (ad !== bd) {
                    return ad ? -1 : 1;
                }
                return a.localeCompare(b);
            });
            this.cwd = dir;
        } finally {
            this.loadingDir = false;
        }
    }

    public up(): void {
        if (!this.cwd) {
            return;
        }
        const parts = this.cwd.split('/').filter(Boolean);
        parts.pop();
        void this.loadDir(parts.join('/'));
    }

    public goTo(index: number): void {
        void this.loadDir(this.breadcrumbs.slice(0, index + 1).join('/'));
    }

    public openEntry(entry: string): void {
        if (this.isDir(entry)) {
            void this.loadDir(this.join(this.cwd, entry.slice(0, -1)));
        } else {
            void this.open(this.join(this.cwd, entry));
        }
    }

    public async open(file: string): Promise<void> {
        if (!this.confirmDiscard()) {
            return;
        }
        this.loadingFile = true;
        this.outcome = undefined;
        try {
            const c = await this.files.readFile(file);
            if (c === null) {
                this.outcome = { message: `Could not open ${file} (empty file, not text, or unreadable).`, success: false };
                return;
            }
            this.openFile = file;
            this.content = c;
            this.dirty = false;
        } finally {
            this.loadingFile = false;
        }
    }

    public onContentChange(): void {
        this.dirty = true;
    }

    public async save(): Promise<void> {
        if (!this.openFile || this.saving) {
            return;
        }
        if (!this.content) {
            // The manager refuses to write empty content; surface that here.
            this.outcome = { message: 'Refusing to save an empty file.', success: false };
            return;
        }
        this.saving = true;
        try {
            const ok = await this.files.writeFile(this.openFile, this.content, this.backupOnSave);
            if (ok) {
                this.dirty = false;
                this.outcome = {
                    message: `Saved ${this.openFile}${this.backupOnSave ? ' (mpmissions backed up first)' : ''}.`,
                    success: true,
                };
            } else {
                this.outcome = { message: `Failed to save ${this.openFile}.`, success: false };
            }
        } finally {
            this.saving = false;
        }
    }

    public close(): void {
        if (!this.confirmDiscard()) {
            return;
        }
        this.openFile = undefined;
        this.content = '';
        this.dirty = false;
    }

    private confirmDiscard(): boolean {
        if (!this.dirty) {
            return true;
        }
        // eslint-disable-next-line no-alert, no-undef
        return confirm('You have unsaved changes. Discard them?');
    }

}
